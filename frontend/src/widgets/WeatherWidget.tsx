import {
  describeWeather,
  fetchWeather,
  type WeatherDay,
  type WeatherHourly,
  type WeatherResponse,
} from "../lib/weather";
import { useElementSize } from "../lib/useElementSize";
import { usePolling } from "../lib/usePolling";
import { RainRadar } from "../components/RainRadar";
import { WidgetHeader } from "../components/WidgetHeader";
import { t } from "../strings.de";

const REFRESH_MS = 10 * 60_000;
const TEMP_FMT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const HOUR_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hour12: false,
  timeZone: "Europe/Berlin",
});

function fmtTemp(v: number | null): string {
  return v == null ? "—" : `${TEMP_FMT.format(v)}°`;
}

export function WeatherWidget() {
  const { data, error } = usePolling<WeatherResponse>(fetchWeather, REFRESH_MS);
  const [ref, size] = useElementSize<HTMLDivElement>();

  // size is measured inside the dashboard's zoom wrapper, i.e. in local px —
  // the right unit for "what fits" (fonts scale along). The radar decision is
  // about the widget's real on-screen estate though, so factor the zoom out.
  const zoomFactor =
    (ref.current && (ref.current as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom) || 1;
  const physicalHeight = size.height * zoomFactor;

  // Density tiers: current conditions always; the hourly strip, day cards and
  // finally the rain radar join as the cell grows; narrow cells halve the hours.
  const showHourly = size.height >= 170;
  const showRadar = physicalHeight >= 430;
  // When the radar squeezes into a locally tight cell, the day cards yield.
  const showDays = size.height >= 240 && (!showRadar || size.height >= 470);
  const hourStep = size.width > 0 && size.width < 340 ? 2 : 1;

  return (
    <div ref={ref} className="h-full w-full flex flex-col px-3 py-2 gap-2">
      <WidgetHeader
        title={t.widgets.weather.title}
        right={data?.stale ? <span className="text-alert text-[11px]">{t.widgets.weather.stale}</span> : undefined}
      />

      {error && !data && <div className="text-alert text-sm">{t.widgets.weather.error}</div>}
      {!error && data === null && <div className="text-ink-low text-sm">{t.widgets.weather.loading}</div>}

      {data && (
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          <Current data={data} />
          {showHourly && <HourlyStrip hourly={data.hourly} step={hourStep} />}
          {showDays && (
            <div className="flex gap-1 overflow-x-auto no-drag">
              {data.forecast.slice(1).map((d) => (
                <ForecastDay key={d.date} day={d} />
              ))}
            </div>
          )}
          {showRadar && <RainRadar />}
        </div>
      )}
    </div>
  );
}

function Current({ data }: { data: WeatherResponse }) {
  const today = data.forecast[0];
  const desc = describeWeather(data.current.weatherCode, data.current.isDay);
  return (
    <div className="flex items-center gap-3">
      <span className="text-[clamp(2rem,5vw,3rem)] leading-none" aria-hidden>
        {desc.icon}
      </span>
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-ink-high tabular-nums text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-none">
          {fmtTemp(data.current.temperature)}
        </span>
        <span className="text-ink-mid text-xs truncate">{desc.label}</span>
      </div>
      {today && (
        <div className="ml-auto text-right text-xs text-ink-low flex flex-col gap-0 leading-tight">
          <span className="tabular-nums text-ink-mid">
            {fmtTemp(today.tempMin)} / {fmtTemp(today.tempMax)}
          </span>
          {today.precipitationProbability != null && today.precipitationProbability > 0 && (
            <span className="tabular-nums">{t.widgets.weather.precip(today.precipitationProbability)}</span>
          )}
        </div>
      )}
    </div>
  );
}

function HourlyStrip({ hourly, step = 1 }: { hourly: WeatherHourly; step?: number }) {
  if (hourly.time.length === 0) return null;
  const valid = hourly.temperature.filter((t): t is number => t != null);
  const tMin = valid.length ? Math.min(...valid) : 0;
  const tMax = valid.length ? Math.max(...valid) : 1;
  const tSpan = Math.max(tMax - tMin, 1);

  return (
    <div className="flex gap-[2px] overflow-x-auto pb-1 no-drag">
      {hourly.time.map((iso, i) => {
        if (i % step !== 0) return null;
        const date = new Date(iso);
        const hourLabel = HOUR_FMT.format(date);
        const temp = hourly.temperature[i];
        const precip = hourly.precipitationProbability[i] ?? 0;
        const cloud = hourly.cloudCover[i] ?? 0;
        const isDay = hourly.isDay[i];
        const tempY = temp == null ? 0.5 : 1 - (temp - tMin) / tSpan;
        return (
          <HourCell
            key={iso}
            hour={hourLabel}
            temp={temp}
            tempY={tempY}
            precip={precip}
            cloud={cloud}
            isDay={isDay}
          />
        );
      })}
    </div>
  );
}

interface HourCellProps {
  hour: string;
  temp: number | null;
  tempY: number;
  precip: number;
  cloud: number;
  isDay: boolean;
}

function HourCell({ hour, temp, tempY, precip, cloud, isDay }: HourCellProps) {
  const sunOpacity = Math.max(0.15, 1 - cloud / 100);
  const tempColor = tempY < 0.33 ? "#f5c542" : tempY < 0.66 ? "#c8c8c8" : "#7ec8ea";
  return (
    <div className="flex-1 min-w-[1.55rem] flex flex-col items-center text-center gap-[2px]">
      <span className="text-ink-low text-[10px] tabular-nums leading-none">{hour}</span>
      <span className="block tabular-nums leading-none text-[11px]" style={{ color: tempColor }}>
        {fmtTemp(temp)}
      </span>
      <PrecipBar value={precip} />
      <SunDot intensity={sunOpacity} isDay={isDay} />
    </div>
  );
}

function PrecipBar({ value }: { value: number }) {
  const max = 22;
  const h = Math.max(0, Math.min(max, (value / 100) * max));
  const color = value >= 60 ? "bg-munich" : value >= 30 ? "bg-freising" : "bg-white/15";
  return (
    <div className="w-1.5 flex items-end" style={{ height: `${max}px` }} aria-label={`${value}% Regen`}>
      <div className={`${color} w-full rounded-sm`} style={{ height: `${h}px` }} />
    </div>
  );
}

function SunDot({ intensity, isDay }: { intensity: number; isDay: boolean }) {
  return (
    <div className="w-1.5 h-1">
      <div
        className="w-full h-full rounded-sm"
        style={{
          backgroundColor: isDay ? "#f5c542" : "#5b6478",
          opacity: isDay ? intensity : 0.4,
        }}
      />
    </div>
  );
}

function ForecastDay({ day }: { day: WeatherDay }) {
  const desc = describeWeather(day.weatherCode, true);
  const date = new Date(day.date + "T00:00:00");
  return (
    <div className="relative flex-1 min-w-[3rem] rounded-lg bg-white/[0.025] overflow-hidden">
      <Sparkline temps={day.hourlyTemperatures} />
      <div className="relative z-10 px-1.5 py-1.5 flex flex-col items-center gap-0 text-center leading-tight">
        <span className="text-ink-low text-[11px] uppercase tracking-wider">{t.widgets.weather.weekdayShort(date)}</span>
        <span className="text-base leading-none my-0.5" aria-hidden>
          {desc.icon}
        </span>
        <span className="tabular-nums text-xs leading-tight">
          <span className="text-ink-high">{fmtTemp(day.tempMax)}</span>
          <span className="text-ink-low"> / {fmtTemp(day.tempMin)}</span>
        </span>
      </div>
    </div>
  );
}

function Sparkline({ temps }: { temps: (number | null)[] }) {
  const points = temps
    .map((t, i) => ({ i, t }))
    .filter((p): p is { i: number; t: number } => p.t != null);
  if (points.length < 2) return null;
  const xs = points.map((p) => p.i);
  const ts = points.map((p) => p.t);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const baseLow = Math.min(tMin, 0);
  const baseHigh = Math.max(tMax, 15);

  const w = 100;
  const h = 100;
  const padY = 10;
  const xSpan = Math.max(xMax - xMin, 1);
  const ySpan = Math.max(baseHigh - baseLow, 1);
  const yFor = (t: number) => h - padY - ((t - baseLow) / ySpan) * (h - 2 * padY);

  const path = points
    .map((p, idx) => {
      const x = ((p.i - xMin) / xSpan) * w;
      return `${idx === 0 ? "M" : "L"}${x.toFixed(2)} ${yFor(p.t).toFixed(2)}`;
    })
    .join(" ");

  const y0 = yFor(0);
  const y15 = yFor(15);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden
    >
      <defs>
        <linearGradient id="sparklineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5c542" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#7ec8ea" stopOpacity="0.015" />
        </linearGradient>
      </defs>
      <line x1="0" x2={w} y1={y0} y2={y0} stroke="#7ec8ea" strokeWidth="0.5" strokeDasharray="2 3" strokeOpacity="0.3" />
      <line x1="0" x2={w} y1={y15} y2={y15} stroke="#f5c542" strokeWidth="0.5" strokeDasharray="2 3" strokeOpacity="0.25" />
      <path d={`${path} L${w} ${h} L0 ${h} Z`} fill="url(#sparklineFill)" />
      <path d={path} stroke="rgba(255,255,255,0.2)" strokeWidth="1" fill="none" />
    </svg>
  );
}
