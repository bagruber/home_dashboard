import { useEffect, useState, type FormEvent } from "react";
import {
  addParcel,
  CARRIERS,
  deleteParcel,
  fetchParcels,
  refreshParcel,
  type Carrier,
  type Parcel,
  type ParcelStatus,
  type ParcelsResponse,
} from "../lib/parcels";
import { usePolling } from "../lib/usePolling";
import { WidgetHeader } from "../components/WidgetHeader";
import { t } from "../strings.de";

const REFRESH_MS = 5 * 60_000;

function statusClass(s: ParcelStatus): string {
  switch (s) {
    case "delivered":
      return "bg-person-papa text-white";
    case "out_for_delivery":
      return "bg-landshut text-black";
    case "available_for_pickup":
      return "bg-freising text-black";
    case "in_transit":
      return "bg-white/15 text-ink-high";
    case "exception":
      return "bg-alert text-white";
    default:
      return "bg-white/[0.06] text-ink-mid";
  }
}

function minutesAgo(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 60_000));
}

const DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Berlin",
});
const TIME_FMT = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

function etaLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hasTime = iso.includes("T") && !iso.endsWith("T00:00:00");
  return hasTime ? `${DATE_FMT.format(d)} · ${TIME_FMT.format(d)}` : DATE_FMT.format(d);
}

