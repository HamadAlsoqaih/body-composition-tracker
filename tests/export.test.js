// Day-by-day export. Also run under America/New_York by the npm test script.
import { describe, it, expect } from "vitest";
import { buildDailyExport, dailyExportSummary, dailyExportFilename, localISOWithOffset, datesWithData } from "../src/lib/export.js";
import { emptyState, validateBackup, SCHEMA_VERSION } from "../src/lib/storage.js";
import { localDateString, addDays } from "../src/lib/dates.js";

const TZ = process.env.TZ;

function mkState() {
  const s = emptyState();
  s.settings = { ...s.settings, units: { weight: "lb", length: "in" } }; // display units must not matter
  const at = (date, hh, mm) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d, hh, mm).toISOString();
  };
  s.entries = [
    // 2026-09-01: two timed weigh-ins → earliest is the model's daily value
    { id: 1, date: "2026-09-01", time: at("2026-09-01", 19, 5), weight: 95.26 },
    { id: 2, date: "2026-09-01", time: at("2026-09-01", 7, 10), weight: 94.64 },
    { id: 3, date: "2026-09-01", time: at("2026-09-01", 7, 12), source: "bia", bodyFat: 28.44, fatMass: 26.91, muscleMass: 38.18 },
    // 2026-09-02: tape with 3 waist readings, later tape entry updates neck only
    { id: 4, date: "2026-09-02", source: "tape", waist: 101.5, waistReadings: [101.2, 101.6, 101.7], neck: 40, hips: 104.04 },
    { id: 5, date: "2026-09-02", source: "tape", neck: 40.36 },
    // 2026-09-04: weight only (09-03 has nothing → omitted)
    { id: 6, date: "2026-09-04", weight: 94.1 },
  ];
  s.food = [
    { id: 10, date: "2026-09-01", label: "Lunch", kcal: 750.4, protein: 60, carbs: 70.2, fat: 22 },
    { id: 11, date: "2026-09-01", label: null, kcal: 1490, protein: 122, carbs: 120, fat: 48 },
    { id: 12, date: "2026-09-02", label: "Fast", kcal: 0, protein: 0, carbs: null, fat: null }, // logged 0 stays 0
    { id: 13, date: "2026-09-04", kcal: 2100, protein: null, carbs: null, fat: null },
  ];
  s.days = { "2026-09-01": { complete: true, tags: ["salt"] }, "2026-09-02": { complete: false, tags: [] }, "2026-09-03": { complete: true, tags: ["travel"] } };
  return s;
}

