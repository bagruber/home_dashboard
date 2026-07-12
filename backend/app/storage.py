"""Tiny JSON-file persistence layer for low-volume dashboard data.

One JSON file per named store, atomic via temp-file + rename, per-name asyncio lock.
Good enough for the shopping list and similar small entities; swap to SQLite when
volume or complexity actually demands it.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

_DATA_DIR = Path(__file__).parent.parent / "data"
_DATA_DIR.mkdir(exist_ok=True)
_locks: dict[str, asyncio.Lock] = {}


def _lock(name: str) -> asyncio.Lock:
    if name not in _locks:
        _locks[name] = asyncio.Lock()
    return _locks[name]


async def load(name: str, default: Any) -> Any:
    path = _DATA_DIR / f"{name}.json"
    async with _lock(name):
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return default


async def save(name: str, data: Any) -> None:
    path = _DATA_DIR / f"{name}.json"
    async with _lock(name):
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)
