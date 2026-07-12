"""Unit tests for the pure parts of the trains router.

Run from backend/: .venv\\Scripts\\python -m pytest
"""
from datetime import datetime, timedelta

from app.routers.trains import (
    _apply_terminus_journeys,
    _apply_waypoint_arrivals,
    _classify,
    _connection_status,
    _group,
    _parse_iso,
    _rebase_to_now,
    _terminates_at_freising,
)
from app.trains_fixtures import FIXTURES


def test_classify_directions():
    assert _classify("München Hbf") == "south"
    assert _classify("Freising") == "south"
    assert _classify("München-Pasing") == "south"
    assert _classify("Landshut(Bay)Hbf") == "north"
    assert _classify("Plattling") == "north"
    assert _classify("Nürnberg Hbf") == "north"
    assert _classify(None) == "unknown"
    assert _classify("Timbuktu") == "unknown"


def test_terminates_at_freising():
    assert _terminates_at_freising("Freising")
    assert not _terminates_at_freising("München Hbf")
    # Mentions Freising but continues to München — not a Freising terminator.
    assert not _terminates_at_freising("München Flughafen via Freising")
    assert not _terminates_at_freising(None)


def test_group_moosburg_real_fixture():
    grouped = _group(FIXTURES["moosburg-real"])
    south = grouped["south"]
    north = grouped["north"]
    assert len(south) == 5
    assert len(north) == 4
    freising_only = [d for d in south if d["terminatesAtFreising"]]
    assert [d["line"] for d in freising_only] == ["RB33"]
    # Grouping must not invent arrivals — enrichment happens separately.
    assert grouped["stale"] is False


def _leg(
    trip_id: str,
    dep_planned: str,
    arr_planned: str,
    dep_delay_min: int = 0,
    arr_delay_min: int = 0,
    line: str = "RB33",
    dest: str = "Freising",
) -> dict:
    def shift(iso: str, mins: int) -> str:
        return (datetime.fromisoformat(iso) + timedelta(minutes=mins)).isoformat()

    return {
        "tripId": trip_id,
        "line": {"name": line, "product": "regional"},
        "direction": dest,
        "destination": {"name": dest},
        "plannedDeparture": dep_planned,
        "departure": shift(dep_planned, dep_delay_min),
        "departureDelay": dep_delay_min * 60,
        "plannedArrival": arr_planned,
        "arrival": shift(arr_planned, arr_delay_min),
        "arrivalDelay": arr_delay_min * 60,
        "departurePlatform": "2",
    }


T0 = "2026-05-13T15:00:00+02:00"


def _iso(hhmm: str) -> str:
    return f"2026-05-13T{hhmm}:00+02:00"


def test_waypoint_arrivals_only_from_direct_legs():
    deps = [{"tripId": "trip-a"}, {"tripId": "trip-b"}]
    journeys = [
        {"legs": [_leg("trip-a", _iso("15:00"), _iso("15:27"))]},
        # Two-leg journey must not produce a waypoint arrival for trip-b.
        {"legs": [_leg("trip-b", _iso("15:30"), _iso("15:57")), _leg("x", _iso("16:05"), _iso("16:40"))]},
    ]
    _apply_waypoint_arrivals(deps, journeys, "Freising")
    assert deps[0]["arrivals"] == [{"place": "Freising", "time": _iso("15:27"), "plannedTime": None}]
    assert "arrivals" not in deps[1]


def test_waypoint_arrival_shows_planned_time_when_delayed():
    deps = [{"tripId": "trip-a"}]
    journeys = [{"legs": [_leg("trip-a", _iso("15:00"), _iso("15:27"), arr_delay_min=6)]}]
    _apply_waypoint_arrivals(deps, journeys, "Landshut")
    a = deps[0]["arrivals"][0]
    assert a["time"] == _iso("15:33")
    assert a["plannedTime"] == _iso("15:27")


def test_terminus_journeys_direct_train_gets_terminus_arrival():
    deps = [{"tripId": "trip-a", "direction": "München Hbf"}]
    journeys = [
        {"legs": [_leg("trip-a", _iso("15:00"), _iso("15:55"), line="RE2", dest="München Hbf")]},
    ]
    _apply_terminus_journeys(deps, journeys)
    assert "connection" not in deps[0]
    assert deps[0]["arrivals"][0]["place"] == "München Hbf"


def test_terminus_journeys_transfer_builds_connection():
    feeder = _leg("trip-b", _iso("15:30"), _iso("15:57"), dest="Freising")
    onward = _leg("s1-trip", _iso("16:04"), _iso("16:45"), line="S1", dest="München Hbf")
    deps = [{"tripId": "trip-b", "direction": "Freising"}]
    _apply_terminus_journeys(deps, [{"legs": [feeder, onward]}])
    conn = deps[0]["connection"]
    assert conn["line"] == "S1"
    assert conn["transferMinutes"] == 7
    assert conn["connectionStatus"] == "ok"
    assert conn["arrival"] == _iso("16:45")
    # Transfer journeys must not add a terminus arrival to the feeder row.
    assert "arrivals" not in deps[0]


def test_missed_connection_gets_alternative_from_later_journey():
    feeder = _leg("trip-b", _iso("15:30"), _iso("15:57"), arr_delay_min=8, dest="Freising")
    onward_missed = _leg("s1-a", _iso("16:04"), _iso("16:45"), line="S1", dest="München Hbf")
    onward_next = _leg("s1-b", _iso("16:24"), _iso("17:05"), line="S1", dest="München Hbf")
    deps = [{"tripId": "trip-b", "direction": "Freising"}]
    _apply_terminus_journeys(
        deps,
        [
            {"legs": [feeder, onward_missed]},
            {"legs": [feeder, onward_next]},
        ],
    )
    conn = deps[0]["connection"]
    assert conn["connectionStatus"] == "missed"  # 16:04 dep vs 16:05 arrival
    assert conn["alternativeLine"] == "S1"
    assert conn["alternativeWhen"] == _iso("16:24")


def test_connection_status_thresholds():
    assert _connection_status(0, {}) == "missed"
    assert _connection_status(1, {}) == "tight"
    assert _connection_status(2, {}) == "tight"
    assert _connection_status(3, {}) == "ok"
    assert _connection_status(5, {"reachable": False}) == "missed"


def test_rebase_keeps_relative_spacing():
    fixture = FIXTURES["freising-connections"]
    shifted = _rebase_to_now([dict(d) for d in fixture])
    orig_first = _parse_iso(fixture[0]["plannedWhen"])
    new_first = _parse_iso(shifted[0]["plannedWhen"])
    delta = new_first - orig_first
    for orig, new in zip(fixture, shifted):
        assert _parse_iso(new["plannedWhen"]) - _parse_iso(orig["plannedWhen"]) == delta
        if orig.get("connection"):
            assert (
                _parse_iso(new["connection"]["plannedWhen"]) - _parse_iso(orig["connection"]["plannedWhen"])
                == delta
            )


def test_dedupe_prefers_enriched_entry():
    from app.routers.trains import _dedupe

    plain = {"line": "RE22", "plannedWhen": _iso("18:17"), "direction": "Flughafen München", "tripId": "a"}
    rich = {
        "line": "RE22",
        "plannedWhen": _iso("18:17"),
        "direction": "Flughafen München",
        "tripId": "b",
        "arrivals": [{"place": "Freising", "time": _iso("18:29")}],
    }
    other = {"line": "RE2", "plannedWhen": _iso("17:41"), "direction": "München Hbf", "tripId": "c"}
    out = _dedupe([plain, rich, other])
    assert [d["tripId"] for d in out] == ["c", "b"]
