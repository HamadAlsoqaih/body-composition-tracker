// Local-calendar date helpers. All dates in the app are "YYYY-MM-DD" strings
// in the user's local time zone. Never use toISOString() for a calendar date:
// it is UTC and shifts late-night / early-morning entries to the wrong day.

const pad = (n) => String(n).padStart(2, "0");

/** Local calendar date of `d` as "YYYY-MM-DD". */
export function localDateString(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateString(s) {
  if (typeof s !== "string") return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
}

/** Date object at local noon of a "YYYY-MM-DD" string (noon is DST-safe). */
export function parseLocalDate(s) {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0);
}

/** Whole calendar days from a to b (b − a). */
export function daysBetween(a, b) {
  return Math.round((parseLocalDate(b) - parseLocalDate(a)) / 86400000);
}

/** Date string n calendar days after `date` (n may be negative). */
export function addDays(date, n) {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + n);
  return localDateString(d);
}

/** Exactly n dates, ascending, ending with `today` (inclusive). */
export function lastNDays(n, today = localDateString()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(today, -i));
  return out;
}

/** Inclusive list of dates from start to end (empty if end < start). */
export function dateRange(start, end) {
  const n = daysBetween(start, end);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date) {
  return parseLocalDate(date).getDay();
}

/** Most recent date on or before `date` that falls on `wd` (0–6). */
export function lastWeekdayOnOrBefore(date, wd) {
  const back = (weekday(date) - wd + 7) % 7;
  return addDays(date, -back);
}

/** Same calendar day `months` months earlier (clamped to month end). */
export function monthsBefore(date, months) {
  const d = parseLocalDate(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getDate();
  d.setDate(Math.min(day, lastDay));
  return localDateString(d);
}

/** Exact instant for a new entry (used only to order same-day weigh-ins). */
export function nowTimestamp(d = new Date()) {
  return d.toISOString();
}
