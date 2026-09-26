import { describe, it, expect } from "vitest";
import { dailyWeights, flagOutliers, emaTrend, trendAt, regressionCrossCheck, median, sd } from "../src/lib/trend.js";
import { addDays } from "../src/lib/dates.js";
import { rng } from "./sim.js";

describe("dailyWeights", () => {
  it("uses the earliest weigh-in by timestamp when all have times", () => {
    const d = dailyWeights([
      { id: 1, date: "2026-09-01", weight: 81, time: "2026-09-01T18:00:00.000Z" },
      { id: 2, date: "2026-09-01", weight: 80, time: "2026-09-01T05:00:00.000Z" },
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].weight).toBe(80);
    expect(d[0].method).toBe("earliest");
  });
  it("uses the mean for legacy entries without a time", () => {
    const d = dailyWeights([
      { id: 1, date: "2026-09-01", weight: 81 },
      { id: 2, date: "2026-09-01", weight: 80, time: "2026-09-01T05:00:00.000Z" },
      { id: 3, date: "2026-09-02", weight: 79 },
      { id: 4, date: "2026-09-02" }, // tape-only entry
    ]);
    expect(d[0].weight).toBe(80.5);
    expect(d[0].method).toBe("mean");
    expect(d[1].weight).toBe(79);
  });
});

describe("flagOutliers", () => {
  const base = Array.from({ length: 30 }, (_, i) => ({ date: addDays("2026-09-01", i), weight: 80 + 0.3 * Math.sin(i) }));
  it("flags a +5 kg typo and nothing else", () => {
    const d = base.map((p, i) => (i === 12 ? { ...p, weight: p.weight + 5 } : p));
    const { points, threshold } = flagOutliers(d);
    expect(threshold).toBeGreaterThanOrEqual(1.5);
    expect(points.filter((p) => p.outlier).map((p) => p.date)).toEqual([d[12].date]);
  });
  it("threshold is max(1.5, 3.5 × 1.4826 × MAD)", () => {
    const r = rng(3);
    const noisy = base.map((p) => ({ ...p, weight: 80 + 1.5 * r.normal() }));
    const { threshold, mad } = flagOutliers(noisy);
    expect(threshold).toBeCloseTo(Math.max(1.5, 3.5 * 1.4826 * mad), 12);
    expect(threshold).toBeGreaterThan(1.5);
  });
  it("can be un-ignored", () => {
    const d = base.map((p, i) => (i === 12 ? { ...p, weight: p.weight + 5 } : p));
    const { points } = flagOutliers(d, [d[12].date]);
    expect(points[12].flagged).toBe(true);
    expect(points[12].outlier).toBe(false);
    expect(points[12].overridden).toBe(true);
  });
  it("does not judge isolated points (fewer than 3 in the window)", () => {
    const sparse = [0, 7, 14].map((i) => ({ date: addDays("2026-09-01", i), weight: 80 + i }));
    expect(flagOutliers(sparse).points.every((p) => !p.flagged)).toBe(true);
  });
});

describe("emaTrend", () => {
  it("alpha 0.1/day, and 1 − 0.9^d across a gap", () => {
    const t = emaTrend([
      { date: "2026-09-01", weight: 80 },
      { date: "2026-09-02", weight: 81 },
      { date: "2026-09-05", weight: 78 },
    ]);
    expect(t[0].trend).toBe(80);
    expect(t[1].trend).toBeCloseTo(80.1, 12);
    const a = 1 - 0.9 ** 3;
    expect(t[2].trend).toBeCloseTo(80.1 + a * (78 - 80.1), 12);
    expect(trendAt(t, "2026-09-03")).toBeCloseTo(80.1, 12);
    expect(trendAt(t, "2026-08-01")).toBeNull();
  });
});

describe("regressionCrossCheck", () => {
  const end = "2026-09-28";
  const mkPts = (f, days = 28) => Array.from({ length: days }, (_, i) => ({ date: addDays(end, i - days + 1), weight: f(i) }));
  const intake = new Map(Array.from({ length: 28 }, (_, i) => [addDays(end, i - 27), 2300]));

  it("recovers an exact slope and TDEE", () => {
    const pts = mkPts((i) => 90 - 0.065 * i + (i % 2 ? 0.1 : -0.1));
    const r = regressionCrossCheck({ points: pts, intakeByDate: intake, energyPerKg: 7700, endDate: end });
    expect(r.ok).toBe(true);
    expect(r.slope).toBeCloseTo(-0.065, 2);
    // the ±0.1 wiggle is slightly correlated with the day index (even n), so allow a few kcal
    expect(Math.abs(r.tdee - (2300 + 0.065 * 7700))).toBeLessThan(10);
    // alternating residuals → negative lag-1 autocorrelation, clamped to 0
    expect(r.rho).toBe(0);
    expect(r.se).toBeCloseTo(r.seRaw, 12);
  });

  it("inflates SE by sqrt((1+ρ)/(1−ρ)), ρ clamped to ≤ 0.9", () => {
    const pts = mkPts((i) => 90 + 0.5 * Math.sin(i / 5));
    const r = regressionCrossCheck({ points: pts, intakeByDate: intake, energyPerKg: 7700, endDate: end });
    expect(r.rho).toBeGreaterThan(0);
    expect(r.rho).toBeLessThanOrEqual(0.9);
    expect(r.se / r.seRaw).toBeCloseTo(Math.sqrt((1 + r.rho) / (1 - r.rho)), 12);
  });

  it("uses ρ = 0.5 with fewer than 10 consecutive pairs", () => {
    const pts = mkPts((i) => 90 - 0.05 * i + 0.2 * Math.cos(i)).filter((_, i) => i % 2 === 0);
    const r = regressionCrossCheck({ points: pts, intakeByDate: intake, energyPerKg: 7700, endDate: end });
    expect(r.pairs).toBe(0);
    expect(r.rho).toBe(0.5);
    expect(r.se / r.seRaw).toBeCloseTo(Math.sqrt(3), 12);
  });

  it("reports insufficient data", () => {
    const r = regressionCrossCheck({ points: mkPts(() => 80, 5), intakeByDate: intake, energyPerKg: 7700, endDate: end });
    expect(r.ok).toBe(false);
    const r2 = regressionCrossCheck({ points: mkPts((i) => 80 - 0.05 * i), intakeByDate: new Map(), energyPerKg: 7700, endDate: end });
    expect(r2.ok).toBe(true);
    expect(r2.tdee).toBeNull();
  });
});

describe("stats helpers", () => {
  it("median / sd", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
});
