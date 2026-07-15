import { useEffect, useMemo, useState } from "react";
import { useElementSize } from "../lib/useElementSize";
import { t } from "../strings.de";

// Moosburg a.d. Isar — mirrors the backend's weather coordinates.
const CENTER = { lat: 48.4673, lon: 11.9333 };
const CLOSE_ZOOM = 10; // roughly ±20 km around Moosburg
const WIDE_ZOOM = 8; // roughly ±80 km — rain fronts approaching
const TILE = 256;

// Precipitation overlay: DWD's open WMS serves the RV product (1×1 km radar,
// 5-min steps) with ~2 h of history AND ~2 h of nowcast — one source for past
// and prediction, no API key, no zoom cap (unlike RainViewer's free tiles).
const DWD_WMS = "https://maps.dwd.de/geoserver/dwd/wms";
const RADAR_LAYER = "dwd:Radar_rv_product_1x1km_ger";
const STEP_MIN = 10;
const PAST_STEPS = 12; // 2 h back
const FORECAST_STEPS = 9; // +90 min — safely inside the RV forecast horizon

const TIME_FMT = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

interface RadarFrame {
  timeMs: number;
  forecast: boolean;
}

/** Frames on a 5-min grid around "now": -2 h … +90 min in 10-min steps. */
function frameTimes(nowMs: number): RadarFrame[] {
  const base = Math.floor(nowMs / (5 * 60_000)) * 5 * 60_000;
  const frames: RadarFrame[] = [];
  for (let i = -PAST_STEPS; i <= FORECAST_STEPS; i++) {
    frames.push({ timeMs: base + i * STEP_MIN * 60_000, forecast: i > 0 });
  }
  return frames;
}

function useNowMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

interface TilePos {
  tx: number;
  ty: number;
  x: number;
  y: number;
}

/** Web-Mercator basemap tiles covering a w×h viewport centered on CENTER. */
function tileGrid(w: number, h: number, z: number): TilePos[] {
  const scale = TILE * 2 ** z;
  const cx = ((CENTER.lon + 180) / 360) * scale;
  const latRad = (CENTER.lat * Math.PI) / 180;
  const cy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
  const left = cx - w / 2;
  const top = cy - h / 2;
  const tiles: TilePos[] = [];
  for (let tx = Math.floor(left / TILE); tx * TILE < left + w; tx++) {
    for (let ty = Math.floor(top / TILE); ty * TILE < top + h; ty++) {
      tiles.push({ tx, ty, x: tx * TILE - left, y: ty * TILE - top });
    }
  }
  return tiles;
}

/** One WMS GetMap image covering the whole viewport (EPSG:3857). */
function wmsUrl(timeMs: number, w: number, h: number, z: number): string {
  const mpp = 40075016.686 / (TILE * 2 ** z); // meters per screen pixel
  const mx = (CENTER.lon / 180) * 20037508.34;
  const my = (Math.log(Math.tan(Math.PI / 4 + (CENTER.lat * Math.PI) / 360)) / Math.PI) * 20037508.34;
  const bbox = [
    mx - (w / 2) * mpp,
    my - (h / 2) * mpp,
    mx + (w / 2) * mpp,
    my + (h / 2) * mpp,
  ]
    .map((v) => v.toFixed(2))
    .join(",");
  const time = new Date(timeMs).toISOString().replace(/\.\d{3}Z$/, ".000Z");
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetMap",
    layers: RADAR_LAYER,
    styles: "",
    crs: "EPSG:3857",
    bbox,
    width: String(Math.round(w)),
    height: String(Math.round(h)),
    format: "image/png",
    transparent: "true",
    time,
  });
  return `${DWD_WMS}?${params}`;
}

/** Rain radar on a dark Carto basemap: DWD precipitation with a slider from
 *  2 h back to +90 min forecast, two zoom steps, centered on Moosburg. */
export function RainRadar() {
  const now = useNowMinute();
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [wide, setWide] = useState(false);
  // null → follow "jetzt"; a number pins the slider to that frame offset.
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);

  const frames = useMemo(() => frameTimes(now), [now]);
  const idx = pinnedIdx ?? PAST_STEPS;
  const frame = frames[idx];
  const z = wide ? WIDE_ZOOM : CLOSE_ZOOM;

  const tiles = useMemo(
    () => (size.width > 0 && size.height > 0 ? tileGrid(size.width, size.height, z) : []),
    [size.width, size.height, z],
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1.5 no-drag">
      <div ref={ref} className="relative flex-1 min-h-[180px] overflow-hidden rounded-xl bg-white/[0.02]">
        {tiles.map(({ tx, ty, x, y }) => (
          <img
            key={`base-${z}-${tx}-${ty}`}
            src={`https://${"abcd"[(tx + ty) % 4]}.basemaps.cartocdn.com/dark_all/${z}/${tx}/${ty}.png`}
            className="absolute max-w-none"
            style={{ left: x, top: y, width: TILE, height: TILE }}
            alt=""
            draggable={false}
          />
        ))}
        {frame && size.width > 0 && (
          <img
            key={wmsUrl(frame.timeMs, size.width, size.height, z)}
            src={wmsUrl(frame.timeMs, size.width, size.height, z)}
            className="absolute inset-0 opacity-70 max-w-none"
            style={{ width: size.width, height: size.height }}
            alt=""
            draggable={false}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        {/* Moosburg marker */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-munich ring-2 ring-black/70 pointer-events-none" />
        {/* Zoom toggle */}
        <div className="absolute top-1.5 right-1.5 inline-flex bg-black/60 backdrop-blur-sm rounded-md p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setWide(false)}
            className={`px-2 py-1 rounded ${!wide ? "bg-white/15 text-ink-high" : "text-ink-mid"} transition`}
          >
            {t.widgets.weather.radarClose}
          </button>
          <button
            type="button"
            onClick={() => setWide(true)}
            className={`px-2 py-1 rounded ${wide ? "bg-white/15 text-ink-high" : "text-ink-mid"} transition`}
          >
            {t.widgets.weather.radarWide}
          </button>
        </div>
        <span className="absolute bottom-0.5 right-1.5 text-[9px] text-white/35 pointer-events-none">
          {t.widgets.weather.radarAttribution}
        </span>
      </div>

      <div className="flex items-center gap-2 px-0.5">
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={idx}
          onChange={(e) => {
            const v = Number(e.target.value);
            setPinnedIdx(v === PAST_STEPS ? null : v);
          }}
          className="flex-1 accent-munich h-1.5"
          aria-label={t.widgets.weather.radarSlider}
        />
        {frame && (
          <span className="text-xs tabular-nums whitespace-nowrap w-[6.5rem] text-right">
            <span className={frame.forecast ? "text-landshut" : "text-ink-mid"}>
              {TIME_FMT.format(new Date(frame.timeMs))}
            </span>
            {frame.forecast && (
              <span className="text-landshut text-[10px]"> · {t.widgets.weather.radarForecast}</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
