import { useCallback, useEffect, useState } from 'react';

const read = () => new URLSearchParams(window.location.hash.slice(1));

/**
 * Keeps a few string params in the URL hash (e.g. `#region=london&hex=4ca92d`) so a view
 * can be bookmarked or shared. Updates replace the history entry instead of adding one.
 */
export function useHashParams<K extends string>(): [
  Partial<Record<K, string>>,
  (patch: Partial<Record<K, string | null>>) => void,
] {
  const [params, setParams] = useState(read);

  useEffect(() => {
    const onChange = () => setParams(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const update = useCallback((patch: Partial<Record<K, string | null>>) => {
    const next = read();
    for (const [key, value] of Object.entries(patch) as Array<[string, string | null | undefined]>) {
      if (value == null) next.delete(key);
      else next.set(key, value);
    }
    const hash = next.toString();
    window.history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname + window.location.search);
    setParams(next);
  }, []);

  return [Object.fromEntries(params) as Partial<Record<K, string>>, update];
}
