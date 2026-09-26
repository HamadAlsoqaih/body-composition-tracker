import { describe, it, expect } from "vitest";
import {
  migrate, loadState, saveState, safeLoad, safeSave, buildBackup, validateBackup, mergeStates, weightsCSV,
  measurementsCSV, foodCSV, needsBackupReminder, isIOSBrowser, requestPersistentStorage, KEYS, SCHEMA_VERSION,
  LEGACY_BACKUP_KEY, CORRUPT_PREFIX, countsOf, emptyState, stripWeightOnlySource,
} from "../src/lib/storage.js";

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

const V1 = {
  bt_entries: JSON.stringify([
    { id: 1, date: "2026-08-01", weight: 90, bodyFat: 25, fatMass: 22.5, muscleMass: 38 },
    { id: 2, date: "2026-08-02", waist: 95, neck: 40 },
    { id: 3, date: "2026-08-08", weight: 89.2 },
  ]),
  bt_food: JSON.stringify([
    { id: 10, date: "2026-08-01", calories: 2200, protein: 150, carbs: null, fat: 70 },
    { id: 11, date: "2026-08-02", calories: 2100, protein: null },
  ]),
  bt_settings: JSON.stringify({ goalDir: "lose", rateKgWk: 0.5, proteinPerKg: 1.8, activityFactor: 1.45, height: 175, age: 25, sex: "male" }),
  bt_goals: JSON.stringify({ weight: 80, bodyFat: null }),
  bt_seen_welcome: "true",
};

describe("migration from the old schema", () => {
  it("keeps every entry, converts food, marks old food days complete", () => {
    const st = memStorage(V1);
    const { state, migratedFrom } = loadState(st, "2026-09-01");
    expect(migratedFrom).toBe(1);
    expect(state.entries).toHaveLength(3);
    expect(state.entries.find((e) => e.id === 1).source).toBe("bia");
    expect(state.entries.find((e) => e.id === 2).source).toBe("tape");
    expect(state.food).toHaveLength(2);
    expect(state.food[0]).toMatchObject({ id: 10, date: "2026-08-01", kcal: 2200, protein: 150, carbs: null, fat: 70, label: null });
    expect(state.days["2026-08-01"].complete).toBe(true);
    expect(state.days["2026-08-02"].complete).toBe(true);
    expect(state.goals.weight).toBe(80);
  });
  it("converts settings and flags possible hidden defaults for a one-time review", () => {
    const { state } = loadState(memStorage(V1), "2026-09-01");
    expect(state.settings).toMatchObject({ heightCm: 175, age: 25, sex: "male", activity: "light", goalDir: "lose", legacyReview: true, onboarded: false });
    expect(state.settings.ratePct).toBeCloseTo(0.55, 9); // 0.5 kg/wk of 89.2 kg ≈ 0.56% → nearest 0.05
    expect(state.settings.proteinPerKg).toBeNull(); // 1.8 was the old default → new per-goal default
  });
  it("keeps a raw copy of the old data before overwriting", () => {
    const st = memStorage(V1);
    const { state } = loadState(st, "2026-09-01");
    saveState(st, state);
    const d = st.dump();
    expect(JSON.parse(d[LEGACY_BACKUP_KEY]).food).toHaveLength(2);
    expect(JSON.parse(d[KEYS.meta]).schemaVersion).toBe(SCHEMA_VERSION);
    // second load is v2: no re-migration, data identical
    const again = loadState(st, "2026-09-02");
    expect(again.migratedFrom).toBeNull();
    expect(again.state.entries).toEqual(state.entries);
    expect(again.state.food).toEqual(state.food);
    expect(again.state.settings).toEqual(state.settings);
  });
  it("migrate() of empty/undefined input gives an empty state", () => {
    const s = migrate(undefined);
    expect(s.entries).toEqual([]);
    expect(s.settings.onboarded).toBe(false);
  });
});

