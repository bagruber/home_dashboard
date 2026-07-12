"""Shared in-memory TTL cache for upstream API responses.

One instance per data source. Values are kept after expiry so callers can fall
back to stale data when the upstream is unreachable.
"""
from __future__ import annotations

import time
from typing import Any


class TTLCache:
    def __init__(self) -> None:
        self._data: dict[Any, tuple[float, Any]] = {}

    def get(self, key: Any) -> Any | None:
        entry = self._data.get(key)
        if entry and entry[0] > time.monotonic():
            return entry[1]
        return None

    def get_stale(self, key: Any) -> Any | None:
        """Return the value even if expired (upstream-failure fallback)."""
        entry = self._data.get(key)
        return entry[1] if entry else None

    def set(self, key: Any, value: Any, ttl_seconds: float) -> None:
        self._data[key] = (time.monotonic() + ttl_seconds, value)

    def age_seconds(self, key: Any, ttl_seconds: float) -> float | None:
        """Seconds since the entry was stored, derived from its expiry time."""
        entry = self._data.get(key)
        if entry is None:
            return None
        return ttl_seconds - (entry[0] - time.monotonic())
