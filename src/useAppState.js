// App state container: loads/migrates once, saves on every change, and exposes
// small actions. All calculations live in src/lib.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadState, saveState, requestPersistentStorage } from "./lib/storage.js";
import { localDateString } from "./lib/dates.js";
import * as food from "./lib/foodlog.js";

function getStorage() {
  try {
    const s = window.localStorage;
    const k = "__bt_probe__";
    s.setItem(k, "1");
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

/** Current local date, refreshed when the tab regains focus or each minute. */
export function useToday() {
  const [today, setToday] = useState(localDateString());
  useEffect(() => {
    const tick = () => setToday((t) => (t === localDateString() ? t : localDateString()));
    const id = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, []);
  return today;
}

export function useAppState() {
  const storageRef = useRef(null);
  const [boot] = useState(() => {
    storageRef.current = getStorage();
    try {
      return loadState(storageRef.current);
    } catch (e) {
      // loadState is defensive already; this is a last resort
      return { ...loadState(null), corrupt: [], errors: [String(e)] };
    }
  });
  const [state, setState] = useState(boot.state);
  const [saveError, setSaveError] = useState(storageRef.current ? null : "Browser storage is unavailable (private mode or blocked). Data will be lost when you close this tab — export a backup.");
  const [corrupt, setCorrupt] = useState(boot.corrupt || []);
  const [persist, setPersist] = useState(null);

  useEffect(() => {
    if (!storageRef.current) return;
    const r = saveState(storageRef.current, state);
    setSaveError(r.ok ? null : `Couldn't save your data (${r.error}). Export a backup to be safe.`);
  }, [state]);

  useEffect(() => {
    if (state.meta.persistRequested) {
      requestPersistentStorage(navigator).then((r) => setPersist(r));
      return;
    }
    requestPersistentStorage(navigator).then((r) => {
      setPersist(r);
      setState((s) => ({ ...s, meta: { ...s.meta, persistRequested: true } }));
    });
    // run once on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((fn) => setState((s) => fn(s)), []);

  const actions = useMemo(
    () => ({
      addEntry: (e) => update((s) => ({ ...s, entries: [...s.entries, e] })),
      deleteEntry: (id) => update((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) })),
      addFood: (f) => update((s) => ({ ...s, food: food.addFoodEntry(s.food, f) })),
      updateFood: (id, patch) => update((s) => ({ ...s, food: food.updateFoodEntry(s.food, id, patch) })),
      deleteFood: (id) => update((s) => ({ ...s, food: food.deleteFoodEntry(s.food, id) })),
      setDayComplete: (date, v) => update((s) => ({ ...s, days: food.setDayComplete(s.days, date, v) })),
      dismissDayPrompt: (date) => update((s) => ({ ...s, days: food.dismissDayPrompt(s.days, date) })),
      toggleTag: (date, tag) => update((s) => ({ ...s, days: food.toggleDayTag(s.days, date, tag) })),
      updateSettings: (patch) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
      setGoals: (goals) => update((s) => ({ ...s, goals })),
      toggleInclude: (date) =>
        update((s) => {
          const cur = s.settings.includeDates || [];
          const includeDates = cur.includes(date) ? cur.filter((d) => d !== date) : [...cur, date];
          return { ...s, settings: { ...s.settings, includeDates } };
        }),
      replaceState: (next) => update(() => next),
      markBackup: (date) => update((s) => ({ ...s, meta: { ...s.meta, lastBackupAt: date } })),
      dismissBackupReminder: (date) => update((s) => ({ ...s, meta: { ...s.meta, backupReminderDismissedAt: date } })),
      clearCorrupt: (key) => {
        try {
          storageRef.current?.removeItem(`bt_corrupt_${key}`);
        } catch {
          /* ignore */
        }
        setCorrupt((c) => c.filter((x) => x.key !== key));
      },
    }),
    [update]
  );

  return { state, actions, saveError, corrupt, persist, migratedFrom: boot.migratedFrom };
}
