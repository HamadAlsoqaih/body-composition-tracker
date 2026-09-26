import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  effectiveGoal, applyCalorieFloor, calorieFloor, validateGoalWeight, rapidLossWarning, MSG, hasAvoidedWording, AVOID_WORDS,
} from "../src/lib/guardrails.js";

describe("guardrails", () => {
  it("under 18: no targets, adult-only message", () => {
    const g = effectiveGoal({ age: 17, dir: "lose", weightKg: 70, heightCm: 175 });
    expect(g.allowTargets).toBe(false);
    expect(g.messages[0].text).toBe("Calorie targets are for adults. Please talk to a doctor or parent.");
    expect(effectiveGoal({ age: 18, dir: "lose", weightKg: 70, heightCm: 175 }).allowTargets).toBe(true);
  });
  it("pregnant/breastfeeding: maintenance only with a note", () => {
    const g = effectiveGoal({ age: 30, pregnant: true, dir: "lose", weightKg: 70, heightCm: 170 });
    expect(g.dir).toBe("maintain");
    expect(g.messages.map((m) => m.text)).toContain(MSG.pregnant);
    expect(effectiveGoal({ age: 30, pregnant: true, dir: "gain", weightKg: 70, heightCm: 170 }).dir).toBe("maintain");
  });
  it("BMI < 18.5: loss disabled", () => {
    const g = effectiveGoal({ age: 30, dir: "lose", weightKg: 55, heightCm: 175 }); // BMI 17.96
    expect(g.dir).toBe("maintain");
    expect(g.messages.map((m) => m.text)).toContain(MSG.lowBmi);
    expect(effectiveGoal({ age: 30, dir: "gain", weightKg: 55, heightCm: 175 }).dir).toBe("gain");
  });
  it("goal weights below BMI 18.5 are rejected with an explanation", () => {
    const v = validateGoalWeight(55, 175);
    expect(v.ok).toBe(false);
    expect(v.minKg).toBeCloseTo(18.5 * 1.75 ** 2, 9);
    expect(v.message).toMatch(/18\.5/);
    expect(validateGoalWeight(60, 175).ok).toBe(true);
    expect(validateGoalWeight(null, 175).ok).toBe(true);
  });
  it("calorie floor = max(BMR, 1,200 female / 1,500 male); caps and explains", () => {
    expect(calorieFloor({ bmr: 1100, sex: "female" })).toBe(1200);
    expect(calorieFloor({ bmr: 1600, sex: "male" })).toBe(1600);
    const c = applyCalorieFloor({ targetKcal: 1300, bmr: 1400, sex: "male" });
    expect(c.capped).toBe(true);
    expect(c.targetKcal).toBe(1500);
    expect(c.message).toMatch(/1,500/);
    const f = applyCalorieFloor({ targetKcal: 1100, bmr: 1250, sex: "female" });
    expect(f.targetKcal).toBe(1250);
    expect(applyCalorieFloor({ targetKcal: 2000, bmr: 1400, sex: "male" }).capped).toBe(false);
  });
  it("rapid loss warning after 2 consecutive weekly updates > 1.5%/week", () => {
    expect(rapidLossWarning([1.6, 1.7])?.text).toBe(MSG.rapidLoss);
    expect(rapidLossWarning([1.7, 1.2])).toBeNull();
    expect(rapidLossWarning([1.6])).toBeNull();
    expect(rapidLossWarning([2.0, 1.4, 1.6])).toBeNull();
  });
  it("footer disclaimer text", () => {
    expect(MSG.disclaimer).toBe("Estimates only, not medical advice.");
  });
});

describe("neutral wording", () => {
  it("no shame language in any user-facing source", () => {
    expect(hasAvoidedWording("A bad day")).toBe(true);
    const files = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (/\.(jsx?|html)$/.test(f) && f !== "guardrails.js") files.push(p);
      }
    };
    walk(path.resolve(__dirname, "../src"));
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8").toLowerCase();
      for (const w of AVOID_WORDS) expect(text.includes(w), `${f} contains "${w}"`).toBe(false);
    }
  });
});
