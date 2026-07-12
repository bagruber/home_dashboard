import { useEffect, useState } from "react";
import {
  activeFixture,
  fetchConnections,
  type Connection,
  type ConnectionsResponse,
  type Departure,
} from "../lib/api";
import { useElementSize } from "../lib/useElementSize";
import { usePolling } from "../lib/usePolling";
import { WidgetHeader } from "../components/WidgetHeader";
import { t } from "../strings.de";

const TIME_FMT = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const REFRESH_MS = 60_000;

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function minutesUntil(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - nowMs) / 60_000);
}

function formatRelative(mins: number | null): string | null {
  if (mins === null) return null;
  if (mins < -1) return null;
  if (mins <= 0) return t.widgets.trains.now;
  return t.widgets.trains.inMinutes(mins);
}

function destinationClass(direction: string | null, endsAtFreising: boolean): string {
  if (!direction) return "text-ink-high";
  if (endsAtFreising) return "text-freising";
  if (/münchen|muenchen|pasing/i.test(direction)) return "text-munich";
  if (/landshut|passau|regensburg|plattling|straubing|neufahrn|nürnberg|nuernberg|hof/i.test(direction)) return "text-landshut";
  return "text-ink-high";
}

function placeClass(place: string): string {
  if (/münchen|muenchen|pasing/i.test(place)) return "text-munich";
  if (/freising/i.test(place)) return "text-freising";
  if (/landshut/i.test(place)) return "text-landshut";
  return "text-ink-mid";
}

// The three destinations the household cares about. The minimal view shows the
// earliest train reaching each of them (München possibly via a transfer).
type Target = "münchen" | "freising" | "landshut";

function targetsOf(dep: Departure): Set<Target> {
  const targets = new Set<Target>();
  const d = (dep.direction ?? "").toLowerCase();
  if (/münchen|muenchen|pasing|freising/.test(d)) targets.add("freising");
  if (/landshut|passau|regensburg|plattling|straubing|nürnberg|nuernberg|hof/.test(d)) targets.add("landshut");
  if (/münchen|muenchen|pasing/.test(d)) targets.add("münchen");
  if (dep.connection && /münchen|muenchen|pasing/i.test(dep.connection.direction ?? "")) {
    targets.add("münchen");
  }
  return targets;
}

// Behind Landshut the line splits: RE3 continues towards Plattling/Passau,
// RE2/RE22/RE25 towards Regensburg. When showing two Landshut trains, prefer
// one from each branch.
const REGENSBURG_BRANCH = /regensburg|hof|nürnberg|nuernberg|schwandorf|weiden|cham/i;

function minimalPicks(deps: Departure[], perTarget: 1 | 2): Departure[] {
  const sorted = [...deps].sort((a, b) => {
    const aw = a.when ?? a.plannedWhen ?? "";
    const bw = b.when ?? b.plannedWhen ?? "";
    return aw.localeCompare(bw);
  });
  const chosen = new Set<Departure>();
  const candidates = (target: Target) =>
    sorted.filter((d) => !d.cancelled && targetsOf(d).has(target));

  for (const target of ["münchen", "freising"] satisfies Target[]) {
    for (const d of candidates(target).slice(0, perTarget)) chosen.add(d);
  }

  const north = candidates("landshut");
  if (perTarget === 1) {
    if (north[0]) chosen.add(north[0]);
  } else {
    const branchPicks = [
      north.find((d) => (d.line ?? "").toUpperCase() === "RE3"),
      north.find((d) => REGENSBURG_BRANCH.test(d.direction ?? "")),
    ].filter((d): d is Departure => d !== undefined);
    for (const d of branchPicks) chosen.add(d);
    // Fill up to two northbound rows when a branch has no departure in range.
    let count = new Set(branchPicks).size;
    for (const d of north) {
      if (count >= 2) break;
      if (!chosen.has(d)) {
        chosen.add(d);
        count++;
      }
    }
  }
  return sorted.filter((d) => chosen.has(d));
}

type ViewMode = "minimal" | "full";

