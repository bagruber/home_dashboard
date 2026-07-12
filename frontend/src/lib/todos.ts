export interface TodoItem {
  id: string;
  title: string;
  assignee: string | null;
  due: string | null; // YYYY-MM-DD
  done: boolean;
  createdAt: string;
  doneAt: string | null;
}

export interface TodoList {
  items: TodoItem[];
}

export interface NewTodoInput {
  title: string;
  assignee: string | null;
  due: string | null;
}

export async function fetchTodos(signal?: AbortSignal): Promise<TodoList> {
  const res = await fetch("/api/todos", { signal });
  if (!res.ok) throw new Error(`todos: ${res.status}`);
  return res.json();
}

export async function addTodo(input: NewTodoInput): Promise<TodoItem> {
  const res = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`todo add: ${res.status}`);
  return res.json();
}

export async function setTodoDone(id: string, done: boolean): Promise<TodoItem> {
  const res = await fetch(`/api/todos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ done }),
  });
  if (!res.ok) throw new Error(`todo patch: ${res.status}`);
  return res.json();
}

export async function deleteTodo(id: string): Promise<void> {
  const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`todo delete: ${res.status}`);
}

export async function clearDoneTodos(): Promise<number> {
  const res = await fetch("/api/todos/clear-done", { method: "POST" });
  if (!res.ok) throw new Error(`todo clear-done: ${res.status}`);
  const data = (await res.json()) as { removed: number };
  return data.removed;
}

// Urgency derived purely from the due date. Used to color the chip and sort the list.
export type Urgency = "overdue" | "today" | "soon" | "later" | "none";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function urgencyOf(due: string | null): { tier: Urgency; daysUntil: number | null } {
  if (!due) return { tier: "none", daysUntil: null };
  const today = todayIso();
  if (due < today) return { tier: "overdue", daysUntil: -daysBetween(due, today) };
  if (due === today) return { tier: "today", daysUntil: 0 };
  const diff = daysBetween(today, due);
  if (diff <= 3) return { tier: "soon", daysUntil: diff };
  return { tier: "later", daysUntil: diff };
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime();
  return Math.round(ms / 86_400_000);
}

const URGENCY_ORDER: Record<Urgency, number> = {
  overdue: 0,
  today: 1,
  soon: 2,
  later: 3,
  none: 4,
};

export function sortTodos(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const au = urgencyOf(a.due).tier;
    const bu = urgencyOf(b.due).tier;
    if (au !== bu) return URGENCY_ORDER[au] - URGENCY_ORDER[bu];
    if ((a.due ?? "") !== (b.due ?? "")) return (a.due ?? "9").localeCompare(b.due ?? "9");
    return a.createdAt.localeCompare(b.createdAt);
  });
}
