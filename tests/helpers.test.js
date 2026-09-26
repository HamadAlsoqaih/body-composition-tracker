// Unit tests for the smaller exported helpers.
import { describe, it, expect } from "vitest";
import { latestNavy, buildInsights } from "../src/lib/analysis.js";
import { sourceLabel } from "../src/lib/composition.js";
import { newId } from "../src/lib/foodlog.js";
import { add, sub, mulVec, symmetrize, isPositiveDefinite } from "../src/lib/kalman.js";
import { safeGetRaw, sanitizeEntry, sanitizeFood, sanitizeSettings, toCSV } from "../src/lib/storage.js";

describe("analysis helpers", () => {
  it("latestNavy uses the newest tape entry with valid inputs", () => {
    const s = { heightCm: 180, sex: "male" };
    const e = [
      { date: "2026-09-01", waist: 90, neck: 38 },
      { date: "2026-09-10", waist: 30, neck: 38 }, // invalid (waist < neck) → skipped
    ];
    const r = latestNavy(e, s);
    expect(r.date).toBe("2026-09-01");
    expect(r.bf).toBeCloseTo(19.81, 1);
    expect(latestNavy(e, { sex: "male" })).toBeNull();
  });
  it("buildInsights reports low completeness and capped targets neutrally", () => {
    const m = {
      week: { completeDays: 2, mismatches: [], avgProtein: null, avgFat: null },
      guard: { messages: [] },
      targets: { floor: { capped: true, message: "raised" }, rateWarning: null, macros: { protein: 150, fat: 60 }, lowCarbNote: null, eta: null },
      rapid: null,
    };
    const ins = buildInsights(m);
    expect(ins.map((i) => i.text)).toContain("raised");
    expect(ins.some((i) => /2 of the last 7 days/.test(i.text))).toBe(true);
  });
});

describe("small helpers", () => {
  it("sourceLabel", () => {
    expect(sourceLabel("dexa")).toBe("DEXA");
    expect(sourceLabel("x")).toBe("Unknown");
  });
  it("newId is unique", () => {
    const ids = new Set(Array.from({ length: 500 }, newId));
    expect(ids.size).toBe(500);
  });
  it("vector/matrix helpers", () => {
    expect(add([1, 2], [3, 4])).toEqual([4, 6]);
    expect(sub([1, 2], [3, 4])).toEqual([-2, -2]);
    expect(mulVec([1, 0, 0, 0, 2, 0, 0, 0, 3], [1, 1, 1])).toEqual([1, 2, 3]);
    const S = symmetrize([1, 2, 0, 0, -5, 0, 0, 0, 1]);
    expect(S[1]).toBe(1);
    expect(S[3]).toBe(1);
    expect(S[4]).toBeGreaterThan(0); // negative variance guarded
    expect(isPositiveDefinite([1, 0, 0, 0, 1, 0, 0, 0, 1])).toBe(true);
    expect(isPositiveDefinite([1, 2, 0, 2, 1, 0, 0, 0, 1])).toBe(false);
  });
});

describe("storage helpers", () => {
  it("safeGetRaw survives a throwing storage", () => {
    expect(safeGetRaw({ getItem: () => { throw new Error("x"); } }, "k").error).toBeTruthy();
    expect(safeGetRaw(null, "k").raw).toBeNull();
  });
  it("sanitizeEntry / sanitizeFood", () => {
    expect(sanitizeEntry({ date: "2026-09-01", weight: "80.5" })).toEqual({ id: "m0-2026-09-01", date: "2026-09-01", weight: 80.5 }); // weight-only: no source
    expect(sanitizeEntry({ date: "2026-09-01", weight: 80, bodyFat: 20 }).source).toBe("bia");
    expect(sanitizeEntry({ date: "2026-09-01", weight: -3 })).toBeNull();
    expect(sanitizeEntry({ date: "2026-09-01", waist: 90, source: "tape", waistReadings: [90, "x", 91] }).waistReadings).toEqual([90, 91]);
    expect(sanitizeFood({ date: "2026-09-01", calories: 500 })).toMatchObject({ kcal: 500, protein: null });
    expect(sanitizeFood({ date: "2026-09-01" })).toBeNull();
  });
  it("sanitizeSettings keeps valid values and drops junk (no hidden defaults)", () => {
    const s = sanitizeSettings({ heightCm: 999, age: "40", sex: "other", units: { weight: "lb" }, checkinWeekday: 3, pregnant: 1 });
    expect(s.heightCm).toBeNull();
    expect(s.age).toBe(40);
    expect(s.sex).toBeNull();
    expect(s.units).toEqual({ weight: "lb", length: "cm" });
    expect(s.checkinWeekday).toBe(3);
    expect(s.pregnant).toBe(true);
  });
  it("toCSV escapes cells", () => {
    expect(toCSV(["a", "b"], [["x,y", null]])).toBe('a,b\n"x,y",\n');
  });
});