export function TrainsWidget() {
  const { data, setData, error, setError } = usePolling<ConnectionsResponse>(
    (signal) => fetchConnections(signal, false),
    REFRESH_MS,
  );
  const [view, setView] = useState<ViewMode>("minimal");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshLockedUntil, setRefreshLockedUntil] = useState(0);
  const fixture = activeFixture();
  const now = useNow();
  const [ref, size] = useElementSize<HTMLDivElement>();
  // With enough vertical space, show two trains per destination.
  const perTarget: 1 | 2 = size.height >= 500 ? 2 : 1;

  const onRefresh = async () => {
    if (refreshing || now < refreshLockedUntil) return;
    setRefreshing(true);
    setRefreshLockedUntil(now + 10_000);
    try {
      setData(await fetchConnections(undefined, true));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setRefreshing(false);
  };

  const fetchedMins = data?.fetchedAt
    ? Math.max(0, Math.floor((now - new Date(data.fetchedAt).getTime()) / 60_000))
    : null;

  const all = data ? [...data.south, ...data.north] : [];

  return (
    <div ref={ref} className="h-full w-full flex flex-col px-5 py-4 gap-3">
      <WidgetHeader
        title={t.widgets.trains.title}
        right={
          <>
            <ViewToggle view={view} onChange={setView} />
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing || now < refreshLockedUntil}
              aria-label={t.widgets.trains.refresh}
              title={t.widgets.trains.refresh}
              className="text-ink-low hover:text-ink-high disabled:opacity-30 disabled:cursor-not-allowed transition p-2 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
            >
              <RefreshIcon spinning={refreshing} />
            </button>
          </>
        }
      />

      <div className="flex items-baseline justify-between gap-3 text-xs -mt-1">
        <div className="flex items-baseline gap-2">
          {fixture && (
            <span className="text-landshut">{t.widgets.trains.fixtureMode(fixture)}</span>
          )}
          {data?.stale && <span className="text-alert">{t.widgets.trains.stale}</span>}
          {!fixture && !data?.stale && (
            <span className="text-ink-low">{t.widgets.trains.stationInfo}</span>
          )}
        </div>
        {fetchedMins !== null && (
          <span className="text-ink-low">{t.widgets.trains.fetchedAgo(fetchedMins)}</span>
        )}
      </div>

      {error && !data && <div className="text-alert text-sm">{t.widgets.trains.error}</div>}
      {!error && data === null && <div className="text-ink-low text-sm">{t.widgets.trains.loading}</div>}

      {data && view === "full" && (
        <div className="flex-1 overflow-auto flex flex-col gap-5 no-drag">
          <DirectionSection title={t.widgets.trains.south} departures={data.south} nowMs={now} />
          <DirectionSection title={t.widgets.trains.north} departures={data.north} nowMs={now} />
        </div>
      )}

      {data && view === "minimal" && (
        <ul className="flex-1 overflow-auto flex flex-col gap-1.5 no-drag">
          {minimalPicks(all, perTarget).map((d) => (
            <DepartureRow key={d.tripId ?? d.plannedWhen} dep={d} nowMs={now} />
          ))}
          {all.length === 0 && (
            <div className="text-ink-low text-sm italic pl-1">{t.widgets.trains.noDepartures}</div>
          )}
        </ul>
      )}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex bg-white/[0.04] rounded-md p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("minimal")}
        className={`px-2.5 py-1.5 rounded min-h-[2rem] ${view === "minimal" ? "bg-white/10 text-ink-high" : "text-ink-low hover:text-ink-mid"} transition`}
      >
        {t.widgets.trains.viewMinimal}
      </button>
      <button
        type="button"
        onClick={() => onChange("full")}
        className={`px-2.5 py-1.5 rounded min-h-[2rem] ${view === "full" ? "bg-white/10 text-ink-high" : "text-ink-low hover:text-ink-mid"} transition`}
      >
        {t.widgets.trains.viewFull}
      </button>
    </div>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" className={spinning ? "animate-spin" : ""} aria-hidden>
      <path
        d="M3 8a5 5 0 0 1 8.6-3.5M13 3v3h-3M13 8a5 5 0 0 1-8.6 3.5M3 13v-3h3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DirectionSection({ title, departures, nowMs }: { title: string; departures: Departure[]; nowMs: number }) {
  return (
    <section>
      <h3 className="text-ink-low text-xs mb-2 pl-1">{title}</h3>
      {departures.length === 0 ? (
        <div className="text-ink-low text-sm italic pl-1">{t.widgets.trains.noDepartures}</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {departures.map((d, i) => (
            <DepartureRow key={d.tripId ?? `${i}`} dep={d} nowMs={nowMs} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One train, three lines:
 *  1. countdown · line chip (+soft facts) · terminus · platform
 *  2. departure time + live arrival chain (Freising / Landshut / terminus)
 *  3. transfer leg, when the München connection needs one
 */
function DepartureRow({ dep, nowMs }: { dep: Departure; nowMs: number }) {
  const endsAtFreising = dep.terminatesAtFreising ?? false;
  const destClass = destinationClass(dep.direction, endsAtFreising);
  const departIso = dep.when ?? dep.plannedWhen;
  const mins = minutesUntil(departIso, nowMs);
  const relText = formatRelative(mins);
  const imminent = !dep.cancelled && mins !== null && mins >= 0 && mins <= 3;
  const arrivals = dep.arrivals ?? [];

  return (
    <li className="row-in rounded-xl bg-white/[0.025] hover:bg-white/[0.04] transition-colors px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="w-[5.5rem] shrink-0">
          {relText && (
            <span
              className={[
                "text-[17px] font-semibold tabular-nums",
                dep.cancelled ? "text-ink-low line-through" : imminent ? "text-ink-high animate-pulse" : "text-ink-high",
              ].join(" ")}
            >
              {relText}
            </span>
          )}
        </div>
        <LineChip line={dep.line} hasSockets={dep.hasPowerSockets ?? false} hasWifi={dep.hasWifi ?? false} />
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className={`truncate font-medium text-[15px] ${dep.cancelled ? "line-through text-ink-low" : destClass}`}>
            {dep.direction ?? ""}
          </span>
          {dep.cancelled && (
            <span className="text-alert text-[11px] uppercase font-medium tracking-wider whitespace-nowrap">
              {t.widgets.trains.cancelled}
            </span>
          )}
        </div>
        {dep.platform && (
          <span className="text-ink-low text-xs whitespace-nowrap">{t.widgets.trains.platform(dep.platform)}</span>
        )}
      </div>

      {!dep.cancelled && (
        <div className="mt-1 ml-[5.5rem] pl-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs tabular-nums">
          <LiveTime format={t.widgets.trains.departs} planned={dep.plannedWhen} actual={dep.when} />
          {arrivals.map((a, i) => (
            <span key={i} className="flex items-baseline gap-1">
              <span className="text-ink-low" aria-hidden>·</span>
              <span className={placeClass(a.place)}>{shortPlace(a.place)}</span>
              <LiveTime planned={a.plannedTime ?? a.time} actual={a.time} />
            </span>
          ))}
        </div>
      )}

      {!dep.cancelled && dep.connection && <ConnectionLeg conn={dep.connection} nowMs={nowMs} />}
    </li>
  );
}

/** Shorten common terminus names so the arrival chain stays compact.
 *  (The backend already normalises names; this only compacts for display.) */
function shortPlace(place: string): string {
  return place
    .replace(/münchen flughafen terminal/i, "Flughafen")
    .replace(/flughafen münchen/i, "Flughafen")
    .replace(/\s*\(bay\)\s*hbf/i, "")
    .trim();
}

/** "ab 17:41" / "17:50"; when delayed, actual in alert + struck planned. */
function LiveTime({
  format,
  planned,
  actual,
}: {
  format?: (hhmm: string) => string;
  planned: string | null;
  actual: string | null;
}) {
  const shown = actual ?? planned;
  if (!shown) return null;
  const shownFmt = TIME_FMT.format(new Date(shown));
  const plannedFmt = planned ? TIME_FMT.format(new Date(planned)) : null;
  const delayed = plannedFmt !== null && plannedFmt !== shownFmt;
  return (
    <span className="flex items-baseline gap-1">
      <span className={delayed ? "text-alert font-medium" : "text-ink-mid"}>
        {format ? format(shownFmt) : shownFmt}
      </span>
      {delayed && plannedFmt && <span className="text-[11px] text-ink-low line-through">{plannedFmt}</span>}
    </span>
  );
}

function LineChip({
  line,
  size = "md",
  hasSockets = false,
  hasWifi = false,
}: {
  line: string | null;
  size?: "sm" | "md";
  hasSockets?: boolean;
  hasWifi?: boolean;
}) {
  if (!line) return null;
  const isSbahn = /^S\d/i.test(line);
  const isDb = /^(RE|RB|IC|EC|ICE)\b/i.test(line);
  const bg = isSbahn ? "bg-sbahn" : isDb ? "bg-db-red" : "bg-white/10";
  const dims = size === "sm" ? "text-[11px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`${bg} ${dims} text-white font-semibold tracking-wide rounded-md leading-none`}>
        {line}
      </span>
      {hasSockets && <PowerSocketIcon />}
      {hasWifi && <WifiIcon />}
    </span>
  );
}

function PowerSocketIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" className="text-ink-low shrink-0" aria-label="Steckdosen verfügbar">
      <path
        d="M6 1.5v3M10 1.5v3M4.5 4.5h7v3a3.5 3.5 0 0 1-7 0v-3zM8 11v3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" className="text-ink-low shrink-0" aria-label="WLAN verfügbar">
      <path
        d="M2 6.5a8.5 8.5 0 0 1 12 0M4.3 9a5.2 5.2 0 0 1 7.4 0M6.6 11.4a2 2 0 0 1 2.8 0"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="8" cy="13.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

function ConnectionLeg({ conn, nowMs }: { conn: Connection; nowMs: number }) {
  const effectiveTransfer = conn.realTransferMinutes ?? conn.transferMinutes;
  const status = conn.connectionStatus ?? (effectiveTransfer < 4 ? "tight" : "ok");
  const missed = status === "missed";
  const tight = status === "tight";
  const arrival = conn.arrival ? new Date(conn.arrival) : null;
  const transferPlace = conn.transferAt ?? "Freising";
  const mins = minutesUntil(conn.when ?? conn.plannedWhen, nowMs);

  return (
    <div className={`mt-1 ml-[5.5rem] pl-3 border-l ${missed ? "border-l-alert/60" : "border-l-freising/40"}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs tabular-nums">
        <span className={missed ? "text-alert font-medium" : tight ? "text-alert" : "text-ink-mid"}>
          {t.widgets.trains.transferAt(shortPlace(transferPlace))}
          {effectiveTransfer != null && ` (${t.widgets.trains.transferMinutes(effectiveTransfer)}${tight && !missed ? ` · ${t.widgets.trains.tightTransfer}` : ""})`}
        </span>
        <LineChip line={conn.line} size="sm" />
        {!conn.cancelled && !missed && (
          <LiveTime format={t.widgets.trains.departs} planned={conn.plannedWhen} actual={conn.when} />
        )}
        {conn.platform && (
          <span className="text-ink-low whitespace-nowrap">{t.widgets.trains.platform(conn.platform)}</span>
        )}
        {(conn.cancelled || missed) && (
          <span className="text-alert text-[11px] uppercase font-medium tracking-wider whitespace-nowrap">
            {conn.cancelled ? t.widgets.trains.cancelled : t.widgets.trains.missedConnection}
          </span>
        )}
        {!conn.cancelled && !missed && arrival && (
          <span className="flex items-baseline gap-1">
            <span className="text-ink-low" aria-hidden>·</span>
            <span className={placeClass(conn.direction ?? "")}>{shortPlace(conn.direction ?? "")}</span>
            <span className="text-ink-mid">{t.widgets.trains.arrives(TIME_FMT.format(arrival))}</span>
          </span>
        )}
        {mins !== null && mins >= 0 && !conn.cancelled && !missed && (
          <span className="text-ink-low">· {formatRelative(mins)}</span>
        )}
      </div>
      {missed && conn.alternativeWhen && conn.alternativeLine && (
        <div className="mt-0.5 text-xs text-ink-mid tabular-nums">
          {t.widgets.trains.alternative(conn.alternativeLine, TIME_FMT.format(new Date(conn.alternativeWhen)))}
        </div>
      )}
    </div>
  );
}
