import { describe, it, expect } from "vitest";
import { computeModel, recommendation, missingProfile, bodyFatReadings } from "../src/lib/analysis.js";
import { emptyState } from "../src/lib/storage.js";
import { addDays } from "../src/lib/dates.js";
import { simulate } from "./sim.js";

function stateFromSim(sim, start, extra = {}) {
  const s = emptyState();
  s.settings = { ...s.settings, heightCm: 180, age: 35, sex: "male", activity: "moderate", alreadyStable: false, checkinWeekday: 0, goalDir: "lose", ratePct: 0.5, onboarded: true, ...extra };
  s.entries = sim.weights.map((w, i) => ({ id: i + 1, date: addDays(start, i), weight: w, source: "bia" }));
  s.food = sim.intakeLogged.map((k, i) => (k == null ? null : { id: 1000 + i, date: addDays(start, i), label: null, kcal: k, protein: 160, carbs: 200, fat: 70 })).filter(Boolean);
  for (const f of s.food) s.days[f.date] = { complete: true, tags: [] };
  return s;
}

describe("computeModel", () => {
  const start = "2026-08-01";
  const sim = simulate({ seed: 3, days: 56 });
  const today = addDays(start, 55);
  const m = computeModel(stateFromSim(sim, start), today);

  it("produces a Kalman estimate with a ± range, data share and label", () => {
    expect(m.kalman.tdee.displayTdee % 10).toBe(0);
    expect(m.kalman.tdee.displayHalf % 10).toBe(0);
    expect(m.kalman.tdee.dataShare).toBeGreaterThan(0.5);
    expect(m.kalman.tdee.label).toBe("Measured");
    expect(Math.abs(m.kalman.tdee.tdee - 2800)).toBeLessThan(400);
  });

  it("snapshot is the last check-in weekday", () => {
    expect(new Date(m.snapshot.date + "T12:00").getDay()).toBe(0);
    expect(m.snapshot.date <= today).toBe(true);
  });

  it("targets use Hall/Forbes energy per kg and the floor", () => {
    expect(m.energy.energyPerKg).not.toBe(7700);
    expect(m.targets.dir).toBe("lose");
    expect(m.targets.delta).toBeCloseTo(m.targets.rateKgDay * m.energy.energyPerKg, 9);
    expect(m.targets.target).toBeGreaterThanOrEqual(m.targets.floor.floor);
    expect(m.targets.status).not.toBeNull();
  });

  it("regression cross-check runs at the snapshot", () => {
    expect(m.regression.ok).toBe(true);
    expect(m.agreement).not.toBeNull();
  });

  it("recommendation text is produced", () => {
    expect(recommendation(m).text.length).toBeGreaterThan(10);
  });

  it("missing profile blocks calorie math (no hidden defaults)", () => {
    const s = stateFromSim(sim, start);
    s.settings.heightCm = null;
    const mm = computeModel(s, today);
    expect(mm.kalman).toBeNull();
    expect(mm.reason).toMatch(/height/);
    expect(missingProfile(s.settings)).toContain("height");
  });

  it("minors get no targets", () => {
    const mm = computeModel(stateFromSim(sim, start, { age: 16 }), today);
    expect(mm.targets).toBeNull();
    expect(recommendation(mm).text).toBe("Calorie targets are for adults. Please talk to a doctor or parent.");
  });

  it("pregnant → maintenance target", () => {
    const mm = computeModel(stateFromSim(sim, start, { pregnant: true }), today);
    expect(mm.targets.dir).toBe("maintain");
    expect(mm.targets.target).toBeCloseTo(Math.max(mm.kalman.tdee.tdee, mm.targets.floor.floor), 6);
  });

  it("typo weigh-ins are ignored and reported", () => {
    const s = stateFromSim(sim, start);
    s.entries[20] = { ...s.entries[20], weight: s.entries[20].weight + 6 };
    const mm = computeModel(s, today);
    expect(mm.cleaning.points.find((p) => p.date === s.entries[20].date).outlier).toBe(true);
    expect(mm.cleaning.ignored).toBeGreaterThanOrEqual(1);
  });

  it("body-fat readings include the onboarding value", () => {
    const r = bodyFatReadings([{ date: "2026-08-01", bodyFat: 20, source: "bia" }, { date: "2026-08-02", bodyFat: 21, source: "tape" }], { bf: { value: 22, source: "dexa", date: "2026-07-01" } });
    expect(r).toEqual([{ date: "2026-07-01", bf: 22, source: "dexa" }, { date: "2026-08-01", bf: 20, source: "bia" }]);
  });
});
