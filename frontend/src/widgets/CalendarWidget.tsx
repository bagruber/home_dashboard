import { useMemo, useState, type FormEvent } from "react";
import {
  addCalendarEvent,
  deleteCalendarEvent,
  fetchCalendar,
  importIcs,
  type CalendarEvent,
} from "../lib/calendar";
import { PersonPicker, PersonStripes, personStripesWidth } from "../components/PersonStripes";
import { WidgetHeader } from "../components/WidgetHeader";
import { usePolling } from "../lib/usePolling";
import { t } from "../strings.de";

const REFRESH_MS = 60_000;

function todayIsoDate(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function isPast(date: string): boolean {
  return date < todayIsoDate();
}

function dayLabel(dateStr: string): string {
  const today = todayIsoDate();
  const tomorrow = (() => {
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  if (dateStr === today) return t.widgets.calendar.today;
  if (dateStr === tomorrow) return t.widgets.calendar.tomorrow;
  return t.widgets.calendar.groupLabel(new Date(dateStr + "T00:00:00"));
}

type FormMode = null | "add" | "ics";

export function CalendarWidget() {
  const {
    data: events,
    setData: setEvents,
    error,
    setError,
    reload,
  } = usePolling<CalendarEvent[]>(async (signal) => (await fetchCalendar(signal)).events, REFRESH_MS);
  const [mode, setMode] = useState<FormMode>(null);

  const upcoming = useMemo(() => {
    if (!events) return null;
    return events.filter((ev) => !isPast(ev.date));
  }, [events]);

  const grouped = useMemo(() => {
    if (!upcoming) return [];
    const map = new Map<string, CalendarEvent[]>();
    // "Heute" is always shown, even without events — the most common glance
    // ("ist heute was?") should be answerable without reading.
    map.set(todayIsoDate(), []);
    for (const ev of upcoming) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [upcoming]);

  const onDelete = async (id: string) => {
    const prev = events;
    setEvents((curr) => (curr ? curr.filter((x) => x.id !== id) : curr));
    try {
      await deleteCalendarEvent(id);
    } catch (err) {
      setEvents(prev);
      setError((err as Error).message);
    }
  };

  const onAdded = (ev: CalendarEvent) => {
    setEvents((curr) => (curr ? [...curr, ev] : [ev]));
    setMode(null);
  };

  const onImported = async () => {
    setMode(null);
    await reload();
  };

  return (
    <div className="h-full w-full flex flex-col px-4 py-3 gap-2">
      <WidgetHeader
        title={t.widgets.calendar.title}
        right={
          <>
            <button
              type="button"
              onClick={() => setMode((m) => (m === "ics" ? null : "ics"))}
              aria-label={t.widgets.calendar.icsImport}
              title={t.widgets.calendar.icsImport}
              className="text-ink-low hover:text-ink-high transition p-2 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
            >
              <ImportIcon />
            </button>
            <button
              type="button"
              onClick={() => setMode((m) => (m === "add" ? null : "add"))}
              className="text-ink-low hover:text-ink-high transition text-2xl leading-none p-2 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
              aria-label={t.widgets.calendar.addNew}
            >
              {mode === "add" ? "×" : "+"}
            </button>
          </>
        }
      />

      {mode === "add" && (
        <AddEventForm onAdded={onAdded} onError={setError} onCancel={() => setMode(null)} />
      )}
      {mode === "ics" && (
        <IcsImportForm onDone={onImported} onError={setError} onCancel={() => setMode(null)} />
      )}

      {error && <div className="text-alert text-sm">{t.widgets.calendar.error}</div>}

      <div className="flex-1 overflow-auto no-drag">
        {events === null && <div className="text-ink-low text-sm">{t.widgets.calendar.loading}</div>}
        {grouped.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {grouped.map(([date, dayEvents]) => (
              <section key={date}>
                <div className="text-ink-low text-xs uppercase tracking-wider mb-1 pl-1">{dayLabel(date)}</div>
                {dayEvents.length === 0 ? (
                  <div className="text-ink-low text-sm pl-1">{t.widgets.calendar.freeDay}</div>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {dayEvents.map((ev) => (
                      <EventRow key={ev.id} ev={ev} onDelete={onDelete} />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventRow({ ev, onDelete }: { ev: CalendarEvent; onDelete: (id: string) => void }) {
  const stripesPx = personStripesWidth(ev.persons.length);
  const padLeft = `${stripesPx + 8}px`;
  return (
    <li
      className={`row-in relative overflow-hidden rounded-lg transition-colors ${
        ev.blocksHouse ? "bg-house/10 hover:bg-house/15" : "bg-white/[0.025] hover:bg-white/[0.05]"
      }`}
    >
      <PersonStripes ids={ev.persons} />
      <div className="flex items-stretch">
        <div
          className="flex-1 flex items-center gap-2 py-1.5 pr-1 min-w-0"
          style={{ paddingLeft: padLeft }}
        >
          <span className="w-12 tabular-nums text-ink-mid text-xs shrink-0">
            {ev.time ?? t.widgets.calendar.allDay}
          </span>
          <span className="flex-1 min-w-0 text-ink-high text-sm break-words leading-tight">{ev.title}</span>
          <button
            type="button"
            onClick={() => onDelete(ev.id)}
            aria-label={t.widgets.calendar.deleteLabel}
            className="text-ink-low hover:text-alert transition-colors text-lg leading-none p-2 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
          >
            ×
          </button>
        </div>
        {ev.blocksHouse && (
          <div className="flex flex-col items-center justify-center gap-0.5 px-2.5 py-1.5 bg-white/[0.09] border-l border-l-white/15 min-w-[3.25rem] text-ink-high">
            <HomeIcon />
            {ev.area && (
              <span className="text-[11px] text-ink-mid max-w-[3rem] text-center leading-tight break-words">
                {ev.area}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden>
      <path
        d="M2 9L9 2.5L16 9V15a.5.5 0 0 1-.5.5h-3.75v-4.5h-3.5v4.5H2.5A.5.5 0 0 1 2 15z"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface AddProps {
  onAdded: (ev: CalendarEvent) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}

function AddEventForm({ onAdded, onError, onCancel }: AddProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => todayIsoDate());
  const [time, setTime] = useState("");
  const [persons, setPersons] = useState<string[]>([]);
  const [blocksHouse, setBlocksHouse] = useState(false);
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !date || busy) return;
    setBusy(true);
    try {
      const ev = await addCalendarEvent({
        title: trimmed,
        date,
        time: time || null,
        persons,
        blocksHouse,
        area: blocksHouse && area.trim() ? area.trim() : null,
      });
      onAdded(ev);
      setTitle("");
      setTime("");
      setPersons([]);
      setBlocksHouse(false);
      setArea("");
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
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t.widgets.calendar.titleField}
        maxLength={200}
        className="rounded-md bg-white/[0.04] border border-white/5 text-ink-high text-sm px-2.5 py-1.5 placeholder:text-ink-low focus:outline-none focus:border-white/15"
      />
      <div className="flex gap-1.5">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 min-w-0 rounded-md bg-white/[0.04] border border-white/5 text-ink-high text-sm px-2 py-1.5 focus:outline-none focus:border-white/15"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-24 rounded-md bg-white/[0.04] border border-white/5 text-ink-high text-sm px-2 py-1.5 focus:outline-none focus:border-white/15"
        />
      </div>
      <div>
        <div className="text-ink-low text-[11px] uppercase tracking-wider mb-1">{t.widgets.calendar.assignTo}</div>
        <PersonPicker selected={persons} onChange={setPersons} />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-mid cursor-pointer select-none">
        <input
          type="checkbox"
          checked={blocksHouse}
          onChange={(e) => setBlocksHouse(e.target.checked)}
          className="accent-house"
        />
        {t.widgets.calendar.blocksHouse}
      </label>
      {blocksHouse && (
        <input
          type="text"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder={t.widgets.calendar.areaField}
          maxLength={80}
          className="rounded-md bg-white/[0.04] border border-white/5 text-ink-high text-sm px-2.5 py-1.5 placeholder:text-ink-low focus:outline-none focus:border-white/15"
        />
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md text-ink-mid hover:text-ink-high text-sm transition"
        >
          {t.widgets.calendar.cancel}
        </button>
        <button
          type="submit"
          disabled={!title.trim() || !date || busy}
          className="px-3 py-1.5 rounded-md bg-white/10 text-ink-high text-sm hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          {t.widgets.calendar.save}
        </button>
      </div>
    </form>
  );
}

function IcsImportForm({
  onDone,
  onError,
  onCancel,
}: {
  onDone: () => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const n = await importIcs(text);
      setInfo(t.widgets.calendar.icsImported(n));
      if (n > 0) {
        window.setTimeout(onDone, 700);
      }
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="no-drag flex flex-col gap-2 rounded-lg bg-white/[0.03] p-2.5">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.widgets.calendar.icsPlaceholder}
        rows={6}
        className="rounded-md bg-white/[0.04] border border-white/5 text-ink-high text-xs px-2.5 py-1.5 placeholder:text-ink-low focus:outline-none focus:border-white/15 font-mono"
      />
      {info && <div className="text-ink-mid text-xs">{info}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md text-ink-mid hover:text-ink-high text-sm transition"
        >
          {t.widgets.calendar.cancel}
        </button>
        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="px-3 py-1.5 rounded-md bg-white/10 text-ink-high text-sm hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          {t.widgets.calendar.icsImportButton}
        </button>
      </div>
    </form>
  );
}

function ImportIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path
        d="M8 1.5v8M5 7l3 3 3-3M2.5 12.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
