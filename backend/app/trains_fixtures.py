"""Canned departure fixtures for UI development without hitting the live API.

Times use a fixed wall-clock format; the connections endpoint rebases them so the
earliest departure sits ~5 minutes from real-now, keeping the 'in N min' countdown
realistic regardless of when the fixture was authored.
"""
from __future__ import annotations

from typing import Any

_BASE_DATE = "2026-05-13"
_POWER_SOCKET_LINES = {"RE3", "RE22", "RB33"}


def _iso(hhmm: str, delay_min: int = 0) -> str:
    h, m = map(int, hhmm.split(":"))
    m += delay_min
    h += m // 60
    m %= 60
    return f"{_BASE_DATE}T{h:02d}:{m:02d}:00+02:00"


def _dep(
    line: str,
    direction: str,
    hhmm: str,
    platform: str | None,
    delay: int = 0,
    cancelled: bool = False,
    connection: dict[str, Any] | None = None,
    arrivals: list[tuple[str, str]] | None = None,
) -> dict[str, Any]:
    dep: dict[str, Any] = {
        "tripId": f"fix-{line}-{hhmm}",
        "line": line,
        "product": "regional",
        "direction": direction,
        "plannedWhen": _iso(hhmm),
        "when": _iso(hhmm, delay) if not cancelled else None,
        "delayMinutes": delay,
        "platform": platform,
        "cancelled": cancelled,
        "hasPowerSockets": line in _POWER_SOCKET_LINES,
    }
    if connection is not None:
        dep["connection"] = connection
    if arrivals is not None:
        # Delay cascades to downstream arrivals (matches how DB displays real boards).
        dep["arrivals"] = [{"place": p, "time": _iso(t, delay)} for p, t in arrivals]
    return dep


def _conn(
    line: str,
    direction: str,
    hhmm: str,
    platform: str | None,
    transfer_min: int,
    delay: int = 0,
    cancelled: bool = False,
    arrival: str | None = None,
) -> dict[str, Any]:
    c: dict[str, Any] = {
        "line": line,
        "product": "suburban" if line.startswith("S") else "regional",
        "direction": direction,
        "plannedWhen": _iso(hhmm),
        "when": _iso(hhmm, delay) if not cancelled else None,
        "delayMinutes": delay,
        "platform": platform,
        "cancelled": cancelled,
        "transferMinutes": transfer_min,
    }
    if arrival is not None:
        c["arrival"] = _iso(arrival)
    return c


FIXTURES: dict[str, list[dict[str, Any]]] = {
    # Modelled on a real ~1h window the user shared from the Moosburg board.
    # Times match the user's screenshot. North all from platform 1 with Landshut arrivals;
    # South all from platform 2.
    "moosburg-real": [
        # North — primary arrival of interest is Landshut, regardless of terminus.
        _dep("RE3", "Plattling", "15:59", "1", arrivals=[("Landshut", "16:12")]),
        _dep("RE2", "Hof Hbf", "16:18", "1", delay=8, arrivals=[("Landshut", "16:28")]),
        _dep("RB33", "Landshut(Bay)Hbf", "16:27", "1", arrivals=[("Landshut", "16:43")]),
        _dep("RE22", "Nürnberg Hbf", "16:42", "1", arrivals=[("Landshut", "16:54")]),
        # South
        _dep(
            "RE2", "München Hbf", "15:41", "2",
            arrivals=[("Freising", "15:50"), ("München Hbf", "16:16")],
        ),
        _dep("RB33", "Freising", "15:53", "2", arrivals=[("Freising", "16:05")]),
        _dep(
            "RE3", "München Hbf", "16:00", "2", delay=5,
            arrivals=[("Freising", "16:09"), ("München Hbf", "16:36")],
        ),
        _dep(
            "RE22", "München Flughafen Terminal", "16:17", "2",
            arrivals=[("Freising", "16:27")],
            connection=_conn(
                "S1", "München Leuchtenbergring", "16:34", "3",
                transfer_min=7, arrival="17:15",
            ),
        ),
        _dep("RB33", "München-Moosach", "16:52", "2", arrivals=[("Freising", "17:04")]),
    ],
    "typical": [
        _dep("RE3", "München Hbf", "14:23", "2"),
        _dep(
            "RB16",
            "Freising",
            "14:53",
            "2",
            connection=_conn("S1", "München Hbf", "15:25", "5", transfer_min=5),
        ),
        _dep("RE3", "München Hbf", "15:23", "2", delay=3),
        _dep("RB16", "Freising", "15:53", "2"),
        _dep("RE3", "Passau Hbf", "14:35", "1"),
        _dep("RB16", "Landshut(Bay)Hbf", "15:05", "1"),
        _dep("RE3", "Regensburg Hbf", "15:35", "1"),
        _dep("RB16", "Landshut(Bay)Hbf", "16:05", "1", delay=5),
    ],
    "freising-connections": [
        _dep(
            "RB16",
            "Freising",
            "14:53",
            "2",
            connection=_conn("S1", "München Hbf", "15:28", "5", transfer_min=8),
        ),
        _dep(
            "RB16",
            "Freising",
            "15:23",
            "2",
            connection=_conn("S1", "München Hbf", "15:53", "5", transfer_min=3),
        ),
        _dep(
            "RB16",
            "Freising",
            "15:53",
            "2",
            connection=_conn("S1", "München Hbf", "16:28", "5", transfer_min=8, cancelled=True),
        ),
        _dep(
            "RB16",
            "Freising",
            "16:23",
            "2",
            delay=12,
            connection=_conn("S1", "München Hbf", "16:58", "5", transfer_min=8),
        ),
        _dep("RE3", "Passau Hbf", "15:35", "1"),
        _dep("RB16", "Landshut(Bay)Hbf", "16:05", "1"),
    ],
    "delayed": [
        _dep("RE3", "München Hbf", "14:23", "2", delay=12),
        _dep(
            "RB16",
            "Freising",
            "14:53",
            "2",
            delay=8,
            connection=_conn("S1", "München Hbf", "15:25", "5", transfer_min=5),
        ),
        _dep("RE3", "Passau Hbf", "14:35", "1", delay=18),
    ],
    "disruption": [
        _dep("RE3", "München Hbf", "14:23", "2", cancelled=True),
        _dep(
            "RB16",
            "Freising",
            "14:53",
            None,
            delay=4,
            connection=_conn("S1", "München Hbf", "15:25", "5", transfer_min=5, cancelled=True),
        ),
        _dep("RE3", "Regensburg Hbf", "15:35", "1", cancelled=True),
        _dep("RB16", "Landshut(Bay)Hbf", "16:05", "1"),
    ],
    "empty": [],
}
