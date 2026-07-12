"""DWD weather warnings for the configured warncell (Landkreis Freising).

Source: the public warnapp JSON feed (JSONP-wrapped, no key required).
The dashboard only shows a banner when a warning is active, so failures
degrade to an empty list instead of an error.
"""
import json
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter

from app.cache import TTLCache
from app.config import settings

router = APIRouter()

_DWD_URL = "https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json"
_cache = TTLCache()
_KEY = "dwd"


@router.get("")
async def warnings() -> dict[str, Any]:
    cached = _cache.get(_KEY)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            resp = await client.get(_DWD_URL)
        resp.raise_for_status()
        data = _parse_jsonp(resp.text)
    except (httpx.HTTPError, ValueError):
        stale = _cache.get_stale(_KEY)
        if stale is not None:
            return {**stale, "stale": True}
        return {"warnings": [], "stale": True}

    cell = settings.dwd_warncell_id
    entries = (data.get("warnings") or {}).get(cell, [])
    pre = (data.get("vorabInformation") or {}).get(cell, [])
    payload = {
        "warnings": [_simplify(w) for w in entries] + [_simplify(w, pre_warning=True) for w in pre],
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "stale": False,
    }
    _cache.set(_KEY, payload, settings.dwd_cache_ttl_seconds)
    return payload


def _parse_jsonp(text: str) -> dict[str, Any]:
    start = text.find("(")
    end = text.rfind(")")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("unexpected DWD payload")
    return json.loads(text[start + 1 : end])


def _simplify(w: dict[str, Any], pre_warning: bool = False) -> dict[str, Any]:
    return {
        # DWD levels: 1 pre-warning, 2 yellow, 3 orange, 4 red, 5 violet.
        "level": w.get("level"),
        "event": w.get("event"),
        "headline": w.get("headline"),
        "description": (w.get("description") or "")[:500],
        "start": w.get("start"),  # epoch millis
        "end": w.get("end"),
        "preWarning": pre_warning,
    }
