// Day-by-day JSON export for analysis. Separate from the full backup (which is
// the only format Import accepts). Always metric: kg, cm, kcal, g.
import { localDateString, isDateString } from "./dates.js";
import { dailyWeights, flagOutliers } from "./trend.js";
import { dailyTotals, isDayComplete, dayTags, WATER_TAGS, MACROS } from "./foodlog.js";
import { SCHEMA_VERSION, TAPE_KEYS, COMPOSITION_VALUE_KEYS } from "./storage.js";

const r1 = (x) => Math.round(x * 10) / 10; // kg, cm, %
const r0 = (x) => Math.round(x); // kcal, g
const pad = (n) => String(n).padStart(2, "0");

/** Local ISO datetime with UTC offset, e.g. 2026-09-26T21:15:03+03:00. */
export function localISOWithOffset(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
  );
}

/** Local "HH:MM" of an ISO timestamp (null if missing/invalid). */
function localHM(iso) {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// order within a day: timed entries by time; entries without a time keep their stored order
function byTime(list) {
  return list
    .map((e, i) => ({ e, i, t: typeof e.time === "string" ? Date.parse(e.time) : NaN }))
    .sort((a, b) => {
      const at = Number.isNaN(a.t), bt = Number.isNaN(b.t);
      if (at && bt) return a.i - b.i;
      if (at) return 1;
      if (bt) return -1;
      return a.t - b.t || a.i - b.i;
    })
    .map((x) => x.e);
}

const tagLabel = (key) => (WATER_TAGS.find((t) => t.key === key)?.label || key).toLowerCase();

/** Every date that has a weigh-in, food entry, composition value or tape measurement. */
export function datesWithData(state) {
  const set = new Set();
  for (const e of state.entries || []) {
    if (!e || !isDateString(e.date)) continue;
    if (Number.isFinite(e.weight) || COMPOSITION_VALUE_KEYS.some((k) => Number.isFinite(e[k])) || TAPE_KEYS.some((k) => Number.isFinite(e[k]))) set.add(e.date);
  }
  for (const f of state.food || []) if (f && isDateString(f.date) && Number.isFinite(f.kcal)) set.add(f.date);
  return [...set].sort();
}

/**
 * Build the daily export.
 * opts: { from, to } inclusive local dates (default: first → last date with data),
 *       includeEntries (individual food entries, default false),
 *       now (Date, for exportedAt), timeZone (IANA name; default: the runtime's)
 */
export function buildDailyExport(state, opts = {}) {
  const { includeEntries = false, now = new Date() } = opts;
  const timeZone = opts.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const all = datesWithData(state);
  const from = opts.from ?? all[0] ?? localDateString(now);
  const to = opts.to ?? all[all.length - 1] ?? localDateString(now);
  if (!isDateString(from) || !isDateString(to)) throw new RangeError("from/to must be YYYY-MM-DD dates");
  if (from > to) throw new RangeError("from must be on or before to");
  const inRange = (d) => d >= from && d <= to;

  const entries = state.entries || [];
  const food = state.food || [];
  const daysMeta = state.days || {};

  // the model's daily weight and outlier flags, computed over all data so they match the app
  const cleaning = flagOutliers(dailyWeights(entries), state.settings?.includeDates || []);
  const dailyW = new Map(cleaning.points.map((p) => [p.date, p]));
  const totals = dailyTotals(food);

  const byDate = new Map();
  for (const e of entries) {
    if (!e || !isDateString(e.date) || !inRange(e.date)) continue;
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  const foodByDate = new Map();
  for (const f of food) {
    if (!f || !isDateString(f.date) || !inRange(f.date) || !Number.isFinite(f.kcal)) continue;
    if (!foodByDate.has(f.date)) foodByDate.set(f.date, []);
    foodByDate.get(f.date).push(f);
  }

  const days = [];
  for (const date of all.filter(inRange)) {
    const day = { date };
    const list = byTime(byDate.get(date) || []);

    // weight: the model's daily value; all weigh-ins only when there were several
    const w = dailyW.get(date);
    if (w) {
      day.weight = r1(w.weight);
      const weighIns = list.filter((e) => Number.isFinite(e.weight));
      if (weighIns.length > 1) {
        day.weighIns = weighIns.map((e) => {
          const hm = localHM(e.time);
          return hm ? { time: hm, weight: r1(e.weight) } : { weight: r1(e.weight) };
        });
      }
      if (w.outlier) day.weightIgnored = true;
    }

    // composition: the latest entry that day with a composition value
    const comp = list.filter((e) => COMPOSITION_VALUE_KEYS.some((k) => Number.isFinite(e[k]))).pop();
    if (comp) {
      const c = {};
      if (comp.source) c.source = comp.source;
      for (const k of COMPOSITION_VALUE_KEYS) if (Number.isFinite(comp[k])) c[k] = r1(comp[k]);
      day.composition = c;
    }

    // tape: latest entry per measurement; waist is the mean of its 2–3 readings
    const tape = {};
    for (const k of TAPE_KEYS) {
      const e = list.filter((x) => Number.isFinite(x[k])).pop();
      if (!e) continue;
      const readings = k === "waist" && Array.isArray(e.waistReadings) ? e.waistReadings.filter(Number.isFinite) : [];
      tape[k] = r1(readings.length ? readings.reduce((a, b) => a + b, 0) / readings.length : e[k]);
    }
    if (Object.keys(tape).length) day.tape = tape;

    // food: day totals; a macro appears only when every entry that day has it
    const items = foodByDate.get(date);
    if (items && items.length) {
      const t = totals.get(date);
      const f = { calories: r0(t.kcal) };
      for (const m of MACROS) if (t[m] != null) f[m] = r0(t[m]);
      f.complete = isDayComplete(daysMeta, date);
      if (includeEntries) {
        f.entries = items.map((x) => {
          const o = {};
          if (x.label) o.label = x.label;
          o.calories = r0(x.kcal);
          for (const m of MACROS) if (Number.isFinite(x[m])) o[m] = r0(x[m]);
          return o;
        });
      }
      day.food = f;
    }

    const tags = dayTags(daysMeta, date);
    if (tags.length) day.waterTags = tags.map(tagLabel);

    days.push(day);
  }

  return {
    app: "BodyTracker",
    exportType: "daily",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: localISOWithOffset(now),
    timezone: timeZone,
    units: { weight: "kg", length: "cm", energy: "kcal", macros: "g" },
    range: { from, to, daysWithData: days.length },
    days,
  };
}

/** Counts for the export preview line. */
export function dailyExportSummary(exp) {
  return {
    from: exp.range.from,
    to: exp.range.to,
    days: exp.days.length,
    weighInDays: exp.days.filter((d) => d.weight != null).length,
    foodDays: exp.days.filter((d) => d.food).length,
    tapeDays: exp.days.filter((d) => d.tape).length,
  };
}

export const dailyExportFilename = (exp) => `bodytracker-daily_${exp.range.from}_to_${exp.range.to}.json`;
