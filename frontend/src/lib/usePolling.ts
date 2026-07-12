import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

export interface Polling<T> {
  data: T | null;
  setData: Dispatch<SetStateAction<T | null>>;
  error: string | null;
  setError: (e: string | null) => void;
  /** Re-run the fetcher immediately (e.g. after a mutation). */
  reload: () => Promise<void>;
}

/**
 * Shared fetch-poll-error cycle used by every data widget.
 * Skips polls while the tab is hidden and refreshes once it becomes visible again.
 */
export function usePolling<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  intervalMs: number,
): Polling<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await fetcherRef.current(signal);
      setData(next);
      setError(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const id = window.setInterval(() => {
      if (document.hidden) return;
      load(controller.signal);
    }, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") load(controller.signal);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, load]);

  const reload = useCallback(() => load(), [load]);

  return { data, setData, error, setError, reload };
}
