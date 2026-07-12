from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from app.cache import TTLCache
from app.config import settings

router = APIRouter()

_OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
_HOURLY_WINDOW = 12  # next N hours to surface in the dashboard strip
_cache = TTLCache()


@router.get("/current")
async def current() -> dict[str, Any]:
    """Compact payload: current + next 12 hours (hourly) + 4-day forecast with per-day hourly temps."""
    key = f"{settings.weather_latitude},{settings.weather_longitude}"
    cached = _cache.get(key)
    if cached is not None:
        return cached

    params = {
        "latitude": settings.weather_latitude,
        "longitude": settings.weather_longitude,
        "current": "temperature_2m,weather_code,is_day,wind_speed_10m",
        "hourly": "temperature_2m,precipitation_probability,cloud_cover,is_day,weather_code",
        "daily": "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset",
        "timezone": "Europe/Berlin",
        "forecast_days": 4,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            resp = await client.get(_OPEN_METEO_URL, params=params)
    except httpx.TimeoutException:
        stale = _cache.get_stale(key)
        if stale is not None:
            return {**stale, "stale": True}
        raise HTTPException(status_code=504, detail="upstream timeout")

    if resp.status_code != 200:
        stale = _cache.get_stale(key)
        if stale is not None:
            return {**stale, "stale": True}
        raise HTTPException(status_code=502, detail=f"upstream status {resp.status_code}")

    payload = _simplify(resp.json())
    _cache.set(key, payload, settings.weather_cache_ttl_seconds)
    return payload


def _simplify(raw: dict[str, Any]) -> dict[str, Any]:
    cur = raw.get("current") or {}
    hourly = raw.get("hourly") or {}
    daily = raw.get("daily") or {}
    offset_s = int(raw.get("utc_offset_seconds") or 0)

    times = hourly.get("time") or []
    temps = hourly.get("temperature_2m") or []
    precs = hourly.get("precipitation_probability") or []
    clouds = hourly.get("cloud_cover") or []
    is_day_arr = hourly.get("is_day") or []
    h_codes = hourly.get("weather_code") or []

    # Open-Meteo returns local naive times (because timezone=Europe/Berlin was requested).
    # Locate the first hourly slot >= the current local hour.
    now_local = datetime.now(timezone.utc) + timedelta(seconds=offset_s)
    target_prefix = now_local.strftime("%Y-%m-%dT%H:00")
    start = 0
    for i, t in enumerate(times):
        if t >= target_prefix:
            start = i
            break

    end = min(start + _HOURLY_WINDOW, len(times))
    hourly_window = {
        "time": times[start:end],
        "temperature": temps[start:end],
        "precipitationProbability": precs[start:end],
        "cloudCover": clouds[start:end],
        "isDay": [bool(x) for x in is_day_arr[start:end]],
        "weatherCode": h_codes[start:end],
    }

    daily_times = daily.get("time") or []
    daily_max = daily.get("temperature_2m_max") or []
    daily_min = daily.get("temperature_2m_min") or []
    daily_code = daily.get("weather_code") or []
    daily_pp = daily.get("precipitation_probability_max") or []
    sunrises = daily.get("sunrise") or []
    sunsets = daily.get("sunset") or []

    forecast: list[dict[str, Any]] = []
    for i, date in enumerate(daily_times):
        # Hourly slot per day is 24 entries starting at the day's midnight in the
        # response order. Slice the hourly temperature array accordingly.
        day_slice = temps[i * 24 : (i + 1) * 24]
        forecast.append(
            {
                "date": date,
                "tempMax": daily_max[i] if i < len(daily_max) else None,
                "tempMin": daily_min[i] if i < len(daily_min) else None,
                "weatherCode": daily_code[i] if i < len(daily_code) else None,
                "precipitationProbability": daily_pp[i] if i < len(daily_pp) else None,
                "sunrise": sunrises[i] if i < len(sunrises) else None,
                "sunset": sunsets[i] if i < len(sunsets) else None,
                "hourlyTemperatures": day_slice,
            }
        )

    return {
        "current": {
            "temperature": cur.get("temperature_2m"),
            "weatherCode": cur.get("weather_code"),
            "isDay": bool(cur.get("is_day", 1)),
            "windSpeed": cur.get("wind_speed_10m"),
        },
        "hourly": hourly_window,
        "forecast": forecast,
        "stale": False,
    }
