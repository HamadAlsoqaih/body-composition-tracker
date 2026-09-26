// Persistence, schema migration, backup/export/import. Every read and write
// is wrapped so corrupt or missing data never crashes the app.
import { isDateString, localDateString, daysBetween } from "./dates.js";
import { nearestActivityLevel, BF_SOURCES } from "./energy.js";
import { RATE_LIMITS } from "./targets.js";
import { MACROS } from "./foodlog.js";
import { initialWhatsNewSeen, isVersionString } from "./whatsNew.js";

export const SCHEMA_VERSION = 3;
export const KEYS = {
  entries: "bt_entries",
  food: "bt_food",
  settings: "bt_settings",
  goals: "bt_goals",
  days: "bt_days",
  meta: "bt_meta",
};
export const LEGACY_BACKUP_KEY = "bt_v1_backup";
export const CORRUPT_PREFIX = "bt_corrupt_";

export const TAPE_KEYS = ["neck", "chest", "waist", "hips", "armL", "armR", "thighL", "thighR", "calfL", "calfR"];
export const COMP_KEYS = ["weight", "bodyFat", "fatMass", "muscleMass"];
/** Composition values — the only fields a measurement source applies to. */
export const COMPOSITION_VALUE_KEYS = ["bodyFat", "fatMass", "muscleMass"];
export const ENTRY_SOURCES = ["bia", "dexa", "calipers", "tape"];

export const DEFAULT_SETTINGS = Object.freeze({
  units: { weight: "kg", length: "cm" },
  heightCm: null,
  age: null,
  sex: null, // "male" | "female" — formula choice only
  activity: null, // key of ACTIVITY_LEVELS
  steps: null,
  bf: null, // {value, source, date} from onboarding
  alreadyStable: null, // "eating at roughly current intake for 2+ weeks?"
  checkinWeekday: null, // 0–6
  goalDir: "maintain",
  ratePct: null,
  proteinPerKg: null,
  pregnant: false,
  includeDates: [], // un-ignored outlier days
  onboarded: false,
  legacyReview: false, // migrated profile needs a one-time check
  profilePrompted: false, // the one-time profile prompt has been shown
});

export const emptyState = () => ({
  schemaVersion: SCHEMA_VERSION,
  entries: [],
  food: [],
  days: {},
  settings: { ...DEFAULT_SETTINGS, units: { ...DEFAULT_SETTINGS.units }, includeDates: [] },
  goals: { weight: null, bodyFat: null },
  meta: { createdAt: null, lastBackupAt: null, backupReminderDismissedAt: null, persistRequested: false, iosHintDismissed: false, whatsNewSeen: null },
});

// ---------- safe storage primitives ----------

export function safeGetRaw(storage, key) {
  try {
    return { raw: storage ? storage.getItem(key) : null };
  } catch (error) {
    return { raw: null, error: String(error) };
  }
}

export function safeLoad(storage, key, fallback) {
  const { raw, error } = safeGetRaw(storage, key);
  if (error) return { value: fallback, error };
  if (raw == null) return { value: fallback, missing: true };
  try {
    return { value: JSON.parse(raw) };
  } catch (e) {
    return { value: fallback, error: `Could not parse ${key}`, corrupt: true, raw };
  }
}

