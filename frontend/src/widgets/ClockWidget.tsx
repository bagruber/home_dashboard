import { useEffect, useState } from "react";
import { useElementSize } from "../lib/useElementSize";
import { usePolling } from "../lib/usePolling";
import { fetchWeather, type WeatherResponse } from "../lib/weather";

const WEATHER_REFRESH_MS = 30 * 60_000;

const TIME_FMT = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const DATE_FULL_FMT = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Berlin",
});
const DATE_SHORT_FMT = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/Berlin",
});
const TZ_PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function timezoneLabel(now: Date): string {
  const parts = TZ_PARTS_FMT.formatToParts(now);
  const pick = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const localAsUtc = Date.UTC(
    pick("year"),
    pick("month") - 1,
    pick("day"),
    pick("hour") === 24 ? 0 : pick("hour"),
    pick("minute"),
    pick("second"),
  );
  const offsetH = Math.round((localAsUtc - now.getTime()) / 3_600_000);
  const abbr = offsetH === 2 ? "CEST" : offsetH === 1 ? "CET" : `UTC${offsetH >= 0 ? "+" : ""}${offsetH}`;
  return `${abbr} · GMT${offsetH >= 0 ? "+" : "-"}${Math.abs(offsetH)}`;
}

export function ClockWidget() {
  const [now, setNow] = useState(() => new Date());
  const [ref, size] = useElementSize<HTMLDivElement>();
  // Sun times ride on the weather endpoint (cached server-side, so this is cheap).
  const { data: weather } = usePolling<WeatherResponse>(fetchWeather, WEATHER_REFRESH_MS);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000 * 20);
    return () => window.clearInterval(id);
  }, []);

  // Density tiers driven by the actual cell size:
  //   tiny    → time only
  //   compact → time + short date
  //   full    → time + long date + sunrise/sunset
  //   xl      → additionally the timezone line
  const tiny = size.height > 0 && (size.height < 110 || size.width < 170);
  const compact = !tiny && (size.height < 160 || size.width < 240);
  const full = !tiny && !compact;
  const xl = full && size.height >= 260;
  const dateFmt = compact ? DATE_SHORT_FMT : DATE_FULL_FMT;

  const today = weather?.forecast?.[0];
  const sunrise = today?.sunrise ? TIME_FMT.format(new Date(today.sunrise)) : null;
  const sunset = today?.sunset ? TIME_FMT.format(new Date(today.sunset)) : null;

  return (
    <div
      ref={ref}
      className="h-full w-full flex flex-col items-center justify-center px-3 py-2 gap-1 text-center"
    >
      <div
        className="text-ink-high font-semibold tracking-tight leading-none tabular-nums"
        style={{ fontSize: tiny ? "clamp(2rem, 16vw, 5rem)" : compact ? "clamp(2.25rem, 11vw, 5.5rem)" : "clamp(2.75rem, 9vw, 7rem)" }}
      >
        {TIME_FMT.format(now)}
      </div>
      {!tiny && (
        <div
          className="text-ink-mid leading-tight"
          style={{ fontSize: compact ? "clamp(0.85rem, 2.2vw, 1.05rem)" : "clamp(0.95rem, 1.8vw, 1.25rem)" }}
        >
          {dateFmt.format(now)}
        </div>
      )}
      {full && sunrise && sunset && (
        <div className="text-ink-low tabular-nums text-[clamp(0.75rem,1.2vw,0.9rem)] flex items-baseline gap-3">
          <span aria-label="Sonnenaufgang">↑ {sunrise}</span>
          <span aria-label="Sonnenuntergang">↓ {sunset}</span>
        </div>
      )}
      {xl && (
        <div className="text-ink-low uppercase tracking-wider text-[clamp(0.7rem,1.1vw,0.85rem)]">
          {timezoneLabel(now)}
        </div>
      )}
    </div>
  );
}
