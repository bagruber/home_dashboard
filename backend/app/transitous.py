"""Transitous (MOTIS) as fallback train-data provider.

Free community instance, no API key, GTFS + realtime. Used automatically when
the db-rest upstream fails. Everything is mapped into the same simplified
shapes the trains router already consumes:

- departures  -> the `_simplify`d db-rest departure dict
- itineraries -> journeys with db-rest-style legs, so the existing journey
  enrichment (`_apply_waypoint_arrivals` / `_apply_terminus_journeys`) works
  unchanged. tripIds are consistent between stoptimes and plan responses.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

import httpx
from fastapi import HTTPException

from app.cache import TTLCache
from app.config import settings

_DEPARTURES_TTL_SEC = 30.0
_JOURNEYS_TTL_SEC = 60.0
_JOURNEY_RESULTS = 6

_departures_cache = TTLCache()
_journeys_cache = TTLCache()

# routeShortName carries the train number in parens: "RE2 (4867)" -> "RE2".
_TRAIN_NUMBER_RE = re.compile(r"\s*\(\d+\)\s*$")
# Track names come in mixed forms ("Gl2", "Gleis 5", "1") — keep the bare number,
# the frontend adds the uniform "Gl." prefix.
_TRACK_PREFIX_RE = re.compile(r"^\s*(?:gleis|gl\.?)\s*", re.IGNORECASE)


def _clean_line(name: str | None) -> str | None:
    if not name:
        return None
    return _TRAIN_NUMBER_RE.sub("", name)


def _clean_track(track: str | None) -> str | None:
    if not track:
        return None
    return _TRACK_PREFIX_RE.sub("", track).strip() or None


def _norm_time(iso: str | None) -> str | None:
    """MOTIS returns '...Z' timestamps; Python 3.10's fromisoformat needs an offset."""
    if not iso:
        return None
    return iso.replace("Z", "+00:00")


def _delay_seconds(planned: str | None, actual: str | None, realtime: bool) -> int | None:
    if not realtime or not planned or not actual:
        return None
    try:
        p = datetime.fromisoformat(planned)
        a = datetime.fromisoformat(actual)
    except ValueError:
        return None
    return int((a - p).total_seconds())


async def _get(path: str, params: dict[str, Any]) -> Any:
    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        resp = await client.get(f"{settings.transitous_base_url}{path}", params=params)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"transitous status {resp.status_code}")
    return resp.json()


async def cached_departures(results: int) -> dict[str, Any]:
    key = ("departures", results)
    cached = _departures_cache.get(key)
    if cached is not None:
        return cached
    try:
        data = await _get(
            "/api/v1/stoptimes",
            {"stopId": settings.transitous_moosburg_id, "n": results},
        )
    except (httpx.HTTPError, HTTPException):
        stale = _departures_cache.get_stale(key)
        if stale is not None:
            return {**stale, "stale": True}
        raise HTTPException(status_code=502, detail="transitous unreachable")
    deps = [_map_stoptime(s) for s in data.get("stopTimes") or []]
    payload = {"stationId": settings.transitous_moosburg_id, "departures": deps}
    _departures_cache.set(key, payload, _DEPARTURES_TTL_SEC)
    return payload


async def cached_journeys(to_id: str) -> list[dict[str, Any]]:
    cached = _journeys_cache.get(to_id)
    if cached is not None:
        return cached
    try:
        data = await _get(
            "/api/v1/plan",
            {
                "fromPlace": settings.transitous_moosburg_id,
                "toPlace": to_id,
                "numItineraries": _JOURNEY_RESULTS,
            },
        )
    except (httpx.HTTPError, HTTPException):
        stale = _journeys_cache.get_stale(to_id)
        if stale is not None:
            return stale
        raise HTTPException(status_code=502, detail="transitous unreachable")
    journeys = [{"legs": [_map_leg(l) for l in it.get("legs") or []]} for it in data.get("itineraries") or []]
    _journeys_cache.set(to_id, journeys, _JOURNEYS_TTL_SEC)
    return journeys


def _map_stoptime(s: dict[str, Any]) -> dict[str, Any]:
    place = s.get("place") or {}
    planned = _norm_time(place.get("scheduledDeparture"))
    actual = _norm_time(place.get("departure")) or planned
    realtime = bool(s.get("realTime"))
    delay = _delay_seconds(planned, actual, realtime)
    return {
        "tripId": s.get("tripId"),
        "line": _clean_line(s.get("routeShortName")),
        "product": (s.get("mode") or "").lower(),
        "direction": s.get("headsign"),
        "plannedWhen": planned,
        "when": actual if realtime else planned,
        "delayMinutes": delay // 60 if delay is not None else None,
        "platform": _clean_track(place.get("track")),
        "cancelled": bool(s.get("cancelled", False)),
    }


def _map_leg(leg: dict[str, Any]) -> dict[str, Any]:
    if (leg.get("mode") or "").upper() == "WALK":
        return {"walking": True}
    frm = leg.get("from") or {}
    to = leg.get("to") or {}
    realtime = bool(leg.get("realTime"))
    planned_dep = _norm_time(frm.get("scheduledDeparture"))
    dep = _norm_time(frm.get("departure")) or planned_dep
    return {
        "tripId": leg.get("tripId"),
        "line": {"name": _clean_line(leg.get("routeShortName")), "product": (leg.get("mode") or "").lower()},
        "direction": leg.get("headsign"),
        "destination": {"name": to.get("name")},
        "plannedDeparture": planned_dep,
        "departure": dep if realtime else planned_dep,
        "departureDelay": _delay_seconds(planned_dep, dep, realtime),
        "plannedArrival": _norm_time(to.get("scheduledArrival")),
        "arrival": _norm_time(to.get("arrival")) if realtime else _norm_time(to.get("scheduledArrival")),
        "departurePlatform": _clean_track(frm.get("track")),
        "cancelled": bool(leg.get("cancelled", False)),
    }
