import { describe, it, expect } from "vitest";
import {
  RATE_LIMITS, rateWarning, targetCalories, targetRateKgPerDay, proteinReferenceWeight, macroTargets,
  onTrack, goalETA, proteinPerKgFor, defaultProteinPerKg, defaultRate,
} from "../src/lib/targets.js";

describe("rates", () => {
  it("ranges and defaults", () => {
    expect(RATE_LIMITS.lose).toMatchObject({ min: 0.25, max: 1.0, def: 0.5 });
    expect(RATE_LIMITS.gain).toMatchObject({ min: 0.1, max: 0.5, def: 0.25 });
    expect(defaultRate("maintain")).toBe(0);
  });
  it("warns outside the ranges", () => {
    expect(rateWarning("lose", 0.5)).toBeNull();
    expect(rateWarning("lose", 1.2)).toMatch(/above/);
    expect(rateWarning("lose", 0.1)).toMatch(/below/);
    expect(rateWarning("gain", 0.6)).toMatch(/above/);
    expect(rateWarning("maintain", 0)).toBeNull();
  });
});

describe("target calories", () => {
  it("lose: TDEE − rate × weight × energyPerKg / 7", () => {
    const t = targetCalories({ tdee: 2800, dir: "lose", ratePct: 0.5, trendWeightKg: 90, energyPerKg: 7000 });
    expect(t.delta).toBeCloseTo(-(0.005 * 90 * 7000) / 7, 9); // −450
    expect(t.target).toBeCloseTo(2350, 9);
  });
  it("gain adds, maintain = TDEE", () => {
    expect(targetCalories({ tdee: 2500, dir: "gain", ratePct: 0.25, trendWeightKg: 70, energyPerKg: 6000 }).target).toBeCloseTo(2500 + 150, 9);
    expect(targetCalories({ tdee: 2500, dir: "maintain", ratePct: 0.5, trendWeightKg: 70, energyPerKg: 6000 }).target).toBe(2500);
    expect(targetCalories({ tdee: null, dir: "lose", ratePct: 0.5, trendWeightKg: 70, energyPerKg: 6000 })).toBeNull();
  });
  it("target rate is signed", () => {
    expect(targetRateKgPerDay("lose", 0.7, 70)).toBeCloseTo(-0.07, 12);
    expect(targetRateKgPerDay("gain", 0.7, 70)).toBeCloseTo(0.07, 12);
  });
});

describe("protein reference weight branches", () => {
  it("male, BF% > 25 → lean / 0.85", () => {
    const r = proteinReferenceWeight({ weightKg: 100, heightCm: 180, bfPercent: 30, bfMeasured: true, sex: "male" });
    expect(r.branch).toBe("lean");
    expect(r.refWeight).toBeCloseTo(70 / 0.85, 9);
  });
  it("female, BF% > 32 → lean / 0.75", () => {
    const r = proteinReferenceWeight({ weightKg: 80, heightCm: 165, bfPercent: 40, bfMeasured: true, sex: "female" });
    expect(r.refWeight).toBeCloseTo(48 / 0.75, 9);
  });
  it("female, BF% 30 (≤ 32) and BMI ≤ 30 → trend weight", () => {
    const r = proteinReferenceWeight({ weightKg: 65, heightCm: 165, bfPercent: 30, bfMeasured: true, sex: "female" });
    expect(r.branch).toBe("trend");
    expect(r.refWeight).toBe(65);
  });
  it("BF% unknown or estimated, BMI > 30 → weight at BMI 25", () => {
    const r = proteinReferenceWeight({ weightKg: 110, heightCm: 180, bfPercent: 35, bfMeasured: false, sex: "male" });
    expect(r.branch).toBe("bmi25");
    expect(r.refWeight).toBeCloseTo(81, 9);
  });
  it("otherwise trend weight", () => {
    expect(proteinReferenceWeight({ weightKg: 75, heightCm: 180, sex: "male" }).refWeight).toBe(75);
  });
  it("defaults 1.8 lose / 1.6 otherwise, user value clamped to 1.2–2.4", () => {
    expect(defaultProteinPerKg("lose")).toBe(1.8);
    expect(defaultProteinPerKg("gain")).toBe(1.6);
    expect(proteinPerKgFor("maintain", null)).toBe(1.6);
    expect(proteinPerKgFor("lose", 3)).toBe(2.4);
    expect(proteinPerKgFor("lose", 1)).toBe(1.2);
  });
});

describe("macros", () => {
  it("fat floor = max(20% kcal ÷ 9, 0.5 g/kg ref)", () => {
    const m = macroTargets({ targetKcal: 2250, refWeight: 80, proteinPerKg: 1.8 });
    expect(m.protein).toBeCloseTo(144, 9);
    expect(m.fat).toBeCloseTo(50, 9); // 450/9 = 50 > 40
    expect(m.fatBasis).toBe("20% of calories");
    expect(m.carbs).toBeCloseTo((2250 - 576 - 450) / 4, 9);
    expect(m.lowCarb).toBe(false);
    const m2 = macroTargets({ targetKcal: 1500, refWeight: 120, proteinPerKg: 1.6 });
    expect(m2.fat).toBeCloseTo(60, 9); // 0.5×120 = 60 > 33.3
    expect(m2.fatBasis).toBe("0.5 g/kg reference weight");
  });
  it("carb note when carbs < 50 g", () => {
    const m = macroTargets({ targetKcal: 1500, refWeight: 120, proteinPerKg: 2.2 });
    expect(m.lowCarb).toBe(true);
    expect(m.carbs).toBe(0);
  });
});

describe("on track and ETA", () => {
  it("on track when the target rate is inside the 95% interval", () => {
    const r = { rate: -0.05, lo: -0.08, hi: -0.02 };
    expect(onTrack({ targetRateKgDay: -0.06, rate: r, energyPerKg: 7000 }).onTrack).toBe(true);
    const off = onTrack({ targetRateKgDay: -0.1, rate: r, energyPerKg: 7000 });
    expect(off.onTrack).toBe(false);
    expect(off.adjustKcal).toBeCloseTo(-0.05 * 7000, 9); // eat 350 less
  });
  it("ETA uses a % of body weight, so kg/week slows as weight drops", () => {
    const e = goalETA({ currentKg: 100, goalKg: 90, dir: "lose", ratePct: 0.5 });
    expect(e.weeks).toBeCloseTo(Math.log(0.9) / Math.log(0.995), 9); // ≈ 21 weeks
    expect(e.weeks).toBeGreaterThan(10 / 0.5); // linear 0.5 kg/week would be 20
    expect(e.low).toBeLessThan(e.weeks);
    expect(e.high).toBeGreaterThan(e.weeks);
    expect(goalETA({ currentKg: 100, goalKg: 110, dir: "lose", ratePct: 0.5 })).toBeNull();
    expect(goalETA({ currentKg: 70, goalKg: 75, dir: "gain", ratePct: 0.25 }).weeks).toBeGreaterThan(0);
  });
});
