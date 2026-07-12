export type ConnectionStatus = "ok" | "tight" | "missed";

export interface Connection {
  /** Station where the transfer happens (first-leg destination). */
  transferAt?: string | null;
  line: string | null;
  product: string | null;
  direction: string | null;
  plannedWhen: string | null;
  when: string | null;
  delayMinutes: number | null;
  platform: string | null;
  cancelled: boolean;
  transferMinutes: number;
  arrival?: string | null;
  /** Recomputed transfer using real arrival of the feeder train. */
  realTransferMinutes?: number | null;
  connectionStatus?: ConnectionStatus | null;
  /** Suggested next onward train when the original connection is missed. */
  alternativeWhen?: string | null;
  alternativeLine?: string | null;
}

export interface Arrival {
  place: string;
  time: string;
  /** Planned scheduled time, when distinct from `time` (which is the actual ETA). */
  plannedTime?: string | null;
}

export interface Departure {
  tripId: string | null;
  line: string | null;
  product: string | null;
  direction: string | null;
  plannedWhen: string | null;
  when: string | null;
  delayMinutes: number | null;
  platform: string | null;
  cancelled: boolean;
  terminatesAtFreising?: boolean;
  hasPowerSockets?: boolean;
  hasWifi?: boolean;
  arrivals?: Arrival[];
  connection?: Connection;
}

export interface ConnectionsResponse {
  south: Departure[];
  north: Departure[];
  stale: boolean;
  fetchedAt?: string;
  source?: "live" | "fixture";
}

const FIXTURE_PARAM = "fixture";

function fixtureFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(FIXTURE_PARAM);
}

export async function fetchConnections(signal?: AbortSignal, fresh = false): Promise<ConnectionsResponse> {
  const fixture = fixtureFromUrl();
  const params = new URLSearchParams();
  if (fixture) params.set("fixture", fixture);
  if (fresh) params.set("fresh", "true");
  const qs = params.toString();
  const url = qs ? `/api/trains/connections?${qs}` : "/api/trains/connections";
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`connections: ${res.status}`);
  return res.json();
}

export function activeFixture(): string | null {
  return fixtureFromUrl();
}