export function safeSave(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// ---------- sanitising ----------

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export function sanitizeEntry(e, i = 0) {
  if (!e || typeof e !== "object" || !isDateString(e.date)) return null;
  const out = { id: e.id ?? `m${i}-${e.date}`, date: e.date };
  if (typeof e.time === "string" && !Number.isNaN(Date.parse(e.time))) out.time = e.time;
  for (const k of [...COMP_KEYS, ...TAPE_KEYS]) {
    const v = num(e[k]);
    if (v != null && v > 0) out[k] = v;
  }
  if (Array.isArray(e.waistReadings)) {
    const r = e.waistReadings.map(num).filter((v) => v != null && v > 0);
    if (r.length) out.waistReadings = r;
  }
  const hasComp = COMP_KEYS.some((k) => out[k] != null);
  const hasTape = TAPE_KEYS.some((k) => out[k] != null);
  if (!hasComp && !hasTape) return null;
  // source describes how composition was measured: weight-only entries get none
  const hasComposition = COMPOSITION_VALUE_KEYS.some((k) => out[k] != null);
  if (ENTRY_SOURCES.includes(e.source)) out.source = e.source;
  else if (hasComposition) out.source = "bia";
  else if (hasTape) out.source = "tape";
  return out;
}

export function sanitizeFood(f, i = 0) {
  if (!f || typeof f !== "object" || !isDateString(f.date)) return null;
  const kcal = num(f.kcal ?? f.calories);
  if (kcal == null || kcal < 0) return null;
  const out = { id: f.id ?? `f${i}-${f.date}`, date: f.date, label: typeof f.label === "string" && f.label ? f.label.slice(0, 60) : null, kcal };
  for (const m of MACROS) {
    const v = num(f[m]);
    out[m] = v != null && v >= 0 ? v : null;
  }
  return out;
}

function sanitizeDays(days) {
  const out = {};
  if (!days || typeof days !== "object" || Array.isArray(days)) return out;
  for (const [d, v] of Object.entries(days)) {
    if (!isDateString(d) || !v || typeof v !== "object") continue;
    out[d] = { complete: !!v.complete, promptDismissed: !!v.promptDismissed, tags: Array.isArray(v.tags) ? v.tags.filter((t) => typeof t === "string") : [] };
  }
  return out;
}

export function sanitizeSettings(s) {
  const d = emptyState().settings;
  if (!s || typeof s !== "object") return d;
  const out = { ...d };
  const u = s.units || {};
  out.units = { weight: u.weight === "lb" ? "lb" : "kg", length: u.length === "in" ? "in" : "cm" };
  const h = num(s.heightCm), a = num(s.age), st = num(s.steps), r = num(s.ratePct), p = num(s.proteinPerKg), wd = num(s.checkinWeekday);
  out.heightCm = h != null && h > 50 && h < 280 ? h : null;
  out.age = a != null && a > 0 && a < 130 ? a : null;
  out.sex = s.sex === "male" || s.sex === "female" ? s.sex : null;
  out.activity = typeof s.activity === "string" ? s.activity : null;
  out.steps = st != null && st >= 0 ? st : null;
  if (s.bf && typeof s.bf === "object" && num(s.bf.value) != null && BF_SOURCES.includes(s.bf.source) && isDateString(s.bf.date)) {
    out.bf = { value: num(s.bf.value), source: s.bf.source, date: s.bf.date };
  }
  out.alreadyStable = typeof s.alreadyStable === "boolean" ? s.alreadyStable : null;
  out.checkinWeekday = wd != null && wd >= 0 && wd <= 6 ? Math.round(wd) : null;
  out.goalDir = ["lose", "maintain", "gain"].includes(s.goalDir) ? s.goalDir : "maintain";
  out.ratePct = r != null && r >= 0 ? r : null;
  out.proteinPerKg = p != null && p > 0 ? p : null;
  out.pregnant = !!s.pregnant;
  out.includeDates = Array.isArray(s.includeDates) ? s.includeDates.filter(isDateString) : [];
  out.onboarded = !!s.onboarded;
  out.legacyReview = !!s.legacyReview;
  out.profilePrompted = !!s.profilePrompted;
  return out;
}

function sanitizeGoals(g) {
  if (!g || typeof g !== "object") return { weight: null, bodyFat: null };
  const w = num(g.weight), b = num(g.bodyFat);
  return { weight: w != null && w > 0 ? w : null, bodyFat: b != null && b > 0 && b < 75 ? b : null };
}

function sanitizeMeta(m) {
  const d = emptyState().meta;
  if (!m || typeof m !== "object") return d;
  return {
    createdAt: isDateString(m.createdAt) ? m.createdAt : null,
    lastBackupAt: isDateString(m.lastBackupAt) ? m.lastBackupAt : null,
    backupReminderDismissedAt: isDateString(m.backupReminderDismissedAt) ? m.backupReminderDismissedAt : null,
    persistRequested: !!m.persistRequested,
    iosHintDismissed: !!m.iosHintDismissed,
    whatsNewSeen: isVersionString(m.whatsNewSeen) ? m.whatsNewSeen : null,
  };
}

const arr = (v) => (Array.isArray(v) ? v : []);

// ---------- migration ----------

/**
 * Bring any stored/imported data to the current schema. Version-1 data (the
 * original app) had one food row per day with `calories`, and settings with
 * hidden defaults (height 175, age 25, activity 1.45, rate in kg/week).
 * Old food days become one entry on that day, marked complete.
 */
/** v2 → v3: weight-only entries were labelled "bia"; they have no composition source. */
export function stripWeightOnlySource(entries) {
  return entries.map((e) => {
    if (e.source !== "bia" || COMPOSITION_VALUE_KEYS.some((k) => e[k] != null)) return e;
    const { source, ...rest } = e;
    return rest;
  });
}

export function migrate(raw, today = localDateString()) {
  const version = raw?.meta?.schemaVersion ?? raw?.schemaVersion ?? 1;
  const s = emptyState();
  s.entries = arr(raw?.entries).map(sanitizeEntry).filter(Boolean);
  s.food = arr(raw?.food).map(sanitizeFood).filter(Boolean);
  s.goals = sanitizeGoals(raw?.goals);
  s.meta = sanitizeMeta(raw?.meta);

  if (version >= 2) {
    s.days = sanitizeDays(raw?.days);
    s.settings = sanitizeSettings(raw?.settings);
  } else {
    // every old food day becomes complete
    for (const f of s.food) s.days[f.date] = { complete: true, promptDismissed: true, tags: [] };
    const old = raw?.settings && typeof raw.settings === "object" ? raw.settings : null;
    const hasData = s.entries.length > 0 || s.food.length > 0;
    if (old) {
      const latestW = [...s.entries].filter((e) => e.weight != null).sort((a, b) => a.date.localeCompare(b.date)).pop()?.weight;
      const dir = ["lose", "maintain", "gain"].includes(old.goalDir) ? old.goalDir : "maintain";
      const rateKgWk = num(old.rateKgWk);
      let ratePct = null;
      if (dir !== "maintain" && rateKgWk != null && latestW) ratePct = Math.round(((rateKgWk / latestW) * 100) / 0.05) * 0.05;
      if (dir !== "maintain" && ratePct == null) ratePct = RATE_LIMITS[dir].def;
      const prot = num(old.proteinPerKg);
      s.settings = sanitizeSettings({
        heightCm: num(old.height),
        age: num(old.age),
        sex: old.sex,
        activity: nearestActivityLevel(num(old.activityFactor)),
        goalDir: dir,
        ratePct: ratePct != null ? +ratePct.toFixed(2) : null,
        proteinPerKg: prot != null && prot !== 1.8 ? prot : null,
      });
      // values may be the old hidden defaults — ask the user to confirm once
      s.settings.legacyReview = true;
      s.settings.onboarded = false;
    } else if (hasData) {
      s.settings.legacyReview = true;
    }
    if (!s.meta.createdAt && hasData) s.meta.createdAt = today;
  }
  if (version < 3) s.entries = stripWeightOnlySource(s.entries);
  return s;
}

/** Read everything from storage, preserving any corrupt raw values. */
export function loadState(storage, today = localDateString()) {
  const raw = {};
  const corrupt = [];
  const errors = [];
  for (const [name, key] of Object.entries(KEYS)) {
    const r = safeLoad(storage, key, undefined);
    if (r.corrupt) {
      corrupt.push({ name, key, raw: r.raw });
      safeSave(storage, `${CORRUPT_PREFIX}${key}`, r.raw);
    } else if (r.error) errors.push(r.error);
    raw[name] = r.value;
  }
  const version = raw.meta?.schemaVersion ?? 1;
  const hadLegacy = version < SCHEMA_VERSION && (raw.entries || raw.food || raw.settings || raw.goals);
  if (hadLegacy) safeSave(storage, version === 1 ? LEGACY_BACKUP_KEY : `bt_v${version}_backup`, { savedAt: today, entries: raw.entries ?? null, food: raw.food ?? null, settings: raw.settings ?? null, goals: raw.goals ?? null });
  const state = migrate(raw, today);
  if (!state.meta.createdAt) state.meta.createdAt = today;
  // "What's new": people with data keep an older/empty seen-version until they
  // dismiss the notes; people starting with no data are marked as up to date
  state.meta.whatsNewSeen = initialWhatsNewSeen(state);
  return { state, corrupt, errors, migratedFrom: hadLegacy ? version : null };
}

export function saveState(storage, state) {
  const results = [
    safeSave(storage, KEYS.entries, state.entries),
    safeSave(storage, KEYS.food, state.food),
    safeSave(storage, KEYS.days, state.days),
    safeSave(storage, KEYS.settings, state.settings),
    safeSave(storage, KEYS.goals, state.goals),
    safeSave(storage, KEYS.meta, { ...state.meta, schemaVersion: SCHEMA_VERSION }),
  ];
  const failed = results.filter((r) => !r.ok);
  return failed.length ? { ok: false, error: failed[0].error } : { ok: true };
}

// ---------- backup / import / export ----------

export function buildBackup(state, now = new Date()) {
  return {
    app: "BodyTracker",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    entries: state.entries,
    food: state.food,
    days: state.days,
    settings: state.settings,
    goals: state.goals,
    meta: { ...state.meta, schemaVersion: SCHEMA_VERSION },
  };
}

/**
 * Validate an import (JSON text or object). Strict: any malformed item
 * rejects the whole file so nothing is silently dropped.
 */
export function validateBackup(input, today = localDateString()) {
  let obj = input;
  if (typeof input === "string") {
    try {
      obj = JSON.parse(input);
    } catch {
      return { ok: false, errors: ["This file isn't valid JSON."] };
    }
  }
  const errors = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, errors: ["Expected a BodyTracker backup object."] };
  if (obj.exportType === "daily") return { ok: false, errors: ["This is a daily data export, not a backup. Import needs a full backup (JSON) file."] };
  if (!("entries" in obj) && !("food" in obj)) errors.push("No entries or food data found.");
  if ("entries" in obj && !Array.isArray(obj.entries)) errors.push("`entries` must be a list.");
  if ("food" in obj && !Array.isArray(obj.food)) errors.push("`food` must be a list.");
  if ("days" in obj && (typeof obj.days !== "object" || Array.isArray(obj.days) || obj.days === null)) errors.push("`days` must be an object.");
  if ("settings" in obj && (typeof obj.settings !== "object" || obj.settings === null)) errors.push("`settings` must be an object.");
  const v = obj.schemaVersion ?? obj.meta?.schemaVersion ?? 1;
  if (!Number.isInteger(v) || v < 1 || v > SCHEMA_VERSION) errors.push(`Unsupported schemaVersion ${v}.`);
  if (errors.length) return { ok: false, errors };

  arr(obj.entries).forEach((e, i) => {
    if (!sanitizeEntry(e, i)) errors.push(`Entry ${i + 1} is malformed (needs a valid date and at least one positive measurement).`);
  });
  arr(obj.food).forEach((f, i) => {
    if (!sanitizeFood(f, i)) errors.push(`Food item ${i + 1} is malformed (needs a valid date and non-negative calories).`);
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 5).concat(errors.length > 5 ? [`…and ${errors.length - 5} more`] : []) };

  const state = migrate({ ...obj, meta: { ...(obj.meta || {}), schemaVersion: v } }, today);
  return { ok: true, errors: [], state, counts: countsOf(state), version: v };
}

