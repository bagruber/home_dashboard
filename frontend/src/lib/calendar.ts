export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM or null for all-day
  persons: string[];
  blocksHouse: boolean;
  area: string | null;
  createdAt: string;
}

export interface CalendarResponse {
  events: CalendarEvent[];
}

export async function fetchCalendar(signal?: AbortSignal): Promise<CalendarResponse> {
  const res = await fetch("/api/calendar", { signal });
  if (!res.ok) throw new Error(`calendar: ${res.status}`);
  return res.json();
}

export interface NewEventInput {
  title: string;
  date: string;
  time: string | null;
  persons: string[];
  blocksHouse: boolean;
  area: string | null;
}

export async function addCalendarEvent(input: NewEventInput): Promise<CalendarEvent> {
  const res = await fetch("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`calendar add: ${res.status}`);
  return res.json();
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const res = await fetch(`/api/calendar/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`calendar delete: ${res.status}`);
}

export async function importIcs(text: string): Promise<number> {
  const res = await fetch("/api/calendar/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ics: text }),
  });
  if (!res.ok) throw new Error(`calendar import: ${res.status}`);
  const data = (await res.json()) as { imported: number };
  return data.imported;
}
