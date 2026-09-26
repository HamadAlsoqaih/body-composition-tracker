import { describe, it, expect } from "vitest";
import { compareEnds, analyzeComposition, navyBodyFat, averageReadings, signal, MDC } from "../src/lib/composition.js";
import { addDays } from "../src/lib/dates.js";
import { rng } from "./sim.js";

const START = "2026-06-01";

describe("compareEnds", () => {
  const mk = (vals, gap = 7) => vals.map((v, i) => ({ date: addDays(START, i * gap), value: v }));
  it("means of the first 3 vs the last 3", () => {
    const c = compareEnds(mk([10, 11, 12, 20, 21, 22]));
    expect(c.ok).toBe(true);
    expect(c.firstMean).toBe(11);
    expect(c.lastMean).toBe(21);
    expect(c.delta).toBe(10);
  });
  it("needs ≥ 3 at each end and ≥ 21 days apart", () => {
    expect(compareEnds(mk([1, 2, 3, 4, 5])).ok).toBe(false);
    expect(compareEnds(mk([1, 2, 3, 4, 5, 6], 1)).ok).toBe(false); // daily readings: 3 days apart
    expect(compareEnds(mk([1, 2, 3, 4, 5, 6], 7)).ok).toBe(true); // 21 days apart
  });
  it("signal respects the minimum detectable change", () => {
    expect(signal({ ok: true, delta: -1.4 }, 1.5)).toBe(0);
    expect(signal({ ok: true, delta: -1.5 }, 1.5)).toBe(-1);
    expect(signal({ ok: false }, 1.5)).toBeNull();
  });
});

describe("navy body fat", () => {
  it("matches hand-calculated values", () => {
    // male: 495 / (1.0324 − 0.19077·log10(52) + 0.15456·log10(180)) − 450
    //      = 495 / (1.0324 − 0.327363 + 0.348575) − 450 = 19.81
    expect(navyBodyFat({ sex: "male", waist: 90, neck: 38, height: 180 })).toBeCloseTo(19.81, 1);
    // female: 495 / (1.29579 − 0.35004·log10(80+100−33) + 0.221·log10(165)) − 450
    //        = 495 / (1.29579 − 0.758659 + 0.490064) − 450 = 31.9
    expect(navyBodyFat({ sex: "female", waist: 80, hip: 100, neck: 33, height: 165 })).toBeCloseTo(31.9, 1);
  });
  it("rejects invalid inputs (log argument ≤ 0)", () => {
    expect(navyBodyFat({ sex: "male", waist: 35, neck: 38, height: 180 })).toBeNull();
    expect(navyBodyFat({ sex: "female", waist: 80, neck: 33, height: 165 })).toBeNull();
    expect(navyBodyFat({ sex: "male", waist: 90, neck: 38, height: 0 })).toBeNull();
  });
});

describe("waist readings", () => {
  it("averages 2–3 readings", () => {
    expect(averageReadings([90, 91, 92])).toBe(91);
    expect(averageReadings([90, "", null])).toBe(90);
    expect(averageReadings([])).toBeNull();
  });
});

/** 12 weeks, 2 BIA readings and 1 tape session (3 waist readings) per week. */
function simEntries(r, { fatLoss = 0, waistLoss = 0 } = {}) {
  const entries = [];
  for (let wk = 0; wk < 12; wk++) {
    const f = wk / 11;
    for (const d of [0, 3]) {
      const date = addDays(START, wk * 7 + d);
      entries.push({
        date, source: "bia",
        weight: 85 - fatLoss * f + 0.6 * r.normal(),
        fatMass: 20 - fatLoss * f + 0.8 * r.normal(),
        muscleMass: 38 + 0.8 * r.normal(),
        bodyFat: (100 * (20 - fatLoss * f)) / (85 - fatLoss * f) + 1.0 * r.normal(),
      });
    }
    const readings = [0, 1, 2].map(() => 92 - waistLoss * f + 0.7 * r.normal());
    entries.push({ date: addDays(START, wk * 7 + 1), source: "tape", waist: averageReadings(readings), waistReadings: readings });
  }
  return entries;
}

describe("classification", () => {
  it("12 weeks of pure BIA + tape noise → 'no measurable change' in ≥ 90% of 1,000 runs", () => {
    let flat = 0;
    for (let s = 1; s <= 1000; s++) {
      if (analyzeComposition(simEntries(rng(s * 31 + 7))).status === "flat") flat++;
    }
    console.log(`[composition] no-change runs classified flat: ${flat / 1000}`);
    expect(flat / 1000).toBeGreaterThanOrEqual(0.9);
  });

  it("true 4 kg fat loss with waist −4 cm → losing fat", () => {
    const clean = analyzeComposition(simEntries({ normal: () => 0 }, { fatLoss: 4, waistLoss: 4 }));
    expect(clean.status).toBe("cut");
    expect(clean.agreement).toBe("agree");
    expect(clean.confidence).toBe("high");
    let cut = 0;
    for (let s = 1; s <= 1000; s++) {
      if (analyzeComposition(simEntries(rng(s * 31 + 7), { fatLoss: 4, waistLoss: 4 })).status === "cut") cut++;
    }
    console.log(`[composition] 4 kg fat-loss runs classified 'losing fat': ${cut / 1000}`);
    expect(cut / 1000).toBeGreaterThanOrEqual(0.9);
  });

  it("not enough data yet with too few readings", () => {
    const a = analyzeComposition(simEntries({ normal: () => 0 }).slice(0, 5));
    expect(a.status).toBe("insufficient");
    expect(a.headline).toBe("Not enough data yet");
  });

  it("only compares readings from the same source", () => {
    const entries = [
      ...[0, 7, 14].map((d) => ({ date: addDays(START, d), source: "bia", fatMass: 25 })),
      ...[28, 35, 42].map((d) => ({ date: addDays(START, d), source: "dexa", fatMass: 18 })),
    ];
    expect(analyzeComposition(entries).status).toBe("insufficient");
  });

  it("BIA muscle is flagged low-confidence; DEXA thresholds are 1 kg", () => {
    const e = [0, 7, 14, 35, 42, 49].map((d, i) => ({ date: addDays(START, d), source: "bia", muscleMass: i < 3 ? 38 : 40, fatMass: 20 }));
    const a = analyzeComposition(e);
    expect(a.muscleLowConfidence).toBe(true);
    expect(a.status).toBe("gain");
    expect(MDC.dexa.fatMass).toBe(1.0);
    const d = [0, 7, 14, 35, 42, 49].map((x, i) => ({ date: addDays(START, x), source: "dexa", fatMass: i < 3 ? 20 : 18.9, muscleMass: 50 }));
    expect(analyzeComposition(d).status).toBe("cut");
  });
});
