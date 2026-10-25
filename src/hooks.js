import { useEffect, useState } from 'react';
export function useResource(loader, dependencies, interval, enabled = true) {
  const [state, setState] = useState({ data: null, error: '', loading: true, updated: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let timer, busy = false;
    setState({ data: null, error: '', loading: enabled, updated: null });
    if (!enabled) return;
    async function run() {
      if (busy || controller.signal.aborted) return;
      clearTimeout(timer);
      if (document.hidden) { timer = setTimeout(run, interval); return; }
      busy = true; let delay = interval;
      try {
        const data = await loader(controller.signal);
        if (!controller.signal.aborted) setState({ data, error: '', loading: false, updated: Date.now() / 1000 });
      } catch (e) {
        if (!controller.signal.aborted) setState(s => ({ ...s, loading: false, error: e.message === 'Failed to fetch' ? 'Нет соединения с источником. Повторим автоматически.' : e.message }));
        delay = Math.max(interval, 60000);
      } finally { busy = false; if (!controller.signal.aborted) timer = setTimeout(run, delay); }
    }
    run();
    const visible = () => { if (!document.hidden) run(); };
    document.addEventListener('visibilitychange', visible);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [...dependencies, interval, enabled, revision]);
  return { ...state, refresh: () => setRevision(v => v + 1) };
}
