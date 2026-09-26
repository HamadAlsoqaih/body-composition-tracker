import { describe, it, expect } from "vitest";
import {
  makeFoodEntry, addFoodEntry, updateFoodEntry, deleteFoodEntry, dailyTotals, intakeSummary,
  macroMismatch, setDayComplete, yesterdayPrompt, toggleDayTag, dayTags, completeIntakeByDate,
  isDayComplete, dismissDayPrompt, entriesForDate,
} from "../src/lib/foodlog.js";
import { lastNDays } from "../src/lib/dates.js";

const mk = (o) => makeFoodEntry(o).entry;

describe("food entries", () => {
  it("validates input", () => {
    expect(makeFoodEntry({ date: "2026-09-01", kcal: "" }).error).toBeTruthy();
    expect(makeFoodEntry({ date: "2026-09-01", kcal: -5 }).error).toBeTruthy();
    expect(makeFoodEntry({ date: "2026-09-01", kcal: 500, protein: -1 }).error).toBeTruthy();
    const e = mk({ date: "2026-09-01", kcal: "500", protein: "", label: "Lunch" });
    expect(e.kcal).toBe(500);
    expect(e.protein).toBeNull();
    expect(e.label).toBe("Lunch");
  });

  it("multiple entries per day sum; nothing is overwritten", () => {
    let log = [];
    log = addFoodEntry(log, mk({ id: 1, date: "2026-09-01", kcal: 600, protein: 40, carbs: 50, fat: 20 }));
    log = addFoodEntry(log, mk({ id: 2, date: "2026-09-01", kcal: 900, protein: 60, carbs: 80, fat: 30 }));
    log = addFoodEntry(log, mk({ id: 3, date: "2026-09-02", kcal: 2000 }));
    expect(log).toHaveLength(3);
    const t = dailyTotals(log).get("2026-09-01");
    expect(t.kcal).toBe(1500);
    expect(t.protein).toBe(100);
    expect(t.n).toBe(2);
    expect(entriesForDate(log, "2026-09-01")).toHaveLength(2);
  });

  it("edit and delete individual entries", () => {
    let log = [mk({ id: 1, date: "2026-09-01", kcal: 600 }), mk({ id: 2, date: "2026-09-01", kcal: 900 })];
    log = updateFoodEntry(log, 2, { kcal: 1000, id: 99 });
    expect(log.find((f) => f.id === 2).kcal).toBe(1000);
    expect(dailyTotals(log).get("2026-09-01").kcal).toBe(1600);
    log = deleteFoodEntry(log, 1);
    expect(dailyTotals(log).get("2026-09-01").kcal).toBe(1000);
  });

  it("a macro missing from any entry makes that day's macro unknown (not a partial sum)", () => {
    const log = [mk({ date: "2026-09-01", kcal: 600, protein: 40 }), mk({ date: "2026-09-01", kcal: 900 })];
    expect(dailyTotals(log).get("2026-09-01").protein).toBeNull();
  });
});

describe("intake summary", () => {
  const today = "2026-09-07";
  const win = lastNDays(7, today);
  const log = [
    mk({ date: "2026-09-01", kcal: 2000, protein: 150 }),
    mk({ date: "2026-09-02", kcal: 2200 }), // protein not logged
    mk({ date: "2026-09-03", kcal: 800, protein: 30 }), // incomplete day
    mk({ date: "2026-09-04", kcal: 2400, protein: 170 }),
    mk({ date: "2026-08-20", kcal: 5000, protein: 10 }), // outside window
  ];
  let days = {};
  days = setDayComplete(days, "2026-09-01", true);
  days = setDayComplete(days, "2026-09-02", true);
  days = setDayComplete(days, "2026-09-04", true);
  days = setDayComplete(days, "2026-08-20", true);

  const s = intakeSummary(log, days, win);

  it("incomplete and unlogged days are excluded (not zero)", () => {
    expect(s.completeDays).toBe(3);
    expect(s.loggedIncomplete).toBe(1);
    expect(s.avgKcal).toBeCloseTo((2000 + 2200 + 2400) / 3, 9);
  });

  it("missing macros are not counted as 0", () => {
    expect(s.proteinDays).toBe(2);
    expect(s.avgProtein).toBeCloseTo(160, 9);
    expect(s.avgFat).toBeNull();
  });

  it("completeIntakeByDate only has complete days", () => {
    const m = completeIntakeByDate(log, days);
    expect(m.has("2026-09-03")).toBe(false);
    expect(m.get("2026-09-04")).toBe(2400);
    expect(isDayComplete(days, "2026-09-03")).toBe(false);
  });
});

describe("macro sanity check", () => {
  it("flags > 15% gap only when all three macros are logged", () => {
    expect(macroMismatch({ kcal: 2000, protein: 150, carbs: 200, fat: 67 }).flagged).toBe(false); // 2003
    expect(macroMismatch({ kcal: 2000, protein: 100, carbs: 100, fat: 50 }).flagged).toBe(true); // 1250
    expect(macroMismatch({ kcal: 2000, protein: 100, carbs: null, fat: 50 })).toBeNull();
    // boundary: exactly 15% is not flagged
    expect(macroMismatch({ kcal: 1000, protein: 0, carbs: 0, fat: 1150 / 9 }).flagged).toBe(false);
  });
});

describe("day flags", () => {
  it("prompts to mark yesterday complete once", () => {
    const log = [mk({ date: "2026-09-06", kcal: 1500 })];
    expect(yesterdayPrompt(log, {}, "2026-09-07")).toBe("2026-09-06");
    expect(yesterdayPrompt(log, dismissDayPrompt({}, "2026-09-06"), "2026-09-07")).toBeNull();
    expect(yesterdayPrompt(log, setDayComplete({}, "2026-09-06", true), "2026-09-07")).toBeNull();
    expect(yesterdayPrompt([], {}, "2026-09-07")).toBeNull();
  });
  it("toggles water tags", () => {
    let d = toggleDayTag({}, "2026-09-01", "salt");
    expect(dayTags(d, "2026-09-01")).toEqual(["salt"]);
    d = toggleDayTag(d, "2026-09-01", "salt");
    expect(dayTags(d, "2026-09-01")).toEqual([]);
  });
});
