"""Mapping tests: MOTIS stoptimes/plan payloads -> internal db-rest-like shapes."""
from app.transitous import _clean_line, _map_leg, _map_stoptime


def test_clean_line_strips_train_number():
    assert _clean_line("RE2 (4867)") == "RE2"
    assert _clean_line("S1") == "S1"
    assert _clean_line(None) is None


def test_map_stoptime_realtime_delay():
    s = {
        "tripId": "20260712_19:05_de-DELFI_3279080509",
        "routeShortName": "RE3 (4083)",
        "mode": "REGIONAL_RAIL",
        "headsign": "München Hbf",
        "realTime": True,
        "cancelled": False,
        "place": {
            "scheduledDeparture": "2026-07-12T18:00:00Z",
            "departure": "2026-07-12T18:05:00Z",
            "track": "Gl2",
        },
    }
    dep = _map_stoptime(s)
    assert dep["line"] == "RE3"
    assert dep["direction"] == "München Hbf"
    assert dep["plannedWhen"] == "2026-07-12T18:00:00+00:00"
    assert dep["when"] == "2026-07-12T18:05:00+00:00"
    assert dep["delayMinutes"] == 5
    assert dep["platform"] == "2"


def test_map_stoptime_without_realtime_has_no_delay():
    s = {
        "routeShortName": "5010",
        "headsign": "Erding",
        "realTime": False,
        "place": {
            "scheduledDeparture": "2026-07-12T17:07:00Z",
            "departure": "2026-07-12T17:07:00Z",
        },
    }
    dep = _map_stoptime(s)
    assert dep["delayMinutes"] is None
    assert dep["when"] == dep["plannedWhen"]


def test_map_leg_walk_is_marked_walking():
    assert _map_leg({"mode": "WALK"}) == {"walking": True}


def test_map_leg_transit_shape_matches_dbrest_legs():
    leg = {
        "mode": "REGIONAL_RAIL",
        "routeShortName": "RE2 (4867)",
        "headsign": "München Hbf",
        "tripId": "trip-1",
        "realTime": True,
        "from": {
            "name": "Moosburg",
            "scheduledDeparture": "2026-07-12T17:41:00Z",
            "departure": "2026-07-12T17:43:00Z",
            "track": "Gl2",
        },
        "to": {
            "name": "München Hbf",
            "scheduledArrival": "2026-07-12T18:16:00Z",
            "arrival": "2026-07-12T18:18:00Z",
        },
    }
    mapped = _map_leg(leg)
    assert mapped["line"]["name"] == "RE2"
    assert mapped["destination"]["name"] == "München Hbf"
    assert mapped["plannedDeparture"] == "2026-07-12T17:41:00+00:00"
    assert mapped["departureDelay"] == 120
    assert mapped["arrival"] == "2026-07-12T18:18:00+00:00"
    assert mapped["departurePlatform"] == "2"
    assert not mapped.get("walking")


def test_clean_track_normalises_mixed_forms():
    from app.transitous import _clean_track

    assert _clean_track("Gl2") == "2"
    assert _clean_track("Gleis 5") == "5"
    assert _clean_track("1") == "1"
    assert _clean_track(None) is None
