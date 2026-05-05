import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * useFetch — executa fn() async e retorna { data, loading, error, refresh }.
 * Suporta dependências como segundo argumento (igual useEffect).
 */
export default function useFetch(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { run(); }, deps);

  return { data, loading, error, refresh: run };
}
