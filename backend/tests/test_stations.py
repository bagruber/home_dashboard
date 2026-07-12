"""Uniform station display names: keep town + specifier, drop the rest."""
from app.stations import clean_station_name


def test_bus_stop_suffix_removed():
    assert clean_station_name("Schwandorf, ZOB am Bahnhof") == "Schwandorf"
    assert clean_station_name("Moosburg, Bahnhof") == "Moosburg"


def test_specifiers_kept_and_spaced_uniformly():
    assert clean_station_name("Landau (Isar)") == "Landau (Isar)"
    assert clean_station_name("Weiden (Oberpf)") == "Weiden (Oberpf)"
    assert clean_station_name("Landshut(Bay)Hbf") == "Landshut (Bay) Hbf"
    assert clean_station_name("Neufahrn(Niederbay)") == "Neufahrn (Niederbay)"


def test_hauptbahnhof_abbreviated():
    assert clean_station_name("Landshut (Bay) Hauptbahnhof") == "Landshut (Bay) Hbf"
    assert clean_station_name("München Hbf") == "München Hbf"


def test_none_and_plain_names_pass_through():
    assert clean_station_name(None) is None
    assert clean_station_name("Plattling") == "Plattling"
    assert clean_station_name("München Flughafen Terminal") == "München Flughafen Terminal"
