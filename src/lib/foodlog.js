// Food log: several entries per day, a per-day "complete" flag, and water-event
// tags. Only complete days count as known intake; everything else is unknown
// (never treated as 0 kcal).
import { addDays } from "./dates.js";

export const MACROS = ["protein", "carbs", "fat"];

export const WATER_TAGS = [
  { key: "salt", label: "High salt" },
  { key: "refeed", label: "Refeed / high carb" },
  { key: "creatine", label: "Creatine start" },
  { key: "training", label: "Hard training" },
  { key: "cycle", label: "Menstrual cycle" },
  { key: "illness", label: "Illness" },
  { key: "travel", label: "Travel" },
];

let idCounter = 0;
export function newId() {
  idCounter = (idCounter + 1) % 1000;
  return Date.now() * 1000 + idCounter;
}

const numOrNull = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** Normalise user input into a stored food entry. Returns {entry} or {error}. */
export function makeFoodEntry({ id, date, label, kcal, protein, carbs, fat }) {
  const k = numOrNull(kcal);
  if (k == null) return { error: "Calories are required." };
  if (k < 0) return { error: "Calories can't be negative." };
  const e = {
    id: id ?? newId(),
    date,
    label: label ? String(label).slice(0, 60) : null,
    kcal: k,
    protein: numOrNull(protein),
    carbs: numOrNull(carbs),
    fat: numOrNull(fat),
  };
  for (const m of MACROS) if (e[m] != null && e[m] < 0) return { error: `${m} can't be negative.` };
  return { entry: e };
}

export const addFoodEntry = (log, entry) => [...log, entry];
export const updateFoodEntry = (log, id, patch) => log.map((f) => (f.id === id ? { ...f, ...patch, id } : f));
export const deleteFoodEntry = (log, id) => log.filter((f) => f.id !== id);
export const entriesForDate = (log, date) => log.filter((f) => f.date === date);

/**
 * Daily totals keyed by date. A macro total is known for a day only when every
 * entry that day has it logged; otherwise it is null (not a partial sum and
 * never 0 by default).
 */
export function dailyTotals(log) {
  const map = new Map();
  for (const f of log) {
    if (!f || typeof f.date !== "string" || !Number.isFinite(f.kcal)) continue;
    let t = map.get(f.date);
    if (!t) {
      t = { date: f.date, kcal: 0, protein: 0, carbs: 0, fat: 0, n: 0 };
      map.set(f.date, t);
    }
    t.kcal += f.kcal;
    t.n += 1;
    for (const m of MACROS) {
      if (t[m] === null) continue;
      t[m] = f[m] == null ? null : t[m] + f[m];
    }
  }
  return map;
}

export const isDayComplete = (days, date) => !!(days && days[date] && days[date].complete);

export function setDayComplete(days, date, complete) {
  return { ...days, [date]: { ...(days[date] || {}), complete: !!complete, promptDismissed: true } };
}

export function dismissDayPrompt(days, date) {
  return { ...days, [date]: { ...(days[date] || {}), promptDismissed: true } };
}

export function toggleDayTag(days, date, tag) {
  const cur = (days[date] && days[date].tags) || [];
  const tags = cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag];
  return { ...days, [date]: { ...(days[date] || {}), tags } };
}

export const dayTags = (days, date) => (days && days[date] && days[date].tags) || [];

/** Map date → total kcal for complete days that have at least one entry. */
export function completeIntakeByDate(log, days) {
  const out = new Map();
  for (const [date, t] of dailyTotals(log)) if (isDayComplete(days, date)) out.set(date, t.kcal);
  return out;
}

/**
 * Intake summary over an exact list of dates. Calories are averaged over
 * complete days; each macro only over complete days where it was logged.
 */
export function intakeSummary(log, days, windowDates) {
  const totals = dailyTotals(log);
  const complete = [];
  let loggedIncomplete = 0;
  for (const d of windowDates) {
    const t = totals.get(d);
    if (!t) continue;
    if (isDayComplete(days, d)) complete.push(t);
    else loggedIncomplete += 1;
  }
  const avg = (key) => {
    const xs = complete.filter((t) => t[key] != null).map((t) => t[key]);
    return xs.length ? { mean: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length } : { mean: null, n: 0 };
  };
  const kcal = avg("kcal");
  const protein = avg("protein");
  const carbs = avg("carbs");
  const fat = avg("fat");
  const mismatches = complete.map((t) => macroMismatch(t)).filter((m) => m && m.flagged);
  return {
    windowDays: windowDates.length,
    completeDays: complete.length,
    loggedIncomplete,
    completeness: windowDates.length ? complete.length / windowDates.length : 0,
    avgKcal: kcal.mean,
    avgProtein: protein.mean,
    proteinDays: protein.n,
    avgCarbs: carbs.mean,
    carbsDays: carbs.n,
    avgFat: fat.mean,
    fatDays: fat.n,
    completeTotals: complete,
    mismatches,
  };
}

/**
 * Sanity check for one day: |4P + 4C + 9F − kcal| > 15% of kcal.
 * Only evaluated when all three macros are known.
 */
export function macroMismatch(t) {
  if (!t || t.protein == null || t.carbs == null || t.fat == null || !(t.kcal > 0)) return null;
  const macroKcal = 4 * t.protein + 4 * t.carbs + 9 * t.fat;
  const gap = Math.abs(macroKcal - t.kcal);
  return { date: t.date, macroKcal, kcal: t.kcal, gapPct: gap / t.kcal, flagged: gap > 0.15 * t.kcal };
}

/** Should we ask "Mark yesterday complete?" */
export function yesterdayPrompt(log, days, today) {
  const y = addDays(today, -1);
  if (!log.some((f) => f.date === y)) return null;
  const d = days[y] || {};
  if (d.complete || d.promptDismissed) return null;
  return y;
}
