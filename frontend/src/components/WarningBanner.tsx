import { fetchWarnings } from "../lib/warnings";
import { usePolling } from "../lib/usePolling";
import { t } from "../strings.de";

const REFRESH_MS = 10 * 60_000;

const UNTIL_FMT = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

function levelClasses(level: number): string {
  if (level >= 4) return "border-l-alert bg-alert/10";
  if (level === 3) return "border-l-house bg-house/10";
  return "border-l-landshut bg-landshut/10";
}

/** DWD weather warning strip. Renders nothing unless a warning is active. */
export function WarningBanner() {
  const { data } = usePolling(fetchWarnings, REFRESH_MS);
  const warnings = (data?.warnings ?? []).filter((w) => !w.preWarning);
  if (warnings.length === 0) return null;
  const top = [...warnings].sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0];

  return (
    <div
      className={`mx-4 mb-2 px-4 py-2.5 rounded-xl border-l-4 flex items-baseline gap-3 ${levelClasses(top.level ?? 2)}`}
      role="alert"
    >
      <span aria-hidden>⚠️</span>
      <span className="text-ink-high text-sm font-medium min-w-0 truncate">
        {top.headline ?? top.event ?? t.warnings.generic}
      </span>
      {top.end && (
        <span className="ml-auto text-ink-mid text-xs whitespace-nowrap tabular-nums">
          {t.warnings.until(UNTIL_FMT.format(new Date(top.end)))}
        </span>
      )}
      {warnings.length > 1 && (
        <span className="text-ink-low text-xs whitespace-nowrap">
          {t.warnings.more(warnings.length - 1)}
        </span>
      )}
    </div>
  );
}