export function countsOf(state) {
  return {
    weighIns: state.entries.filter((e) => e.weight != null).length,
    measurements: state.entries.filter((e) => TAPE_KEYS.some((k) => e[k] != null)).length,
    entries: state.entries.length,
    foodEntries: state.food.length,
    completeDays: Object.values(state.days).filter((d) => d.complete).length,
  };
}

/** Merge an imported state into the current one (current wins on id clashes). */
export function mergeStates(current, incoming) {
  const ids = new Set(current.entries.map((e) => String(e.id)));
  const fids = new Set(current.food.map((f) => String(f.id)));
  const days = { ...current.days };
  for (const [d, v] of Object.entries(incoming.days)) {
    const c = days[d];
    days[d] = c ? { complete: c.complete || v.complete, promptDismissed: c.promptDismissed || v.promptDismissed, tags: [...new Set([...(c.tags || []), ...(v.tags || [])])] } : v;
  }
  return {
    ...current,
    entries: [...current.entries, ...incoming.entries.filter((e) => !ids.has(String(e.id)))],
    food: [...current.food, ...incoming.food.filter((f) => !fids.has(String(f.id)))],
    days,
    goals: { weight: current.goals.weight ?? incoming.goals.weight, bodyFat: current.goals.bodyFat ?? incoming.goals.bodyFat },
  };
}

