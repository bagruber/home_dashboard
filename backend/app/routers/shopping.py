import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import storage

router = APIRouter()
_STORE = "shopping"
_BOUGHT_VISIBLE_HOURS = 24


class NewItem(BaseModel):
    product: str = Field(..., min_length=1, max_length=120)
    amount: str | None = Field(default=None, max_length=60)


class PatchItem(BaseModel):
    bought: bool


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _migrate_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert any v1 entries ({'text': ...}) into the current shape in place."""
    out: list[dict[str, Any]] = []
    for it in items:
        if "product" not in it and "text" in it:
            out.append(
                {
                    "id": it.get("id") or uuid.uuid4().hex[:8],
                    "product": it["text"],
                    "amount": None,
                    "bought": False,
                    "createdAt": it.get("createdAt", _now_iso()),
                    "boughtAt": None,
                }
            )
        else:
            out.append(
                {
                    "id": it.get("id") or uuid.uuid4().hex[:8],
                    "product": it.get("product", ""),
                    "amount": it.get("amount"),
                    "bought": bool(it.get("bought", False)),
                    "createdAt": it.get("createdAt", _now_iso()),
                    "boughtAt": it.get("boughtAt"),
                }
            )
    return out


def _sort_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Unbought items first (oldest at top); then bought items (most recently ticked first)."""
    unbought = sorted([it for it in items if not it["bought"]], key=lambda it: it["createdAt"])
    bought = sorted(
        [it for it in items if it["bought"]],
        key=lambda it: it.get("boughtAt") or "",
        reverse=True,
    )
    return unbought + bought


def _prune_stale_bought(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Hide bought items that have been ticked off for too long. Storage keeps them."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=_BOUGHT_VISIBLE_HOURS)
    out: list[dict[str, Any]] = []
    for it in items:
        if not it["bought"]:
            out.append(it)
            continue
        b = it.get("boughtAt")
        if not b:
            out.append(it)
            continue
        try:
            if datetime.fromisoformat(b) >= cutoff:
                out.append(it)
        except ValueError:
            out.append(it)
    return out


async def _load_items() -> list[dict[str, Any]]:
    data = await storage.load(_STORE, {"items": []})
    items = _migrate_items(data.get("items", []))
    return items


async def _save_items(items: list[dict[str, Any]]) -> None:
    await storage.save(_STORE, {"items": items})


@router.get("")
async def list_items() -> dict[str, Any]:
    items = await _load_items()
    visible = _prune_stale_bought(items)
    return {"items": _sort_items(visible)}


@router.post("")
async def add_item(item: NewItem) -> dict[str, Any]:
    product = item.product.strip()
    if not product:
        raise HTTPException(status_code=400, detail="empty product")
    amount = item.amount.strip() if item.amount else None
    items = await _load_items()
    new = {
        "id": uuid.uuid4().hex[:8],
        "product": product,
        "amount": amount or None,
        "bought": False,
        "createdAt": _now_iso(),
        "boughtAt": None,
    }
    items.append(new)
    await _save_items(items)
    return new


@router.patch("/{item_id}")
async def patch_item(item_id: str, patch: PatchItem) -> dict[str, Any]:
    items = await _load_items()
    found = next((it for it in items if it["id"] == item_id), None)
    if found is None:
        raise HTTPException(status_code=404, detail="not found")
    found["bought"] = patch.bought
    found["boughtAt"] = _now_iso() if patch.bought else None
    await _save_items(items)
    return found


@router.delete("/{item_id}")
async def delete_item(item_id: str) -> dict[str, str]:
    items = await _load_items()
    before = len(items)
    items = [it for it in items if it["id"] != item_id]
    if len(items) == before:
        raise HTTPException(status_code=404, detail="not found")
    await _save_items(items)
    return {"deleted": item_id}


@router.post("/clear-bought")
async def clear_bought() -> dict[str, int]:
    items = await _load_items()
    remaining = [it for it in items if not it["bought"]]
    removed = len(items) - len(remaining)
    await _save_items(remaining)
    return {"removed": removed}


@router.post("/clear-all")
async def clear_all() -> dict[str, int]:
    items = await _load_items()
    removed = len(items)
    await _save_items([])
    return {"removed": removed}
