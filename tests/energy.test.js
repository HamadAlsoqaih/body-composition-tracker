import { describe, it, expect } from "vitest";
import {
  hallForbesEnergyPerKg, deurenbergBF, katchMcArdle, mifflinStJeor, bmi, activityFromSteps,
  bmrFor, formulaTDEE, bodyFatEstimate, energyPerKgFor, nearestActivityLevel, weightAtBmi,
  ACTIVITY_LEVELS, activityFactor, ENERGY_PER_KG_FALLBACK,
} from "../src/lib/energy.js";

describe("formulas vs hand-calculated values", () => {
  it("Mifflin-St Jeor", () => {
    // 10·80 + 6.25·180 − 5·30 + 5 = 800 + 1125 − 150 + 5
    expect(mifflinStJeor(80, 180, 30, "male")).toBe(1780);
    // 10·60 + 6.25·165 − 5·40 − 161 = 600 + 1031.25 − 200 − 161
    expect(mifflinStJeor(60, 165, 40, "female")).toBe(1270.25);
  });
  it("Katch-McArdle", () => {
    expect(katchMcArdle(60)).toBeCloseTo(1666, 10); // 370 + 21.6·60
  });
  it("Deurenberg", () => {
    // 1.2·25 + 0.23·40 − 10.8 − 5.4 = 30 + 9.2 − 16.2
    expect(deurenbergBF(25, 40, "male")).toBeCloseTo(23.0, 10);
    expect(deurenbergBF(25, 40, "female")).toBeCloseTo(33.8, 10);
  });
  it("Hall/Forbes energy per kg", () => {
    // FM 20: p = 10.4/30.4 = 0.342105…; 0.342105·1816 + 0.657895·9440 = 621.263 + 6210.526
    const r = hallForbesEnergyPerKg(20);
    expect(r.p).toBeCloseTo(0.3421053, 6);
    expect(r.energyPerKg).toBeCloseTo(6831.79, 1);
    // FM 10.4: p = 0.5 → (1816 + 9440)/2 = 5628
    expect(hallForbesEnergyPerKg(10.4).energyPerKg).toBeCloseTo(5628, 9);
    expect(hallForbesEnergyPerKg(NaN).energyPerKg).toBe(ENERGY_PER_KG_FALLBACK);
    expect(hallForbesEnergyPerKg(NaN).fallback).toBe(true);
  });
  it("BMI and weight at BMI", () => {
    expect(bmi(81, 180)).toBeCloseTo(25, 10);
    expect(weightAtBmi(25, 180)).toBeCloseTo(81, 10);
    expect(bmi(0, 180)).toBeNull();
  });
});

describe("activity", () => {
  it("has the five spec multipliers", () => {
    expect(ACTIVITY_LEVELS.map((a) => a.factor)).toEqual([1.2, 1.375, 1.55, 1.725, 1.9]);
    expect(activityFactor("moderate")).toBe(1.55);
  });
  it("suggests a level from steps at the boundaries", () => {
    expect(activityFromSteps(4999)).toBe("sedentary");
    expect(activityFromSteps(5000)).toBe("light");
    expect(activityFromSteps(7499)).toBe("light");
    expect(activityFromSteps(7500)).toBe("moderate");
    expect(activityFromSteps(9999)).toBe("moderate");
    expect(activityFromSteps(10000)).toBe("very");
    expect(activityFromSteps(12499)).toBe("very");
    expect(activityFromSteps(12500)).toBe("extreme");
    expect(activityFromSteps(NaN)).toBeNull();
  });
  it("maps a legacy multiplier to the nearest level", () => {
    expect(nearestActivityLevel(1.45)).toBe("light");
    expect(nearestActivityLevel(1.5)).toBe("moderate");
  });
});

describe("BMR choice and formula TDEE", () => {
  it("Katch-McArdle when BF% known, else Mifflin", () => {
    const k = bmrFor({ weightKg: 80, heightCm: 180, age: 30, sex: "male", bfPercent: 20 });
    expect(k.method).toBe("katch");
    expect(k.bmr).toBeCloseTo(370 + 21.6 * 64, 10);
    const m = bmrFor({ weightKg: 80, heightCm: 180, age: 30, sex: "male" });
    expect(m.method).toBe("mifflin");
    expect(m.bmr).toBe(1780);
    expect(bmrFor({ weightKg: 80 })).toBeNull(); // no hidden defaults
  });
  it("σ_f = 12% of formula TDEE", () => {
    const f = formulaTDEE({ weightKg: 80, heightCm: 180, age: 30, sex: "male", multiplier: 1.55 });
    expect(f.tdee).toBeCloseTo(1780 * 1.55, 10);
    expect(f.sigma).toBeCloseTo(0.12 * 1780 * 1.55, 10);
    expect(formulaTDEE({ weightKg: 80, heightCm: 180, age: 30, sex: "male" })).toBeNull();
  });
});

describe("body-fat source priority", () => {
  const person = { date: "2026-09-26", weightKg: 80, heightCm: 180, age: 40, sex: "male" };
  it("DEXA beats BIA; trend-smoothed with ≥ 3 readings", () => {
    const readings = [
      { date: "2026-07-01", bf: 22, source: "dexa" },
      { date: "2026-08-01", bf: 21, source: "dexa" },
      { date: "2026-09-01", bf: 20.5, source: "dexa" },
      { date: "2026-09-20", bf: 30, source: "bia" },
    ];
    const r = bodyFatEstimate({ ...person, readings });
    expect(r.source).toBe("dexa");
    expect(r.bfPercent).toBeGreaterThan(20);
    expect(r.bfPercent).toBeLessThan(21);
    expect(r.fatMass).toBeCloseTo(80 * r.bfPercent / 100, 10);
  });
  it("BIA/calipers: mean of last 3", () => {
    const readings = [18, 20, 22, 24].map((bf, i) => ({ date: `2026-09-0${i + 1}`, bf, source: "bia" }));
    const r = bodyFatEstimate({ ...person, readings });
    expect(r.bfPercent).toBeCloseTo(22, 10);
    expect(r.isEstimate).toBe(false);
  });
  it("falls back to Deurenberg, flagged as an estimate", () => {
    const r = bodyFatEstimate({ ...person, readings: [] });
    expect(r.source).toBe("deurenberg");
    expect(r.isEstimate).toBe(true);
    expect(r.bfPercent).toBeCloseTo(deurenbergBF(bmi(80, 180), 40, "male"), 10);
  });
  it("ignores readings after the date or older than 180 days", () => {
    const r = bodyFatEstimate({ ...person, readings: [{ date: "2025-01-01", bf: 15, source: "dexa" }, { date: "2026-10-01", bf: 15, source: "bia" }] });
    expect(r.source).toBe("deurenberg");
  });
  it("energyPerKgFor uses fat mass", () => {
    const e = energyPerKgFor({ fatMass: 20, bfPercent: 25, source: "bia", isEstimate: false });
    expect(e.energyPerKg).toBeCloseTo(6831.79, 1);
    expect(energyPerKgFor({ fatMass: null }).energyPerKg).toBe(7700);
  });
});
