"""Departure board + real connections for Moosburg(Oberbay).

Data source: a db-rest instance (HAFAS proxy, configurable via settings).

Strategy: `/departures` renders the board; three small `/journeys` queries
(Moosburg → Freising / München Hbf / Landshut) supply *real* arrival times,
transfers and onward legs. Journeys are matched to board departures by the
tripId of their first leg, so no hand-maintained travel-time tables are needed.
Every enrichment is best-effort: if a journeys call fails, the board still
renders, just without arrival times.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import httpx
from fastapi import APIRouter, HTTPException, Query

from app import transitous
from app.cache import TTLCache
from app.config import settings
from app.stations import clean_station_name
from app.trains_fixtures import FIXTURES

router = APIRouter()

# Manual refreshes bypass the TTL but never hit upstream more often than this.
_REFRESH_MIN_INTERVAL_SEC = 8.0
_JOURNEYS_CACHE_TTL_SEC = 60.0
_JOURNEYS_RESULTS = 6

# Transfer viability thresholds (minutes).
_TIGHT_TRANSFER_MIN = 3
_MIN_VIABLE_TRANSFER_MIN = 1

_departures_cache = TTLCache()
_journeys_cache = TTLCache()

_SOUTH_KEYWORDS = ("münchen", "muenchen", "freising", "pasing")
_NORTH_KEYWORDS = (
    "landshut",
    "passau",
    "regensburg",
    "plattling",
    "neufahrn (niederbay)",
    "straubing",
    "nürnberg",
    "nuernberg",
    "hof hbf",
    "hof (",
    # DELFI/Transitous headsigns can name the far terminus of the Regensburg
    # branch (e.g. "Schwandorf, ZOB am Bahnhof", "Weiden (Oberpf)").
    "schwandorf",
    "weiden",
    "cham (",
)



def _classify(direction: str | None) -> Literal["south", "north", "unknown"]:
    if not direction:
        return "unknown"
    d = direction.lower()
    if any(k in d for k in _SOUTH_KEYWORDS):
        return "south"
    if any(k in d for k in _NORTH_KEYWORDS):
        return "north"
    return "unknown"


def _terminates_at_freising(direction: str | None) -> bool:
    if not direction:
        return False
    d = direction.lower()
    return "freising" in d and "münchen" not in d and "muenchen" not in d


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        # Python 3.10's fromisoformat can't parse a 'Z' suffix.
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _shift_iso(s: str | None, delta: timedelta) -> str | None:
    parsed = _parse_iso(s)
    if parsed is None:
        return s
    return (parsed + delta).isoformat()


@router.get("/locations")
async def search_locations(query: str = Query(..., min_length=2)) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        resp = await client.get(
            f"{settings.db_rest_base_url}/locations",
            params={"query": query, "results": 8, "stops": "true", "addresses": "false", "poi": "false"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="upstream error")
    return resp.json()


@router.get("/departures")
async def departures(
    station_id: str | None = Query(default=None, alias="stationId"),
    duration: int = Query(default=60, ge=5, le=240),
    results: int = Query(default=12, ge=1, le=40),
    fixture: str | None = Query(default=None),
) -> dict[str, Any]:
    if fixture is not None:
        return {"stationId": "fixture", "departures": _rebase_to_now(_fixture_or_400(fixture))}
    sid = station_id or settings.default_station_id
    return await _cached_departures(sid, duration, results)


@router.get("/connections")
async def connections(
    duration: int = Query(default=120, ge=5, le=240),
    results: int = Query(default=20, ge=1, le=40),
    fixture: str | None = Query(default=None),
    fresh: bool = Query(default=False, description="bypass the small TTL cache"),
) -> dict[str, Any]:
    """Moosburg departures grouped by direction, enriched with real journey data."""
    if fixture is not None:
        payload = _group(_rebase_to_now(_fixture_or_400(fixture)))
        payload["fetchedAt"] = datetime.now(timezone.utc).isoformat()
        payload["source"] = "fixture"
        return payload

    source = "db-rest"
    board, freising_j, munich_j, landshut_j = await asyncio.gather(
        _cached_departures(settings.default_station_id, duration, results, fresh=fresh),
        _cached_journeys(settings.freising_station_id, fresh=fresh),
        _cached_journeys(settings.munich_station_id, fresh=fresh),
        _cached_journeys(settings.landshut_station_id, fresh=fresh),
        return_exceptions=True,
    )
    if isinstance(board, BaseException):
        # db-rest down (frequent since DB switched off HAFAS) — try Transitous.
        # Journeys must come from the same provider so tripIds line up.
        source = "transitous"
        board, freising_j, munich_j, landshut_j = await asyncio.gather(
            transitous.cached_departures(results),
            transitous.cached_journeys(settings.transitous_freising_id),
            transitous.cached_journeys(settings.transitous_munich_id),
            transitous.cached_journeys(settings.transitous_landshut_id),
            return_exceptions=True,
        )
    if isinstance(board, BaseException):
        raise board if isinstance(board, HTTPException) else HTTPException(status_code=502, detail="upstream error")

    grouped = _group(board["departures"], stale=board.get("stale", False))
    if not isinstance(freising_j, BaseException):
        _apply_waypoint_arrivals(grouped["south"], freising_j, "Freising")
    if not isinstance(munich_j, BaseException):
        _apply_terminus_journeys(grouped["south"], munich_j)
    if not isinstance(landshut_j, BaseException):
        _apply_waypoint_arrivals(grouped["north"], landshut_j, "Landshut")

    # Transitous aggregates multiple GTFS feeds that can contain the same train
    # twice under different tripIds. Dedupe after enrichment, keeping the entry
    # that got arrivals/connection data attached. Then drop trains that have
    # already left (cached boards can lag behind by up to the TTL).
    grouped["south"] = _drop_departed(_dedupe(grouped["south"]))
    grouped["north"] = _drop_departed(_dedupe(grouped["north"]))

    grouped["fetchedAt"] = board.get("fetchedAt") or datetime.now(timezone.utc).isoformat()
    grouped["source"] = source
    return grouped


def _dedupe(deps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    best: dict[tuple[Any, Any, str], dict[str, Any]] = {}
    for d in deps:
        key = (d.get("line"), d.get("plannedWhen"), (d.get("direction") or "").lower())
        cur = best.get(key)
        if cur is None or _richness(d) > _richness(cur):
            best[key] = d
    return sorted(best.values(), key=lambda d: d.get("plannedWhen") or "")


def _richness(d: dict[str, Any]) -> int:
    return (1 if d.get("arrivals") else 0) + (1 if d.get("connection") else 0)


def _drop_departed(deps: list[dict[str, Any]], grace_seconds: float = 90.0) -> list[dict[str, Any]]:
    cutoff = datetime.now(timezone.utc).timestamp() - grace_seconds
    out = []
    for d in deps:
        when = _parse_iso(d.get("when") or d.get("plannedWhen"))
        if when is None or when.timestamp() >= cutoff:
            out.append(d)
    return out


def _group(deps: list[dict[str, Any]], stale: bool = False) -> dict[str, Any]:
    south: list[dict[str, Any]] = []
    north: list[dict[str, Any]] = []
    for d in deps:
        # City buses share the station but not the widget ("Zolling, Freisinger
        # Straße" would even match the Freising keyword).
        if (d.get("product") or "").lower() == "bus":
            continue
        direction = clean_station_name(d.get("direction"))
        enriched = {
            **d,
            "direction": direction,
            "terminatesAtFreising": _terminates_at_freising(direction),
            "hasPowerSockets": d.get("hasPowerSockets", d.get("line") in settings.power_socket_lines),
            "hasWifi": d.get("hasWifi", d.get("line") in settings.wifi_lines),
        }
        match _classify(direction):
            case "south":
                south.append(enriched)
            case "north":
                north.append(enriched)
            case _:
                pass
    return {"south": south, "north": north, "stale": stale}


# ──────────────────────────── journeys enrichment ────────────────────────────

def _legs(journey: dict[str, Any]) -> list[dict[str, Any]]:
    return [l for l in (journey.get("legs") or []) if not l.get("walking")]


def _leg_delay_minutes(leg: dict[str, Any], key: str) -> int | None:
    delay = leg.get(key)
    return delay // 60 if delay is not None else None


def _arrival_entry(place: str, leg: dict[str, Any]) -> dict[str, Any]:
    planned = leg.get("plannedArrival")
    actual = leg.get("arrival") or planned
    return {
        "place": place,
        "time": actual,
        "plannedTime": planned if (planned and actual and planned != actual) else None,
    }


def _transfer_minutes(first: dict[str, Any], onward: dict[str, Any]) -> int | None:
    arr = _parse_iso(first.get("arrival") or first.get("plannedArrival"))
    dep = _parse_iso(onward.get("departure") or onward.get("plannedDeparture"))
    if arr is None or dep is None:
        return None
    return int((dep - arr).total_seconds() // 60)


def _connection_status(transfer: int | None, onward: dict[str, Any]) -> str:
    if onward.get("reachable") is False:
        return "missed"
    if transfer is None:
        return "ok"
    if transfer < _MIN_VIABLE_TRANSFER_MIN:
        return "missed"
    if transfer < _TIGHT_TRANSFER_MIN:
        return "tight"
    return "ok"


def _connection_from_leg(first: dict[str, Any], onward: dict[str, Any], final: dict[str, Any]) -> dict[str, Any]:
    line = onward.get("line") or {}
    transfer = _transfer_minutes(first, onward)
    dest = onward.get("destination") or {}
    return {
        "transferAt": clean_station_name((first.get("destination") or {}).get("name")),
        "line": line.get("name"),
        "product": line.get("product"),
        "direction": clean_station_name(onward.get("direction") or dest.get("name")),
        "plannedWhen": onward.get("plannedDeparture"),
        "when": onward.get("departure"),
        "delayMinutes": _leg_delay_minutes(onward, "departureDelay"),
        "platform": onward.get("departurePlatform") or onward.get("plannedDeparturePlatform"),
        "cancelled": bool(onward.get("cancelled", False)),
        "transferMinutes": transfer if transfer is not None else 0,
        "realTransferMinutes": transfer,
        "connectionStatus": _connection_status(transfer, onward),
        "arrival": final.get("arrival") or final.get("plannedArrival"),
    }


def _apply_waypoint_arrivals(deps: list[dict[str, Any]], journeys: list[dict[str, Any]], place: str) -> None:
    """Attach the arrival at a waypoint (Freising / Landshut) from direct journey legs."""
    arrivals_by_trip: dict[str, dict[str, Any]] = {}
    for j in journeys:
        legs = _legs(j)
        if len(legs) != 1:  # only the direct leg tells us when *this* train arrives there
            continue
        trip_id = legs[0].get("tripId")
        if trip_id and trip_id not in arrivals_by_trip:
            arrivals_by_trip[trip_id] = _arrival_entry(place, legs[0])
    for dep in deps:
        entry = arrivals_by_trip.get(dep.get("tripId") or "")
        if entry:
            dep.setdefault("arrivals", []).append(entry)


def _apply_terminus_journeys(deps: list[dict[str, Any]], journeys: list[dict[str, Any]]) -> None:
    """Attach terminus arrival + real onward connection from Moosburg→München journeys."""
    by_trip: dict[str, dict[str, Any]] = {}
    for j in journeys:
        legs = _legs(j)
        if not legs:
            continue
        trip_id = legs[0].get("tripId")
        if not trip_id:
            continue
        final = legs[-1]
        dest_name = clean_station_name((final.get("destination") or {}).get("name")) or "München Hbf"
        info: dict[str, Any] = {"terminusArrival": _arrival_entry(dest_name, final)}
        if len(legs) >= 2:
            info["connection"] = _connection_from_leg(legs[0], legs[1], final)
        existing = by_trip.get(trip_id)
        if existing is None:
            by_trip[trip_id] = info
        else:
            # Same feeder train, later onward leg: use it as the fallback suggestion
            # when the primary connection is not reachable any more.
            conn = existing.get("connection")
            alt = info.get("connection")
            if conn and alt and conn.get("connectionStatus") == "missed" and "alternativeWhen" not in conn:
                conn["alternativeWhen"] = alt.get("when") or alt.get("plannedWhen")
                conn["alternativeLine"] = alt.get("line")

    for dep in deps:
        info = by_trip.get(dep.get("tripId") or "")
        if not info:
            continue
        conn = info.get("connection")
        if conn:
            dep["connection"] = conn
        arrival = info["terminusArrival"]
        # Direct trains show the terminus arrival next to the Freising waypoint;
        # for Freising-terminating feeders the arrival lives on the onward leg instead.
        if conn is None and arrival.get("time"):
            dep.setdefault("arrivals", []).append(arrival)


# ──────────────────────────── upstream fetches ────────────────────────────

async def _cached_journeys(to_id: str, fresh: bool = False) -> list[dict[str, Any]]:
    key = to_id
    cached = _journeys_cache.get(key)
    if cached is not None and not fresh:
        return cached
    if cached is not None and fresh:
        age = _journeys_cache.age_seconds(key, _JOURNEYS_CACHE_TTL_SEC)
        if age is not None and age < _REFRESH_MIN_INTERVAL_SEC:
            return cached
    params = {
        "from": settings.default_station_id,
        "to": to_id,
        "results": _JOURNEYS_RESULTS,
        "stopovers": "false",
        "language": "de",
    }
    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            resp = await client.get(f"{settings.db_rest_base_url}/journeys", params=params)
    except httpx.TimeoutException:
        stale = _journeys_cache.get_stale(key)
        if stale is not None:
            return stale
        raise HTTPException(status_code=504, detail="journeys timeout")
    if resp.status_code != 200:
        stale = _journeys_cache.get_stale(key)
        if stale is not None:
            return stale
        raise HTTPException(status_code=502, detail=f"journeys status {resp.status_code}")
    data = resp.json()
    journeys = data.get("journeys") or []
    _journeys_cache.set(key, journeys, _JOURNEYS_CACHE_TTL_SEC)
    return journeys


async def _cached_departures(sid: str, duration: int, results: int, fresh: bool = False) -> dict[str, Any]:
    key = (sid, duration, results)
    ttl = settings.departures_cache_ttl_seconds
    cached = _departures_cache.get(key)
    if cached is not None and not fresh:
        return cached
    # Even when fresh=True, respect a hard floor so the upstream isn't hammered.
    if cached is not None and fresh:
        age = _departures_cache.age_seconds(key, ttl)
        if age is not None and age < _REFRESH_MIN_INTERVAL_SEC:
            return cached
    try:
        payload = await _fetch_departures(sid, duration, results)
    except HTTPException:
        stale = _departures_cache.get_stale(key)
        if stale is not None:
            return {**stale, "stale": True}
        raise
    payload["fetchedAt"] = datetime.now(timezone.utc).isoformat()
    _departures_cache.set(key, payload, ttl)
    return payload


async def _fetch_departures(sid: str, duration: int, results: int) -> dict[str, Any]:
    url = f"{settings.db_rest_base_url}/stops/{sid}/departures"
    params = {"duration": duration, "results": results, "language": "de"}

    last_status: int | None = None
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
                resp = await client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                raw = data.get("departures", data) if isinstance(data, dict) else data
                return {"stationId": sid, "departures": [_simplify(d) for d in raw]}
            last_status = resp.status_code
            if resp.status_code < 500:
                break
        except httpx.TimeoutException:
            last_status = 504
        if attempt == 0:
            await asyncio.sleep(1.0)

    raise HTTPException(status_code=502, detail=f"upstream status {last_status}")


def _simplify(dep: dict[str, Any]) -> dict[str, Any]:
    line = dep.get("line") or {}
    name = line.get("name")
    return {
        "tripId": dep.get("tripId"),
        "line": name,
        "product": line.get("product"),
        "direction": dep.get("direction"),
        "plannedWhen": dep.get("plannedWhen"),
        "when": dep.get("when"),
        "delayMinutes": (dep.get("delay") or 0) // 60 if dep.get("delay") is not None else None,
        "platform": dep.get("platform") or dep.get("plannedPlatform"),
        "cancelled": dep.get("cancelled", False),
    }


# ──────────────────────────── fixtures ────────────────────────────

def _fixture_or_400(name: str) -> list[dict[str, Any]]:
    if name not in FIXTURES:
        raise HTTPException(status_code=400, detail=f"unknown fixture: {name}")
    return [dict(d) for d in FIXTURES[name]]  # shallow copies; connection dicts copied below


def _rebase_to_now(deps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Shift every fixture timestamp so the earliest departure is ~5 min from now.

    Keeps the relative spacing between trains intact, so the 'in N min' countdown and
    delays behave realistically regardless of when the fixture was authored.
    """
    if not deps:
        return deps
    times = [_parse_iso(d.get("plannedWhen")) for d in deps]
    valid = [t for t in times if t is not None]
    if not valid:
        return deps
    anchor = min(valid)
    now = datetime.now(timezone.utc).astimezone(anchor.tzinfo)
    target = now + timedelta(minutes=5)
    delta = target - anchor

    shifted: list[dict[str, Any]] = []
    for d in deps:
        d2 = {**d}
        for k in ("plannedWhen", "when"):
            if d2.get(k):
                d2[k] = _shift_iso(d2[k], delta)
        if d2.get("arrivals"):
            d2["arrivals"] = [
                {"place": a["place"], "time": _shift_iso(a["time"], delta)} for a in d2["arrivals"]
            ]
        if d2.get("connection"):
            c = {**d2["connection"]}
            for k in ("plannedWhen", "when", "arrival"):
                if c.get(k):
                    c[k] = _shift_iso(c[k], delta)
            d2["connection"] = c
        shifted.append(d2)
    return shifted
