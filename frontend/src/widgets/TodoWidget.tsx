import { useMemo, useState, type FormEvent } from "react";
import {
  addTodo,
  clearDoneTodos,
  deleteTodo,
  fetchTodos,
  setTodoDone,
  sortTodos,
  urgencyOf,
  type TodoItem,
  type Urgency,
} from "../lib/todos";
import { PEOPLE } from "../lib/people";
import { PersonDot } from "../components/PersonStripes";
import { WidgetHeader } from "../components/WidgetHeader";
import { useElementSize } from "../lib/useElementSize";
import { usePolling } from "../lib/usePolling";
import { t } from "../strings.de";

const REFRESH_MS = 30_000;

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function urgencyText(u: Urgency, daysUntil: number | null): string | null {
  if (u === "overdue") return t.widgets.todos.overdue;
  if (u === "today") return t.widgets.todos.today;
  if (u === "soon" && daysUntil === 1) return t.widgets.todos.tomorrow;
  if (u === "soon" && daysUntil !== null) return t.widgets.todos.inDays(daysUntil);
  if (u === "later" && daysUntil !== null) return t.widgets.todos.inDays(daysUntil);
  return null;
}

function urgencyClass(u: Urgency): string {
  if (u === "overdue") return "text-alert font-medium";
  if (u === "today") return "text-house";
  if (u === "soon") return "text-landshut";
  return "text-ink-low";
}

