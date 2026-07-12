import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import storage

router = APIRouter()
_STORE = "todos"
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_VALID_PERSONS = {"bene", "sebi", "mama", "papa"}


class NewTodo(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    assignee: str | None = Field(default=None)
    due: str | None = Field(default=None, description="YYYY-MM-DD")


class PatchTodo(BaseModel):
    done: bool


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _migrate(it: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": it.get("id") or uuid.uuid4().hex[:8],
        "title": it.get("title", ""),
        "assignee": it.get("assignee") if it.get("assignee") in _VALID_PERSONS else None,
        "due": it.get("due"),
        "done": bool(it.get("done", False)),
        "createdAt": it.get("createdAt", _now_iso()),
        "doneAt": it.get("doneAt"),
    }


async def _load() -> list[dict[str, Any]]:
    data = await storage.load(_STORE, {"items": []})
    return [_migrate(it) for it in data.get("items", [])]


async def _save(items: list[dict[str, Any]]) -> None:
    await storage.save(_STORE, {"items": items})


@router.get("")
async def list_todos() -> dict[str, Any]:
    items = await _load()
    return {"items": items}


@router.post("")
async def add_todo(t: NewTodo) -> dict[str, Any]:
    if t.assignee is not None and t.assignee not in _VALID_PERSONS:
        raise HTTPException(status_code=400, detail=f"unknown assignee: {t.assignee}")
    if t.due is not None and not _DATE_RE.match(t.due):
        raise HTTPException(status_code=400, detail="due must be YYYY-MM-DD")
    items = await _load()
    new = {
        "id": uuid.uuid4().hex[:8],
        "title": t.title.strip(),
        "assignee": t.assignee,
        "due": t.due,
        "done": False,
        "createdAt": _now_iso(),
        "doneAt": None,
    }
    items.append(new)
    await _save(items)
    return new


@router.patch("/{todo_id}")
async def patch_todo(todo_id: str, patch: PatchTodo) -> dict[str, Any]:
    items = await _load()
    found = next((x for x in items if x["id"] == todo_id), None)
    if found is None:
        raise HTTPException(status_code=404, detail="not found")
    found["done"] = patch.done
    found["doneAt"] = _now_iso() if patch.done else None
    await _save(items)
    return found


@router.delete("/{todo_id}")
async def delete_todo(todo_id: str) -> dict[str, str]:
    items = await _load()
    before = len(items)
    items = [x for x in items if x["id"] != todo_id]
    if len(items) == before:
        raise HTTPException(status_code=404, detail="not found")
    await _save(items)
    return {"deleted": todo_id}


@router.post("/clear-done")
async def clear_done() -> dict[str, int]:
    items = await _load()
    remaining = [x for x in items if not x["done"]]
    removed = len(items) - len(remaining)
    await _save(remaining)
    return {"removed": removed}