export function ParcelsWidget() {
  const { data, setData, error, setError } = usePolling<ParcelsResponse>(
    (signal) => fetchParcels(true, signal),
    REFRESH_MS,
  );
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const onAdded = (p: Parcel) => {
    setData((curr) => (curr ? { ...curr, items: [p, ...curr.items] } : { items: [p], dhlConfigured: false }));
    setAdding(false);
  };

  const onDelete = async (id: string) => {
    const prev = data;
    setData((curr) => (curr ? { ...curr, items: curr.items.filter((x) => x.id !== id) } : curr));
    try {
      await deleteParcel(id);
    } catch (err) {
      setData(prev);
      setError((err as Error).message);
    }
  };

  const onRefreshOne = async (id: string) => {
    try {
      const updated = await refreshParcel(id);
      setData((curr) =>
        curr ? { ...curr, items: curr.items.map((x) => (x.id === id ? updated : x)) } : curr,
      );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="h-full w-full flex flex-col px-4 py-3 gap-2">
      <WidgetHeader
        title={t.widgets.parcels.title}
        right={
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-label={t.widgets.parcels.add}
            className="text-ink-low hover:text-ink-high transition text-2xl leading-none p-2 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
          >
            {adding ? "×" : "+"}
          </button>
        }
      />

      {adding && <AddParcelForm onAdded={onAdded} onError={setError} onCancel={() => setAdding(false)} />}

      {error && <div className="text-alert text-sm">{t.widgets.parcels.error}</div>}

      <div className="flex-1 overflow-auto no-drag flex flex-col gap-1">
        {data === null && <div className="text-ink-low text-sm">{t.widgets.parcels.loading}</div>}
        {data !== null && items.length === 0 && (
          <div className="text-ink-low text-sm italic">{t.widgets.parcels.empty}</div>
        )}
        {items.map((p) => (
          <ParcelRow key={p.id} parcel={p} nowMs={now} onDelete={onDelete} onRefresh={onRefreshOne} />
        ))}
      </div>

      {data && !data.t17Configured && !data.dhlConfigured && items.length > 0 && (
        <div className="text-ink-low text-[11px] italic leading-snug">{t.widgets.parcels.trackingHint}</div>
      )}
    </div>
  );
}

function ParcelRow({
  parcel,
  nowMs,
  onDelete,
  onRefresh,
}: {
  parcel: Parcel;
  nowMs: number;
  onDelete: (id: string) => void;
  onRefresh: (id: string) => void;
}) {
  const ago = minutesAgo(parcel.lastChecked, nowMs);
  const eta = etaLabel(parcel.estimatedDelivery);
  return (
    <div className="row-in flex flex-col gap-1 rounded-lg bg-white/[0.025] hover:bg-white/[0.05] transition-colors px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={`text-[11px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${statusClass(parcel.status)}`}>
          {t.widgets.parcels.status[parcel.status]}
        </span>
        <span className="flex-1 min-w-0 text-ink-high text-sm truncate">
          {parcel.label || parcel.trackingNumber}
        </span>
        <span className="text-ink-low text-xs uppercase">{parcel.carrier}</span>
        <button
          type="button"
          onClick={() => onRefresh(parcel.id)}
          aria-label={t.widgets.parcels.refreshLabel}
          title={t.widgets.parcels.refreshLabel}
          className="text-ink-low hover:text-ink-high transition p-1.5 min-w-[2.5rem] min-h-[2.5rem] flex items-center justify-center"
        >
          <RefreshIcon />
        </button>
        {parcel.url && (
          <a
            href={parcel.url}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={t.widgets.parcels.openLabel}
            title={t.widgets.parcels.openLabel}
            className="text-ink-low hover:text-ink-high transition p-1.5 min-w-[2.5rem] min-h-[2.5rem] flex items-center justify-center"
          >
            <ExternalIcon />
          </a>
        )}
        <button
          type="button"
          onClick={() => onDelete(parcel.id)}
          aria-label={t.widgets.parcels.deleteLabel}
          className="text-ink-low hover:text-alert transition text-lg leading-none p-2 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
        >
          ×
        </button>
      </div>
      {(parcel.lastEvent?.text || eta || ago !== null) && (
        <div className="flex items-baseline gap-2 text-xs text-ink-low pl-1">
          {parcel.lastEvent?.text && <span className="flex-1 truncate">{parcel.lastEvent.text}</span>}
          {eta && <span className="text-ink-mid whitespace-nowrap">{t.widgets.parcels.eta(eta)}</span>}
          {ago !== null && <span className="whitespace-nowrap">{t.widgets.parcels.lastChecked(ago)}</span>}
        </div>
      )}
    </div>
  );
}

interface AddProps {
  onAdded: (p: Parcel) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}

function AddParcelForm({ onAdded, onError, onCancel }: AddProps) {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState<Carrier>("dhl");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const tn = trackingNumber.trim();
    if (!tn || busy) return;
    setBusy(true);
    try {
      const created = await addParcel({ trackingNumber: tn, carrier, label: label.trim() || null });
      onAdded(created);
      setTrackingNumber("");
      setLabel("");
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="no-drag flex flex-col gap-2 rounded-lg bg-white/[0.03] p-2.5">
      <input
        type="text"
        value={trackingNumber}
        onChange={(e) => setTrackingNumber(e.target.value)}
        placeholder={t.widgets.parcels.trackingPlaceholder}
        maxLength={60}
        className="rounded-md bg-white/[0.04] border border-white/5 text-ink-high text-sm px-2.5 py-1.5 placeholder:text-ink-low focus:outline-none focus:border-white/15"
      />
      <div className="flex gap-2">
        <select
          value={carrier}
          onChange={(e) => setCarrier(e.target.value as Carrier)}
          aria-label={t.widgets.parcels.carrierField}
          className="rounded-md bg-white/[0.04] border border-white/5 text-ink-high text-sm px-2 py-1.5 focus:outline-none focus:border-white/15"
        >
          {CARRIERS.map((c) => (
            <option key={c.id} value={c.id} className="bg-surface-2">
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t.widgets.parcels.labelPlaceholder}
          maxLength={120}
          className="flex-1 min-w-0 rounded-md bg-white/[0.04] border border-white/5 text-ink-high text-sm px-2.5 py-1.5 placeholder:text-ink-low focus:outline-none focus:border-white/15"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md text-ink-mid hover:text-ink-high text-sm transition"
        >
          {t.widgets.parcels.cancel}
        </button>
        <button
          type="submit"
          disabled={!trackingNumber.trim() || busy}
          className="px-3 py-1.5 rounded-md bg-white/10 text-ink-high text-sm hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          {t.widgets.parcels.save}
        </button>
      </div>
    </form>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path
        d="M3 8a5 5 0 0 1 8.6-3.5M13 3v3h-3M13 8a5 5 0 0 1-8.6 3.5M3 13v-3h3"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      <path
        d="M9.5 2.5h4v4M13 3L7.5 8.5M12.5 9.5V13a.5.5 0 0 1-.5.5H3A.5.5 0 0 1 2.5 13V4A.5.5 0 0 1 3 3.5h3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
