"""17TRACK v2.4 client — multi-carrier parcel tracking.

Free tier: one-time quota of ~200 tracking numbers, auto carrier detection,
covers DHL/Hermes/DPD/GLS/UPS/Amazon. Numbers must be registered once before
they can be queried; registering consumes quota, so it only happens when a
parcel is added (deletes call /deletetrack to keep the account tidy).
Every function is a no-op / empty result when no API key is configured or
the upstream is unreachable — the widget then falls back to deep links.
"""
from __future__ import annotations

from typing import Any

import httpx

from app.config import settings

_BASE = "https://api.17track.net/track/v2.4"
_ALREADY_REGISTERED = -18019901
# gettrackinfo accepts at most 40 numbers per call — far above household volume.
MAX_BATCH = 40


def configured() -> bool:
    return bool(settings.seventeentrack_api_key)


async def _post(path: str, payload: list[dict[str, Any]]) -> dict[str, Any] | None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{_BASE}{path}",
                json=payload,
                headers={"17token": settings.seventeentrack_api_key or ""},
            )
    except httpx.HTTPError:
        return None
    if resp.status_code != 200:
        return None
    try:
        return resp.json()
    except ValueError:
        return None


async def register(numbers: list[str]) -> set[str]:
    """Register numbers for tracking. Returns the ones that are now registered
    (treating 'already registered' as success)."""
    if not configured() or not numbers:
        return set()
    data = await _post("/register", [{"number": n} for n in numbers])
    if data is None:
        return set()
    body = data.get("data") or {}
    ok = {a.get("number") for a in body.get("accepted") or []}
    for r in body.get("rejected") or []:
        if (r.get("error") or {}).get("code") == _ALREADY_REGISTERED:
            ok.add(r.get("number"))
    return {n for n in ok if n}


async def get_track_info(numbers: list[str]) -> dict[str, dict[str, Any]]:
    """Fetch tracking status for registered numbers. Returns number -> simplified info."""
    if not configured() or not numbers:
        return {}
    data = await _post("/gettrackinfo", [{"number": n} for n in numbers[:MAX_BATCH]])
    if data is None:
        return {}
    out: dict[str, dict[str, Any]] = {}
    for a in (data.get("data") or {}).get("accepted") or []:
        number = a.get("number")
        if number:
            out[number] = simplify(a.get("track_info") or {})
    return out


async def delete(numbers: list[str]) -> None:
    """Best-effort removal so deleted parcels stop counting against the account."""
    if not configured() or not numbers:
        return
    await _post("/deletetrack", [{"number": n} for n in numbers])


# 17TRACK status -> our ParcelStatus.
_STATUS_MAP = {
    "delivered": "delivered",
    "outfordelivery": "out_for_delivery",
    "availableforpickup": "available_for_pickup",
    "intransit": "in_transit",
    "inforeceived": "in_transit",
    "deliveryfailure": "exception",
    "exception": "exception",
    # NotFound / Expired fall through to "unknown".
}


def simplify(track_info: dict[str, Any]) -> dict[str, Any]:
    """Map a 17TRACK track_info object onto the parcel fields we store."""
    status_raw = ((track_info.get("latest_status") or {}).get("status") or "").lower()
    event = track_info.get("latest_event") or {}
    location = event.get("location")
    if isinstance(location, dict):
        location = location.get("city") or location.get("country")

    metrics = (track_info.get("time_metrics") or {}).get("estimated_delivery_date") or {}
    eta = metrics.get("from") or metrics.get("to")

    last_event = None
    if event.get("description") or event.get("time_iso"):
        last_event = {
            "timestamp": event.get("time_iso"),
            "location": location,
            "text": event.get("description"),
        }
    return {
        "status": _STATUS_MAP.get(status_raw, "unknown"),
        "lastEvent": last_event,
        "estimatedDelivery": eta,
    }