describe("corrupt data never crashes", () => {
  it("unparseable keys fall back and the raw text is preserved for recovery", () => {
    const st = memStorage({ ...V1, bt_food: "{not json" });
    const { state, corrupt } = loadState(st, "2026-09-01");
    expect(corrupt.map((c) => c.key)).toEqual(["bt_food"]);
    expect(state.food).toEqual([]);
    expect(state.entries).toHaveLength(3);
    expect(st.dump()[`${CORRUPT_PREFIX}bt_food`]).toContain("{not json");
  });
  it("wrong types are sanitised", () => {
    const st = memStorage({ bt_entries: JSON.stringify({ oops: 1 }), bt_food: JSON.stringify([null, 5, { date: "bad" }]), bt_meta: JSON.stringify({ schemaVersion: 2 }) });
    const { state } = loadState(st);
    expect(state.entries).toEqual([]);
    expect(state.food).toEqual([]);
  });
  it("a throwing storage is survived", () => {
    const boom = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    expect(() => loadState(boom)).not.toThrow();
    expect(safeSave(boom, "k", 1).ok).toBe(false);
    expect(safeLoad(boom, "k", 7).value).toBe(7);
  });
});

describe("backup / import", () => {
  const { state } = loadState(memStorage(V1), "2026-09-01");
  it("round-trips a full backup", () => {
    const b = buildBackup(state, new Date("2026-09-01T10:00:00Z"));
    const v = validateBackup(JSON.stringify(b));
    expect(v.ok).toBe(true);
    expect(v.counts).toEqual(countsOf(state));
    expect(v.state.entries).toEqual(state.entries);
    expect(v.state.days).toEqual(state.days);
  });
  it("rejects malformed JSON and malformed content", () => {
    expect(validateBackup("{nope").ok).toBe(false);
    expect(validateBackup("[]").ok).toBe(false);
    expect(validateBackup(JSON.stringify({ entries: "x" })).ok).toBe(false);
    expect(validateBackup(JSON.stringify({ entries: [{ date: "2026-13-01", weight: 80 }] })).ok).toBe(false);
    expect(validateBackup(JSON.stringify({ food: [{ date: "2026-09-01", kcal: -1 }] })).ok).toBe(false);
    expect(validateBackup(JSON.stringify({ schemaVersion: 99, entries: [] })).ok).toBe(false);
    expect(validateBackup(JSON.stringify({ hello: 1 })).ok).toBe(false);
  });
  it("accepts an old (v1-shaped) export", () => {
    const v = validateBackup(JSON.stringify({ entries: JSON.parse(V1.bt_entries), food: JSON.parse(V1.bt_food) }));
    expect(v.ok).toBe(true);
    expect(v.counts.completeDays).toBe(2);
  });
  it("merge adds new items and keeps existing ones", () => {
    const incoming = { ...emptyState(), entries: [{ id: 99, date: "2026-09-01", weight: 88, source: "bia" }, state.entries[0]], food: [], days: { "2026-08-03": { complete: true, tags: [] } } };
    const m = mergeStates(state, incoming);
    expect(m.entries).toHaveLength(4);
    expect(m.days["2026-08-03"].complete).toBe(true);
  });
});

describe("CSV", () => {
  const { state } = loadState(memStorage(V1), "2026-09-01");
  it("exports weights, food and measurements", () => {
    expect(weightsCSV(state.entries).split("\n")[0]).toBe("date,time,source,weight_kg,body_fat_pct,fat_mass_kg,muscle_or_lean_mass_kg");
    expect(weightsCSV(state.entries).trim().split("\n")).toHaveLength(3);
    expect(measurementsCSV(state.entries)).toContain("2026-08-02,40,,95");
    const f = foodCSV([{ ...state.food[0], label: 'Lunch, "big"' }], state.days);
    expect(f).toContain('"Lunch, ""big"""');
    expect(f).toContain(",yes");
  });
});

