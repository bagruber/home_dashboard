import os
from dataclasses import dataclass

from dotenv import load_dotenv

# Load backend/.env (gitignored) before reading any env vars. Allows local secrets
# (e.g. DASHBOARD_17TRACK_API_KEY) to live in a file instead of the launcher script.
# override=True: the file wins over values inherited from the parent process —
# otherwise uvicorn's --reload supervisor pins workers to a stale environment.
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), os.pardir, ".env"), override=True)


@dataclass(frozen=True)
class Settings:
    # Public db-rest instance (open-source HAFAS proxy). Self-host later if needed.
    db_rest_base_url: str = os.environ.get(
        "DASHBOARD_DB_REST_BASE_URL", "https://v6.db.transport.rest"
    )
    # Moosburg(Oberbay) station — db-rest ID 8004084. Includes regional trains + buses.
    # Verify via /api/trains/locations?query=Moosburg.
    default_station_id: str = os.environ.get("DASHBOARD_DEFAULT_STATION_ID", "8004084")
    # Journey targets used to enrich the board with real arrivals + connections.
    freising_station_id: str = os.environ.get("DASHBOARD_FREISING_STATION_ID", "8002078")
    munich_station_id: str = os.environ.get("DASHBOARD_MUNICH_STATION_ID", "8000261")
    landshut_station_id: str = os.environ.get("DASHBOARD_LANDSHUT_STATION_ID", "8000230")
    # Transitous (transitous.org) — free MOTIS instance, used as automatic
    # fallback when db-rest is down. IDs are DELFI GTFS stop ids (via /geocode).
    transitous_base_url: str = os.environ.get(
        "DASHBOARD_TRANSITOUS_BASE_URL", "https://api.transitous.org"
    )
    transitous_moosburg_id: str = os.environ.get(
        "DASHBOARD_TRANSITOUS_MOOSBURG_ID", "de-DELFI_de:09178:2840"
    )
    transitous_freising_id: str = os.environ.get(
        "DASHBOARD_TRANSITOUS_FREISING_ID", "de-DELFI_de:09178:2680"
    )
    transitous_munich_id: str = os.environ.get(
        "DASHBOARD_TRANSITOUS_MUNICH_ID", "de-DELFI_de:09162:100"
    )
    transitous_landshut_id: str = os.environ.get(
        "DASHBOARD_TRANSITOUS_LANDSHUT_ID", "de-DELFI_de:09261:64"
    )
    # Weather: Moosburg a.d. Isar coordinates, Open-Meteo as the data source.
    weather_latitude: float = float(os.environ.get("DASHBOARD_WEATHER_LATITUDE", "48.4673"))
    weather_longitude: float = float(os.environ.get("DASHBOARD_WEATHER_LONGITUDE", "11.9333"))
    weather_cache_ttl_seconds: float = float(
        os.environ.get("DASHBOARD_WEATHER_CACHE_TTL_SECONDS", "600")
    )
    # Parcels: optional DHL Unified Tracking API key (free tier on developer.dhl.com).
    # Without a key, DHL parcels are stored but not auto-refreshed — the widget still
    # offers a deep-link to dhl.de for manual checks.
    dhl_api_key: str | None = os.environ.get("DASHBOARD_DHL_API_KEY") or None
    # 17TRACK (api.17track.net) — multi-carrier tracking, free one-time quota.
    # When set, it handles all carriers; the DHL key becomes unnecessary.
    seventeentrack_api_key: str | None = os.environ.get("DASHBOARD_17TRACK_API_KEY") or None
    parcel_min_refresh_seconds: float = float(
        os.environ.get("DASHBOARD_PARCEL_MIN_REFRESH_SECONDS", "600")
    )
    request_timeout_seconds: float = float(
        os.environ.get("DASHBOARD_REQUEST_TIMEOUT_SECONDS", "15.0")
    )
    departures_cache_ttl_seconds: float = float(
        os.environ.get("DASHBOARD_DEPARTURES_CACHE_TTL_SECONDS", "30.0")
    )
    # Soft facts per line, comma-separated line names (e.g. "RE3,RE22").
    power_socket_lines: frozenset = frozenset(
        s.strip()
        for s in os.environ.get("DASHBOARD_POWER_SOCKET_LINES", "RE3,RE22,RB33").split(",")
        if s.strip()
    )
    wifi_lines: frozenset = frozenset(
        s.strip() for s in os.environ.get("DASHBOARD_WIFI_LINES", "").split(",") if s.strip()
    )
    # DWD weather warnings: warncell of Landkreis Freising (8 + AGS 09178 + 000).
    # Look yours up in the DWD warncell list (cap_warncellids_csv).
    dwd_warncell_id: str = os.environ.get("DASHBOARD_DWD_WARNCELL_ID", "809178000")
    dwd_cache_ttl_seconds: float = float(os.environ.get("DASHBOARD_DWD_CACHE_TTL_SECONDS", "300"))


settings = Settings()
