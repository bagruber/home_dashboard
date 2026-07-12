"""Uniform station display names across data providers.

DELFI/Transitous and db-rest disagree wildly: "Schwandorf, ZOB am Bahnhof",
"Landshut (Bay) Hauptbahnhof", "Landshut(Bay)Hbf". Rule: keep the town and its
disambiguating specifier — "Landau (Isar)", "Weiden (Oberpf)" — drop bus-stop
suffixes after a comma, abbreviate Hauptbahnhof, normalise spacing.
"""
import re

_PAREN_RE = re.compile(r"\s*\(\s*([^)]*?)\s*\)\s*")
_SPACES_RE = re.compile(r"\s+")


def clean_station_name(name: str | None) -> str | None:
    if not name:
        return name
    # "Town, stop detail" (bus-stop notation) → keep the town.
    name = name.split(",")[0]
    name = name.replace("Hauptbahnhof", "Hbf")
    # Uniform specifier spacing: "Landshut(Bay)Hbf" → "Landshut (Bay) Hbf".
    name = _PAREN_RE.sub(r" (\1) ", name)
    return _SPACES_RE.sub(" ", name).strip()
