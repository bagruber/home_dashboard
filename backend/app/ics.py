"""Minimal iCalendar (ICS) parser — just enough for our calendar import.

Extracts SUMMARY, DTSTART, DTEND from VEVENT blocks. Handles line folding and
basic backslash escaping. Ignores TZID (assumes the supplied datetimes are
already in local time) — fine for a household dashboard.
"""
from __future__ import annotations

import re
from typing import Iterable


def _unfold(text: str) -> Iterable[str]:
    """RFC 5545 line folding: lines starting with space/tab continue the previous one."""
    current: str | None = None
    for raw in text.splitlines():
        if raw.startswith(" ") or raw.startswith("\t"):
            if current is not None:
                current += raw[1:]
        else:
            if current is not None:
                yield current
            current = raw
    if current is not None:
        yield current


def _unescape(s: str) -> str:
    out: list[str] = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == "\\" and i + 1 < len(s):
            n = s[i + 1]
            if n in ("n", "N"):
                out.append("\n")
            elif n in (",", ";", "\\"):
                out.append(n)
            else:
                out.append(n)
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


_DATE_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})$")
_DATETIME_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d{2}Z?$")


def _parse_dt(value: str) -> tuple[str | None, str | None]:
    v = value.strip()
    m = _DATETIME_RE.match(v)
    if m:
        y, mo, d, h, mi = m.groups()
        return f"{y}-{mo}-{d}", f"{h}:{mi}"
    m = _DATE_RE.match(v)
    if m:
        y, mo, d = m.groups()
        return f"{y}-{mo}-{d}", None
    return None, None


def parse_events(text: str) -> list[dict[str, str | None]]:
    events: list[dict[str, str | None]] = []
    current: dict[str, str | None] | None = None
    for line in _unfold(text):
        line = line.strip()
        if line == "BEGIN:VEVENT":
            current = {}
            continue
        if line == "END:VEVENT":
            if current is not None and current.get("title") and current.get("date"):
                events.append(current)
            current = None
            continue
        if current is None:
            continue
        if ":" not in line:
            continue
        prop, value = line.split(":", 1)
        name = prop.split(";", 1)[0].upper()
        if name == "SUMMARY":
            current["title"] = _unescape(value)
        elif name == "DTSTART":
            d, t = _parse_dt(value)
            current["date"] = d
            current["time"] = t
    return events
