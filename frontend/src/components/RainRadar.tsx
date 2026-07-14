import { useMemo, useState } from "react";
import { useElementSize } from "../lib/useElementSize";
import { usePolling } from "../lib/usePolling";
import { t } from "../strings.de";

// Moosburg a.d. Isar — mirrors the backend's weather coordinates.
const CENTER = { lat: 48.4673, lon: 11.9333 };
const CLOSE_ZOOM = 10; // roughly ±20 km around Moosburg
const WIDE_ZOOM = 8; // roughly ±80 km — rain fronts approaching
const TILE = 256;
const FRAMES_URL = "https://api.rainviewer.com/public/weather-maps.json";
const REFRESH_MS = 10 * 60_000;

const TIME_FMT = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

interface RadarFrame {
  time: number; // unix seconds
  path: string;
  nowcast: boolean;
}

interface RadarData {
  host: string;
  frames: RadarFrame[];
}

async function fetchFrames(signal?: AbortSignal): Promise<RadarData> {
  const res = await fetch(FRAMES_URL, { signal });
  if (!res.ok) throw new Error(`rainviewer: ${res.status}`);
  const data = await res.json();
  const past: RadarFrame[] = (data.radar?.past ?? []).map(
    (f: { time: number; path: string }) => ({ ...f, nowcast: false }),
  );
  const nowcast: RadarFrame[] = (data.radar?.nowcast ?? []).map(
    (f: { time: number; path: string }) => ({ ...f, nowcast: true }),
  );
  return { host: data.host, frames: [...past, ...nowcast] };
}

interface TilePos {
  tx: number;
  ty: number;
  x: number;
  y: number;
}

/** Web-Mercator tiles covering a w×h viewport centered on CENTER. */
function tilesFor(w: number, h: number, z: number): TilePos[] {
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

/** Live rain radar (RainViewer, no API key) on a dark Carto basemap.
 *  Two zoom steps and a slider over the past 2 h + short-term forecast. */
export function RainRadar() {
  const { data } = usePolling<RadarData>(fetchFrames, REFRESH_MS);
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [wide, setWide] = useState(false);
  // null → follow the most recent live frame even after a data refresh.
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);

  const frames = data?.frames ?? [];
  const lastLive = frames.reduce((last, f, i) => (f.nowcast ? last : i), 0);
  const idx = pinnedIdx !== null && pinnedIdx < frames.length ? pinnedIdx : lastLive;
  const frame = frames[idx];
  const z = wide ? WIDE_ZOOM : CLOSE_ZOOM;

  const tiles = useMemo(
    () => (size.width > 0 && size.height > 0 ? tilesFor(size.width, size.height, z) : []),
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
        {frame &&
          data &&
          tiles.map(({ tx, ty, x, y }) => (
            <img
              key={`radar-${z}-${tx}-${ty}-${frame.path}`}
              src={`${data.host}${frame.path}/${TILE}/${z}/${tx}/${ty}/2/1_1.png`}
              className="absolute max-w-none opacity-70"
              style={{ left: x, top: y, width: TILE, height: TILE }}
              alt=""
              draggable={false}
            />
          ))}
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

      {frames.length > 0 && (
        <div className="flex items-center gap-2 px-0.5">
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={idx}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPinnedIdx(v === lastLive ? null : v);
            }}
            className="flex-1 accent-munich h-1.5"
            aria-label={t.widgets.weather.radarSlider}
          />
          {frame && (
            <span className="text-xs tabular-nums whitespace-nowrap w-[6.5rem] text-right">
              <span className={frame.nowcast ? "text-landshut" : "text-ink-mid"}>
                {TIME_FMT.format(new Date(frame.time * 1000))}
              </span>
              {frame.nowcast && (
                <span className="text-landshut text-[10px]"> · {t.widgets.weather.radarForecast}</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
