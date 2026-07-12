import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import ics, storage

router = APIRouter()
_STORE = "calendar"
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^\d{2}:\d{2}$")
_VALID_PERSONS = {"bene", "sebi", "mama", "papa"}


class NewEvent(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    date: str = Field(..., description="YYYY-MM-DD (local)")
    time: str | None = Field(default=None, description="HH:MM (optional)")
    persons: list[str] = Field(default_factory=list)
    blocksHouse: bool = Field(default=False)
    area: str | None = Field(default=None, max_length=80)


class IcsImport(BaseModel):
    ics: str = Field(..., min_length=1, max_length=200_000)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _migrate(ev: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": ev.get("id") or uuid.uuid4().hex[:8],
        "title": ev.get("title", ""),
        "date": ev.get("date"),
        "time": ev.get("time"),
        "persons": [p for p in ev.get("persons", []) if p in _VALID_PERSONS],
        "blocksHouse": bool(ev.get("blocksHouse", False)),
        "area": ev.get("area"),
        "createdAt": ev.get("createdAt", _now_iso()),
    }


def _sort_key(ev: dict[str, Any]) -> tuple[str, str]:
    return (ev.get("date") or "", ev.get("time") or "")


async def _load_events() -> list[dict[str, Any]]:
    data = await storage.load(_STORE, {"events": []})
    return [_migrate(ev) for ev in data.get("events", [])]


async def _save_events(events: list[dict[str, Any]]) -> None:
    await storage.save(_STORE, {"events": events})


def _validate_event(ev: NewEvent) -> tuple[list[str], str | None]:
    if not _DATE_RE.match(ev.date):
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    if ev.time is not None and not _TIME_RE.match(ev.time):
        raise HTTPException(status_code=400, detail="time must be HH:MM")
    bad = [p for p in ev.persons if p not in _VALID_PERSONS]
    if bad:
        raise HTTPException(status_code=400, detail=f"unknown persons: {bad}")
    area = ev.area.strip() if ev.area else None
    return ev.persons, (area or None)


@router.get("")
async def list_events() -> dict[str, Any]:
    events = await _load_events()
    return {"events": sorted(events, key=_sort_key)}


@router.post("")
async def add_event(ev: NewEvent) -> dict[str, Any]:
    persons, area = _validate_event(ev)
    events = await _load_events()
    new = {
        "id": uuid.uuid4().hex[:8],
        "title": ev.title.strip(),
        "date": ev.date,
        "time": ev.time,
        "persons": persons,
        "blocksHouse": ev.blocksHouse,
        "area": area,
        "createdAt": _now_iso(),
    }
    events.append(new)
    await _save_events(events)
    return new


@router.delete("/{event_id}")
async def delete_event(event_id: str) -> dict[str, str]:
    events = await _load_events()
    before = len(events)
    events = [ev for ev in events if ev["id"] != event_id]
    if len(events) == before:
        raise HTTPException(status_code=404, detail="not found")
    await _save_events(events)
    return {"deleted": event_id}


@router.post("/import")
async def import_ics(payload: IcsImport) -> dict[str, int]:
    parsed = ics.parse_events(payload.ics)
    if not parsed:
        return {"imported": 0}
    events = await _load_events()
    imported = 0
    for ev in parsed:
        if not ev.get("date") or not ev.get("title"):
            continue
        events.append(
            {
                "id": uuid.uuid4().hex[:8],
                "title": str(ev["title"])[:200].strip(),
                "date": ev["date"],
                "time": ev.get("time"),
                "persons": [],
                "blocksHouse": False,
                "area": None,
                "createdAt": _now_iso(),
            }
        )
        imported += 1
    await _save_events(events)
    return {"imported": imported}
