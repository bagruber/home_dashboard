export interface WeatherWarning {
  /** DWD levels: 1 pre-warning, 2 yellow, 3 orange, 4 red, 5 violet. */
  level: number | null;
  event: string | null;
  headline: string | null;
  description: string;
  start: number | null; // epoch millis
  end: number | null;
  preWarning: boolean;
}

export interface WarningsResponse {
  warnings: WeatherWarning[];
  stale?: boolean;
  fetchedAt?: string;
}

export async function fetchWarnings(signal?: AbortSignal): Promise<WarningsResponse> {
  const res = await fetch("/api/warnings", { signal });
  if (!res.ok) throw new Error(`warnings: ${res.status}`);
  return res.json();
}
