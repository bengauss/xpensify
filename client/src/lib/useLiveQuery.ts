import { useState, useEffect } from "preact/hooks";
import { liveQuery } from "dexie";

/**
 * Lightweight Preact hook wrapping Dexie's liveQuery observable.
 * Re-renders the component whenever the queried data changes in IndexedDB.
 */
export function useLiveQuery<T>(
  querier: () => T | Promise<T>,
  deps: any[] = []
): T | undefined {
  const [result, setResult] = useState<T | undefined>(undefined);

  useEffect(() => {
    const observable = liveQuery(querier);
    const subscription = observable.subscribe({
      next: (value) => setResult(value),
      error: (err) => console.error("useLiveQuery error:", err),
    });
    return () => subscription.unsubscribe();
  }, deps);

  return result;
}
