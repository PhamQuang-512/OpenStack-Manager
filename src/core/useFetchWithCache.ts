import { LocalStorage, showToast, Toast } from "@raycast/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { ServiceUnavailableError } from "./errors";

/** In-memory results younger than this are reused without a new request. */
const FRESH_MS = 30_000;

interface MemoryEntry {
  data: unknown;
  fetchedAt: number;
}

/**
 * Process-wide store shared by every view of the running command.
 * - `memory` holds the latest result per key (survives view push/pop)
 * - `inflight` dedupes concurrent requests for the same key, so a view
 *   opened while a prefetch is running awaits that prefetch instead of
 *   firing a second identical request.
 */
const memory = new Map<string, MemoryEntry>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Fetches `key` once, sharing the result with concurrent callers and
 * persisting it to LocalStorage. Only successful results are stored, so
 * a failed refresh never overwrites good cached data.
 */
export function fetchShared<T>(key: string, fetcher: () => Promise<T>, force = false): Promise<T> {
  const entry = memory.get(key);
  if (!force && entry && Date.now() - entry.fetchedAt < FRESH_MS) {
    return Promise.resolve(entry.data as T);
  }

  const pending = inflight.get(key);
  if (pending) {
    // A forced refresh (e.g. after a server action) must not reuse a request
    // that started before the change: wait for it, then fetch again
    return force ? pending.catch(() => undefined).then(() => fetchShared(key, fetcher, true)) : (pending as Promise<T>);
  }

  const request = fetcher()
    .then(async (data) => {
      memory.set(key, { data, fetchedAt: Date.now() });
      try {
        await LocalStorage.setItem(key, JSON.stringify(data));
      } catch {
        // Cache is best-effort
      }
      return data;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}

/** Forgets the in-memory value for `key` so the next read goes to the API. */
export function invalidateShared(key: string): void {
  memory.delete(key);
}

/** Returns the latest in-memory value for `key` without fetching. */
export function peekShared<T>(key: string): T | undefined {
  return memory.get(key)?.data as T | undefined;
}

export interface FetchWithCacheOptions {
  /** Toast title shown when the fetch fails. */
  errorTitle?: string;
  /** Suppress the failure toast (e.g. for optional enrichment data). */
  silent?: boolean;
}

/**
 * React hook that fetches data with persistent LocalStorage caching
 * (stale-while-revalidate):
 * 1. Shows the in-memory value, or the LocalStorage value, immediately
 * 2. Fetches fresh data in the background via `fetchShared`
 * 3. On failure keeps showing cached data and surfaces a toast
 *
 * Uses a ref for the fetcher to avoid re-running the effect when the
 * caller creates a new function reference each render.
 */
export function useFetchWithCache<T>(cacheKey: string, fetcher: () => Promise<T>, options?: FetchWithCacheOptions) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<{
    data?: T;
    error?: Error;
    isLoading: boolean;
  }>(() => ({ data: peekShared<T>(cacheKey), isLoading: true }));

  const load = useCallback(
    async (force: boolean, isCancelled: () => boolean) => {
      try {
        const data = await fetchShared(cacheKey, () => fetcherRef.current(), force);
        if (!isCancelled()) setState({ data, isLoading: false });
      } catch (e) {
        if (isCancelled()) return;
        const error = e instanceof Error ? e : new Error(String(e));
        setState((prev) => ({ ...prev, error, isLoading: false }));
        if (!optionsRef.current?.silent && !(error instanceof ServiceUnavailableError)) {
          await showToast({
            style: Toast.Style.Failure,
            title: optionsRef.current?.errorTitle ?? "Failed to load data",
            message: error.message,
          });
        }
      }
    },
    [cacheKey],
  );

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    (async () => {
      if (!peekShared(cacheKey)) {
        try {
          const cached = await LocalStorage.getItem<string>(cacheKey);
          if (cached && !cancelled) {
            setState((prev) => ({ ...prev, data: prev.data ?? (JSON.parse(cached) as T) }));
          }
        } catch {
          // Ignore cache read errors
        }
      }
      await load(false, isCancelled);
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, load]);

  const revalidate = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: undefined }));
    await load(true, () => false);
  }, [load]);

  return { ...state, revalidate };
}