describe("daily export — format", () => {
  const exp = buildDailyExport(mkState(), { now: new Date(2026, 8, 26, 21, 15, 3) });

  it("header", () => {
    expect(exp).toMatchObject({ app: "BodyTracker", exportType: "daily", schemaVersion: SCHEMA_VERSION, units: { weight: "kg", length: "cm", energy: "kcal", macros: "g" } });
    expect(exp.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(exp.exportedAt).toMatch(/^2026-09-26T21:15:03[+-]\d\d:\d\d$/);
    if (TZ === "Asia/Riyadh") expect(exp.exportedAt).toBe("2026-09-26T21:15:03+03:00");
    if (TZ === "America/New_York") expect(exp.exportedAt).toBe("2026-09-26T21:15:03-04:00");
  });

  it("default range = first to last date with data; empty days omitted; sorted", () => {
    expect(exp.range).toEqual({ from: "2026-09-01", to: "2026-09-04", daysWithData: 3 });
    expect(exp.days.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-04"]);
  });

  it("multiple weigh-ins: weight = model daily value, weighIns lists all", () => {
    const d = exp.days[0];
    expect(d.weight).toBe(94.6);
    expect(d.weighIns).toEqual([{ time: "07:10", weight: 94.6 }, { time: "19:05", weight: 95.3 }]);
    expect(exp.days[2].weighIns).toBeUndefined();
  });

  it("composition: present fields only, 1 decimal", () => {
    expect(exp.days[0].composition).toEqual({ source: "bia", bodyFat: 28.4, fatMass: 26.9, muscleMass: 38.2 });
    expect(exp.days[2].composition).toBeUndefined();
  });

  it("tape: waist averaged from readings; latest entry per measurement", () => {
    expect(exp.days[1].tape).toEqual({ waist: 101.5, neck: 40.4, hips: 104 });
  });

  it("food: totals, macros only if logged, logged 0 kept, complete flag, no entries without the toggle", () => {
    expect(exp.days[0].food).toEqual({ calories: 2240, protein: 182, carbs: 190, fat: 70, complete: true });
    expect(exp.days[1].food).toEqual({ calories: 0, protein: 0, complete: false });
    expect(exp.days[2].food).toEqual({ calories: 2100, complete: false });
  });

  it("water tags only when tagged; tag-only days are not days with data", () => {
    expect(exp.days[0].waterTags).toEqual(["high salt"]);
    expect(exp.days[1].waterTags).toBeUndefined();
  });

  it("no nulls anywhere; round-trips through JSON.parse", () => {
    const text = JSON.stringify(exp);
    expect(text).not.toContain("null");
    expect(JSON.parse(text)).toEqual(exp);
  });

  it("metric output even with lb/in display units", () => {
    const s = mkState();
    const metric = buildDailyExport({ ...s, settings: { ...s.settings, units: { weight: "kg", length: "cm" } } }, { now: new Date(2026, 8, 26, 21, 15, 3) });
    expect(metric.days).toEqual(exp.days);
    expect(exp.days[0].weight).toBe(94.6); // kg, not lb
  });
});

describe("daily export — options and edge cases", () => {
  it("individual food entries only with the toggle", () => {
    const exp = buildDailyExport(mkState(), { includeEntries: true });
    expect(exp.days[0].food.entries).toEqual([
      { label: "Lunch", calories: 750, protein: 60, carbs: 70, fat: 22 },
      { calories: 1490, protein: 122, carbs: 120, fat: 48 },
    ]);
    expect(exp.days[1].food.entries).toEqual([{ label: "Fast", calories: 0, protein: 0 }]);
  });

  it("macros missing on all entries are omitted", () => {
    const exp = buildDailyExport(mkState(), { from: "2026-09-04", to: "2026-09-04" });
    expect(Object.keys(exp.days[0].food)).toEqual(["calories", "complete"]);
  });

  it("outlier days have weightIgnored: true (and can be un-ignored)", () => {
    const s = emptyState();
    s.entries = Array.from({ length: 15 }, (_, i) => ({ id: i, date: addDays("2026-08-01", i), weight: i === 7 ? 86 : 80 + 0.1 * (i % 3) }));
    const exp = buildDailyExport(s);
    expect(exp.days.filter((d) => d.weightIgnored).map((d) => d.date)).toEqual(["2026-08-08"]);
    expect(exp.days[7].weight).toBe(86);
    s.settings = { ...s.settings, includeDates: ["2026-08-08"] };
    expect(buildDailyExport(s).days.some((d) => d.weightIgnored)).toBe(false);
  });

  it("empty range → days: [], daysWithData: 0", () => {
    const exp = buildDailyExport(mkState(), { from: "2026-09-03", to: "2026-09-03" });
    expect(exp.days).toEqual([]);
    expect(exp.range).toEqual({ from: "2026-09-03", to: "2026-09-03", daysWithData: 0 });
    const none = buildDailyExport(emptyState(), { now: new Date(2026, 8, 26, 12) });
    expect(none.days).toEqual([]);
    expect(none.range.daysWithData).toBe(0);
  });

  it("rejects from > to and invalid dates", () => {
    expect(() => buildDailyExport(mkState(), { from: "2026-09-04", to: "2026-09-01" })).toThrow(RangeError);
    expect(() => buildDailyExport(mkState(), { from: "2026-13-01", to: "2026-09-01" })).toThrow(RangeError);
  });

  it("summary and filename", () => {
    const exp = buildDailyExport(mkState());
    expect(dailyExportSummary(exp)).toEqual({ from: "2026-09-01", to: "2026-09-04", days: 3, weighInDays: 2, foodDays: 3, tapeDays: 1 });
    expect(dailyExportFilename(exp)).toBe("bodytracker-daily_2026-09-01_to_2026-09-04.json");
    expect(datesWithData(mkState())).toEqual(["2026-09-01", "2026-09-02", "2026-09-04"]);
  });

  it("is not accepted by Import (only full backups are)", () => {
    const v = validateBackup(JSON.stringify(buildDailyExport(mkState())));
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatch(/daily data export/);
  });
});

describe("daily export — inclusive local-date boundaries (run under both test time zones)", () => {
  // entries dated with localDateString, as the app does, just after midnight and just before
  const d1 = localDateString(new Date(2026, 8, 10, 0, 30)); // 00:30 local on the 10th
  const d2 = localDateString(new Date(2026, 8, 12, 23, 59)); // 23:59 local on the 12th
  const s = emptyState();
  s.entries = [
    { id: 1, date: addDays(d1, -1), weight: 80 },
    { id: 2, date: d1, weight: 80.1 },
    { id: 3, date: d2, weight: 80.2 },
    { id: 4, date: addDays(d2, 1), weight: 80.3 },
  ];

  it("dates come from local time, not UTC", () => {
    expect(d1).toBe("2026-09-10");
    expect(d2).toBe("2026-09-12");
  });

  it("from and to are both included; days outside are excluded", () => {
    const exp = buildDailyExport(s, { from: "2026-09-10", to: "2026-09-12" });
    expect(exp.days.map((d) => d.date)).toEqual(["2026-09-10", "2026-09-12"]);
    expect(exp.range.daysWithData).toBe(2);
    expect(buildDailyExport(s, { from: "2026-09-10", to: "2026-09-10" }).days.map((d) => d.date)).toEqual(["2026-09-10"]);
  });

  it("local ISO datetime carries the zone's offset", () => {
    const iso = localISOWithOffset(new Date(2026, 0, 15, 8, 0, 0));
    if (TZ === "Asia/Riyadh") expect(iso).toBe("2026-01-15T08:00:00+03:00");
    if (TZ === "America/New_York") expect(iso).toBe("2026-01-15T08:00:00-05:00");
  });
});
