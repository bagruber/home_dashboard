import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import storage
from app.config import settings

router = APIRouter()
_STORE = "parcels"

# Supported carrier IDs. Tracking-page URL templates so the widget can deep-link to the
# carrier's website regardless of whether automatic refresh is implemented.
Carrier = Literal["dhl", "hermes", "dpd", "ups", "gls", "amazon", "other"]
_TRACKING_URLS: dict[str, str] = {
    "dhl": "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode={tn}",
    "hermes": "https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation/#{tn}",
    "dpd": "https://tracking.dpd.de/status/de_DE/parcel/{tn}",
    "ups": "https://www.ups.com/track?tracknum={tn}",
    "gls": "https://gls-group.eu/DE/de/paketverfolgung?match={tn}",
    "amazon": "https://track.amazon.de/tracking/{tn}",
    "other": "",
}

ParcelStatus = Literal["unknown", "in_transit", "out_for_delivery", "delivered", "exception"]
_REFRESH_LOCK = asyncio.Lock()


class NewParcel(BaseModel):
    trackingNumber: str = Field(..., min_length=4, max_length=60)
    carrier: Carrier = "dhl"
    label: str | None = Field(default=None, max_length=120)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tracking_url(carrier: str, tn: str) -> str | None:
    tpl = _TRACKING_URLS.get(carrier, "")
    return tpl.format(tn=tn) if tpl else None


def _migrate(p: dict[str, Any]) -> dict[str, Any]:
    carrier = p.get("carrier") or "other"
    tn = p.get("trackingNumber", "")
    return {
        "id": p.get("id") or uuid.uuid4().hex[:8],
        "trackingNumber": tn,
        "carrier": carrier,
        "label": p.get("label"),
        "createdAt": p.get("createdAt", _now_iso()),
        "lastChecked": p.get("lastChecked"),
        "status": p.get("status", "unknown"),
        "lastEvent": p.get("lastEvent"),
        "estimatedDelivery": p.get("estimatedDelivery"),
        "url": _tracking_url(carrier, tn),
    }


async def _load() -> list[dict[str, Any]]:
    data = await storage.load(_STORE, {"items": []})
    return [_migrate(p) for p in data.get("items", [])]


async def _save(items: list[dict[str, Any]]) -> None:
    # Strip the derived `url` before persisting.
    serialisable = [{k: v for k, v in p.items() if k != "url"} for p in items]
    await storage.save(_STORE, {"items": serialisable})


@router.get("")
async def list_parcels(refresh: bool = False) -> dict[str, Any]:
    items = await _load()
    if refresh:
        await _refresh_due(items)
        await _save(items)
        items = [_migrate(p) for p in items]
    return {"items": items, "dhlConfigured": bool(settings.dhl_api_key)}


@router.post("")
async def add_parcel(parcel: NewParcel) -> dict[str, Any]:
    items = await _load()
    new = {
        "id": uuid.uuid4().hex[:8],
        "trackingNumber": parcel.trackingNumber.strip(),
        "carrier": parcel.carrier,
        "label": (parcel.label or "").strip() or None,
        "createdAt": _now_iso(),
        "lastChecked": None,
        "status": "unknown",
        "lastEvent": None,
        "estimatedDelivery": None,
    }
    items.append(new)
    # Try to fetch initial status immediately if the carrier supports it.
    await _refresh_one(new, force=True)
    await _save(items)
    return _migrate(new)


@router.delete("/{parcel_id}")
async def delete_parcel(parcel_id: str) -> dict[str, str]:
    items = await _load()
    before = len(items)
    items = [p for p in items if p["id"] != parcel_id]
    if len(items) == before:
        raise HTTPException(status_code=404, detail="not found")
    await _save(items)
    return {"deleted": parcel_id}


@router.post("/{parcel_id}/refresh")
async def refresh_parcel(parcel_id: str) -> dict[str, Any]:
    items = await _load()
    found = next((p for p in items if p["id"] == parcel_id), None)
    if found is None:
        raise HTTPException(status_code=404, detail="not found")
    await _refresh_one(found, force=True)
    await _save(items)
    return _migrate(found)


# ──────────────────────────── refresh logic ────────────────────────────

async def _refresh_due(items: list[dict[str, Any]]) -> None:
    threshold = settings.parcel_min_refresh_seconds
    now = datetime.now(timezone.utc)
    to_refresh: list[dict[str, Any]] = []
    for p in items:
        if p["status"] == "delivered":
            continue
        last = p.get("lastChecked")
        if last:
            try:
                age = (now - datetime.fromisoformat(last)).total_seconds()
                if age < threshold:
                    continue
            except ValueError:
                pass
        to_refresh.append(p)
    if not to_refresh:
        return
    async with _REFRESH_LOCK:
        # Serial to be polite to upstream APIs; the volume is small.
        for p in to_refresh:
            await _refresh_one(p, force=False)


async def _refresh_one(parcel: dict[str, Any], force: bool) -> None:
    if parcel["carrier"] == "dhl":
        await _refresh_dhl(parcel, force=force)
    # Other carriers: storage-only for now (no public free tracking API).


async def _refresh_dhl(parcel: dict[str, Any], force: bool) -> None:
    if not settings.dhl_api_key:
        return
    tn = parcel["trackingNumber"]
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://api-eu.dhl.com/track/shipments",
                params={"trackingNumber": tn, "language": "de"},
                headers={"DHL-API-Key": settings.dhl_api_key},
            )
    except httpx.HTTPError:
        return
    if resp.status_code == 404:
        parcel["status"] = "unknown"
        parcel["lastChecked"] = _now_iso()
        return
    if resp.status_code != 200:
        return
    data = resp.json()
    shipments = data.get("shipments") or []
    if not shipments:
        parcel["status"] = "unknown"
        parcel["lastChecked"] = _now_iso()
        return
    s = shipments[0]
    status_code = ((s.get("status") or {}).get("statusCode") or "").lower()
    parcel["status"] = _map_dhl_status(status_code)
    parcel["estimatedDelivery"] = s.get("estimatedTimeOfDelivery")
    events = s.get("events") or []
    if events:
        latest = events[0]
        location_dict = (latest.get("location") or {}).get("address") or {}
        parcel["lastEvent"] = {
            "timestamp": latest.get("timestamp"),
            "location": location_dict.get("addressLocality"),
            "text": latest.get("description") or latest.get("status"),
        }
    parcel["lastChecked"] = _now_iso()


def _map_dhl_status(code: str) -> str:
    if code == "delivered":
        return "delivered"
    if code in ("transit", "pre-transit"):
        return "in_transit"
    if code in ("out for delivery", "out-for-delivery", "delivery"):
        return "out_for_delivery"
    if code in ("exception", "failure"):
        return "exception"
    return "unknown"