describe("reminders and platform", () => {
  it("backup reminder every 30 days", () => {
    const s = { ...emptyState(), entries: [{ id: 1, date: "2026-08-01", weight: 80 }], meta: { createdAt: "2026-08-01", lastBackupAt: null, backupReminderDismissedAt: null } };
    expect(needsBackupReminder(s, "2026-08-30")).toBe(false);
    expect(needsBackupReminder(s, "2026-08-31")).toBe(true);
    expect(needsBackupReminder({ ...s, meta: { ...s.meta, lastBackupAt: "2026-08-20" } }, "2026-08-31")).toBe(false);
    expect(needsBackupReminder({ ...s, meta: { ...s.meta, backupReminderDismissedAt: "2026-08-31" } }, "2026-09-10")).toBe(false);
    expect(needsBackupReminder(emptyState(), "2027-01-01")).toBe(false);
  });
  it("detects iOS browser tabs", () => {
    expect(isIOSBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", false)).toBe(true);
    expect(isIOSBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", true)).toBe(false);
    expect(isIOSBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", false, 5)).toBe(true);
    expect(isIOSBrowser("Mozilla/5.0 (Windows NT 10.0)", false)).toBe(false);
  });
  it("persistent storage request is best-effort", async () => {
    expect(await requestPersistentStorage({})).toEqual({ supported: false });
    const nav = { storage: { persisted: async () => false, persist: async () => true } };
    expect(await requestPersistentStorage(nav)).toEqual({ supported: true, persisted: true });
    const bad = { storage: { persist: async () => { throw new Error("x"); } } };
    expect((await requestPersistentStorage(bad)).supported).toBe(false);
  });
});

describe("schema v3: weight-only entries have no source", () => {
  const v2 = {
    bt_entries: JSON.stringify([
      { id: 1, date: "2026-09-01", weight: 80, source: "bia" }, // weight-only, mislabelled
      { id: 2, date: "2026-09-02", weight: 80, bodyFat: 20, source: "bia" },
      { id: 3, date: "2026-09-03", fatMass: 15, muscleMass: 55, source: "dexa" },
      { id: 4, date: "2026-09-04", waist: 90, source: "tape" },
    ]),
    bt_meta: JSON.stringify({ schemaVersion: 2, createdAt: "2026-09-01" }),
    bt_v1_backup: JSON.stringify({ original: true }),
  };

  it("migrates v2 → v3 by removing 'bia' from entries without composition values", () => {
    const st = memStorage(v2);
    const { state, migratedFrom } = loadState(st, "2026-09-10");
    expect(migratedFrom).toBe(2);
    const byId = Object.fromEntries(state.entries.map((e) => [e.id, e]));
    expect("source" in byId[1]).toBe(false);
    expect(byId[2].source).toBe("bia");
    expect(byId[3].source).toBe("dexa");
    expect(byId[4].source).toBe("tape");
    saveState(st, state);
    expect(JSON.parse(st.dump()[KEYS.meta]).schemaVersion).toBe(3);
    // the original v1 copy is not overwritten by the v2 → v3 step
    expect(JSON.parse(st.dump()[LEGACY_BACKUP_KEY])).toEqual({ original: true });
    expect(JSON.parse(st.dump().bt_v2_backup).entries).toHaveLength(4);
  });

  it("v1 weight-only entries get no source; composition entries default to 'bia'", () => {
    const { state } = loadState(memStorage(V1), "2026-09-01");
    const byId = Object.fromEntries(state.entries.map((e) => [e.id, e]));
    expect("source" in byId[3]).toBe(false);
    expect(byId[1].source).toBe("bia");
    expect(byId[2].source).toBe("tape");
  });

  it("stripWeightOnlySource leaves everything else untouched", () => {
    const e = [{ id: 1, date: "2026-09-01", weight: 80, source: "bia" }, { id: 2, date: "2026-09-01", weight: 80, bodyFat: 20, source: "bia" }];
    expect(stripWeightOnlySource(e)).toEqual([{ id: 1, date: "2026-09-01", weight: 80 }, e[1]]);
  });

  it("imported v2 backups are migrated the same way", () => {
    const v = validateBackup(JSON.stringify({ schemaVersion: 2, entries: [{ id: 1, date: "2026-09-01", weight: 80, source: "bia" }] }));
    expect(v.ok).toBe(true);
    expect("source" in v.state.entries[0]).toBe(false);
  });
});
