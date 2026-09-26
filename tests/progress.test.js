import { describe, it, expect } from "vitest";
import { metricSeries, deltaInfo, goalProgress } from "../src/lib/progress.js";

describe("progress helpers", () => {
  const entries = [
    { date: "2026-09-01", weight: 90, waist: 100 },
    { date: "2026-09-05", weight: 89 },
    { date: "2026-09-08", waist: 98 },
    { date: "2026-09-09", weight: 88 },
  ];
  it("each metric uses its own latest value (old bug: latest entry lacked waist)", () => {
    const w = deltaInfo(metricSeries(entries, "waist"), "first");
    expect(w.latest.value).toBe(98);
    expect(w.delta).toBe(-2);
  });
  it("vs last uses the previous value of that metric", () => {
    expect(deltaInfo(metricSeries(entries, "weight"), "last").delta).toBe(-1);
    expect(deltaInfo([{ date: "x", value: 1 }], "last").delta).toBeNull();
  });
  it("weight can come from the cleaned daily series", () => {
    expect(metricSeries(entries, "weight", [{ date: "2026-09-01", weight: 90 }])).toEqual([{ date: "2026-09-01", value: 90 }]);
  });
  it("goal progress", () => {
    expect(goalProgress(90, 85, 80)).toBe(0.5);
    expect(goalProgress(90, 78, 80)).toBeCloseTo(1.2, 9);
    expect(goalProgress(80, 80, 80)).toBe(1);
    expect(goalProgress(null, 80, 70)).toBe(0);
  });
});