const csvCell = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCSV = (header, rows) => [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

export function weightsCSV(entries) {
  const rows = entries.filter((e) => COMP_KEYS.some((k) => e[k] != null)).sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, e.time ?? "", e.source, e.weight, e.bodyFat, e.fatMass, e.muscleMass]);
  return toCSV(["date", "time", "source", "weight_kg", "body_fat_pct", "fat_mass_kg", "muscle_or_lean_mass_kg"], rows);
}

export function measurementsCSV(entries) {
  const rows = entries.filter((e) => TAPE_KEYS.some((k) => e[k] != null)).sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, ...TAPE_KEYS.map((k) => e[k]), (e.waistReadings || []).join(" ")]);
  return toCSV(["date", ...TAPE_KEYS.map((k) => `${k}_cm`), "waist_readings_cm"], rows);
}

export function foodCSV(food, days) {
  const rows = [...food].sort((a, b) => a.date.localeCompare(b.date))
    .map((f) => [f.date, f.label, f.kcal, f.protein, f.carbs, f.fat, days[f.date]?.complete ? "yes" : "no"]);
  return toCSV(["date", "label", "kcal", "protein_g", "carbs_g", "fat_g", "day_complete"], rows);
}

// ---------- reminders / platform ----------

export const BACKUP_REMINDER_DAYS = 30;

export function needsBackupReminder(state, today = localDateString()) {
  if (!state.entries.length && !state.food.length) return false;
  const since = state.meta.lastBackupAt || state.meta.createdAt;
  if (!since) return false;
  if (daysBetween(since, today) < BACKUP_REMINDER_DAYS) return false;
  const dis = state.meta.backupReminderDismissedAt;
  return !dis || daysBetween(dis, today) >= BACKUP_REMINDER_DAYS;
}

/** iOS browser tab (not an installed home-screen app). */
export function isIOSBrowser(userAgent = "", standalone = false, maxTouchPoints = 0) {
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return ios && !standalone;
}

/** Ask the browser not to evict our storage (best effort). */
export async function requestPersistentStorage(nav) {
  try {
    if (!nav?.storage?.persist) return { supported: false };
    const already = nav.storage.persisted ? await nav.storage.persisted() : false;
    if (already) return { supported: true, persisted: true };
    return { supported: true, persisted: await nav.storage.persist() };
  } catch (e) {
    return { supported: false, error: String(e) };
  }
}
