import { useCallback, useEffect, useRef, useState } from 'react';

export function useResource<T>(loader: () => Promise<T>, dependencies: readonly unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const request = useRef(0);

  const reload = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError('');
    try {
      const next = await loader();
      if (request.current === current) setData(next);
    } catch (reason) {
      if (request.current === current) setError((reason as Error).message);
    } finally {
      if (request.current === current) setLoading(false);
    }
  // The caller owns dependency stability, like useEffect/useCallback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  useEffect(() => { void reload(); return () => { request.current += 1; }; }, [reload]);
  return { data, error, loading, reload, setData, setError };
}
