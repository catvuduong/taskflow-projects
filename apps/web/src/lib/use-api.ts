'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from './api';

export interface Resource<T> {
  data: T | undefined;
  error: string | undefined;
  reload: () => void;
}

/**
 * Loads `path` from the API. `reload` refetches in place: the previous data stays on screen until the new
 * response arrives, so refreshes do not flash a skeleton. A null path loads nothing.
 */
export function useApi<T>(path: string | null): Resource<T> {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ path: string; data?: T; error?: string } | null>(null);

  useEffect(() => {
    if (path === null) return;
    let stale = false;
    api<T>(path).then(
      (data) => {
        if (!stale) setResult({ path, data });
      },
      (err: unknown) => {
        if (!stale) setResult({ path, error: errorMessage(err) });
      },
    );
    return () => {
      stale = true;
    };
  }, [path, version]);

  const current = result !== null && result.path === path ? result : null;
  return {
    data: current?.data,
    error: current?.error,
    reload: () => setVersion((v) => v + 1),
  };
}