export function TodoWidget() {
  const {
    data: items,
    setData: setItems,
    error,
    setError,
    reload,
  } = usePolling<TodoItem[]>(async (signal) => (await fetchTodos(signal)).items, REFRESH_MS);
  const [adding, setAdding] = useState(false);
  const [filterPerson, setFilterPerson] = useState<string | null>(null);
  const [ref, size] = useElementSize<HTMLDivElement>();
  // The person filter only earns its space in larger cells.
  const showFilter = size.width >= 300 && size.height >= 240;

  const sorted = useMemo(() => (items ? sortTodos(items) : []), [items]);
  const matches = (it: TodoItem) =>
    !showFilter || !filterPerson || it.assignee === filterPerson;
  const open = sorted.filter((it) => !it.done && matches(it));
  const done = sorted.filter((it) => it.done && matches(it));

  const onAdded = (it: TodoItem) => {
    setItems((curr) => (curr ? [...curr, it] : [it]));
    setAdding(false);
  };

  const onToggle = async (it: TodoItem) => {
    const next = !it.done;
    setItems((curr) =>
      curr
        ? curr.map((x) =>
            x.id === it.id ? { ...x, done: next, doneAt: next ? new Date().toISOString() : null } : x,
          )
        : curr,
    );
    try {
      await setTodoDone(it.id, next);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async (id: string) => {
    const prev = items;
    setItems((curr) => (curr ? curr.filter((x) => x.id !== id) : curr));
    try {
      await deleteTodo(id);
    } catch (err) {
      setItems(prev);
      setError((err as Error).message);
    }
  };

  const onClearDone = async () => {
    try {
      await clearDoneTodos();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div ref={ref} className="h-full w-full flex flex-col px-4 py-3 gap-2">
      <WidgetHeader
        title={t.widgets.todos.title}
        right={
          <>
            {done.length > 0 && (
              <button
                type="button"
                onClick={onClearDone}
                className="text-ink-low hover:text-ink-mid text-xs transition px-1"
                title={t.widgets.todos.clearDone}
              >
                {t.widgets.todos.clearDone}
              </button>
            )}
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="text-ink-low hover:text-ink-high transition text-2xl leading-none p-2 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
              aria-label={t.widgets.todos.add}
            >
              {adding ? "×" : "+"}
            </button>
          </>
        }
      />

      {showFilter && (
        <div className="flex flex-wrap gap-1 no-drag">
          {PEOPLE.map((p) => {
            const on = filterPerson === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setFilterPerson(on ? null : p.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  on ? `${p.bgClass} text-white` : "bg-white/[0.04] text-ink-low hover:text-ink-mid"
                }`}
              >
                {p.displayName}
              </button>
            );
          })}
        </div>
      )}

      {adding && <AddTodoForm onAdded={onAdded} onError={setError} onCancel={() => setAdding(false)} />}

      {error && <div className="text-alert text-sm">{t.widgets.todos.error}</div>}

      <div className="flex-1 overflow-auto no-drag">
        {items === null && <div className="text-ink-low text-sm">{t.widgets.todos.loading}</div>}
        {items !== null && open.length === 0 && done.length === 0 && (
          <div className="text-ink-low text-sm italic">{t.widgets.todos.empty}</div>
        )}
        {open.length > 0 && (
          <ul className="flex flex-col gap-1">
            {open.map((it) => (
              <TodoRow key={it.id} item={it} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <div className="mt-3">
            <div className="text-ink-low text-xs uppercase tracking-wider mb-1 pl-1">
              {t.widgets.todos.doneSection} · {done.length}
            </div>
            <ul className="flex flex-col gap-1">
              {done.map((it) => (
                <TodoRow key={it.id} item={it} onToggle={onToggle} onDelete={onDelete} muted />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

interface TodoRowProps {
  item: TodoItem;
  onToggle: (it: TodoItem) => void;
  onDelete: (id: string) => void;
  muted?: boolean;
}

function TodoRow({ item, onToggle, onDelete, muted }: TodoRowProps) {
  const { tier, daysUntil } = urgencyOf(item.due);
  const urgent = urgencyText(tier, daysUntil);
  return (
    <li
      className={`row-in flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
        muted ? "bg-white/[0.015]" : "bg-white/[0.025] hover:bg-white/[0.05]"
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-label={item.done ? "Wieder offen" : "Erledigen"}
        className={`shrink-0 w-9 h-9 rounded-md border flex items-center justify-center transition ${
          item.done
            ? "bg-white/20 border-white/30 text-ink-high"
            : "bg-transparent border-white/25 hover:border-white/50 active:bg-white/10"
        }`}
      >
        {item.done && (
          <svg viewBox="0 0 16 16" width="14" height="14" className="check-pop" aria-hidden>
            <path
              d="M3 8.5L6.5 12L13 5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      {item.assignee && <PersonDot id={item.assignee} />}
      <span
        className={`flex-1 break-words text-[14px] ${
          item.done ? "line-through text-ink-low" : "text-ink-high"
        }`}
      >
        {item.title}
      </span>
      {urgent && !item.done && (
        <span className={`text-xs tabular-nums whitespace-nowrap ${urgencyClass(tier)}`}>{urgent}</span>
      )}
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        aria-label={t.widgets.todos.deleteLabel}
        className="text-ink-low hover:text-alert transition text-lg leading-none p-2 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center"
      >
        ×
      </button>
    </li>
  );
}

interface AddProps {
  onAdded: (it: TodoItem) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}

function AddTodoForm({ onAdded, onError, onCancel }: AddProps) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const it = await addTodo({ title: trimmed, assignee, due: due || null });
      onAdded(it);
      setTitle("");
      setDue("");
      setAssignee(null);
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
        placeholder={t.widgets.todos.placeholder}
        maxLength={200}
        className="rounded-md bg-white/[0.04] border border-white/5 text-ink-high text-sm px-2.5 py-1.5 placeholder:text-ink-low focus:outline-none focus:border-white/15"
      />
      <div className="flex gap-1.5">
        <div className="flex-1 flex flex-wrap gap-1">
          {PEOPLE.map((p) => {
            const on = assignee === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setAssignee(on ? null : p.id)}
                className={`px-2 py-1 rounded-md text-xs font-medium transition ${
                  on ? `${p.bgClass} text-white` : "bg-white/[0.04] text-ink-low hover:text-ink-mid"
                }`}
              >
                {p.displayName}
              </button>
            );
          })}
        </div>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          min={todayIso()}
          className="w-[8.5rem] rounded-md bg-white/[0.04] border border-white/5 text-ink-high text-sm px-2 py-1.5 focus:outline-none focus:border-white/15"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md text-ink-mid hover:text-ink-high text-sm transition"
        >
          {t.widgets.todos.cancel}
        </button>
        <button
          type="submit"
          disabled={!title.trim() || busy}
          className="px-3 py-1.5 rounded-md bg-white/10 text-ink-high text-sm hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          {t.widgets.todos.save}
        </button>
      </div>
    </form>
  );
}
