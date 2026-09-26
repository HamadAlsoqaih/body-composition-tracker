import { describe, it, expect } from "vitest";
import {
  runKalman, rtsSmooth, tissueRate, estimateTDEE, detectIntakeShifts, glycogenMask, waterBoostMask,
  imputeIntake, tuningAnchor, tuneWaterParams, isPositiveDefinite, mul, inv, I3, det, transpose, summarize,
} from "../src/lib/kalman.js";
import { simulate } from "./sim.js";

const base = (n, extra = {}) => ({
  obs: Array.from({ length: n }, (_, t) => 90 - 0.06 * t),
  intake: new Array(n).fill(2300),
  rho: 7700,
  T0: 2700,
  sigmaF: 324,
  ...extra,
});

describe("3×3 matrix math", () => {
  it("inverse, transpose, determinant", () => {
    const A = [4, 1, 2, 1, 3, 0.5, 2, 0.5, 5];
    const P = mul(A, inv(A));
    I3().forEach((v, i) => expect(P[i]).toBeCloseTo(v, 12));
    expect(transpose(transpose(A))).toEqual(A);
    expect(det(I3())).toBe(1);
    expect(() => inv([1, 2, 3, 2, 4, 6, 0, 0, 1])).toThrow();
  });
});

describe("covariance health", () => {
  it("stays symmetric positive-definite over 365 simulated days (gaps, tags, outliers)", () => {
    const sim = simulate({ seed: 99, days: 365, unloggedFrac: 0.3, typos: 3 });
    const obs = sim.weights.map((w, t) => (t % 5 === 3 ? null : w));
    const tagged = obs.map((_, t) => t % 40 === 0);
    const intake = sim.intakeLogged.map((v, t) => (t > 100 && t < 130 ? null : v)); // 30-day logging gap
    const est = estimateTDEE({ obs, intake, rho: 7700, T0: sim.T0, sigmaF: sim.sigmaF, tagged });
    for (const P of [...est.run.P, ...est.smooth.P]) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(P[i * 3 + j]).toBe(P[j * 3 + i]);
      expect(isPositiveDefinite(P)).toBe(true);
    }
  });
});

describe("intake handling", () => {
  it("complete day: σ_I = max(50, 10% of intake)", () => {
    expect(imputeIntake([2300], 0)).toMatchObject({ I: 2300, sigma: 230, coupled: true, imputed: false });
    expect(imputeIntake([300], 0).sigma).toBe(50);
  });
  it("unlogged day: mean of complete days in last 14, σ = max(300, SD)", () => {
    const intake = [2000, 2400, null];
    const r = imputeIntake(intake, 2);
    expect(r.I).toBe(2200);
    expect(r.sigma).toBe(300);
    const wide = [1000, 3000, null];
    expect(imputeIntake(wide, 2).sigma).toBeCloseTo(Math.sqrt(2e6), 6);
    const old = [1000, ...new Array(14).fill(null)];
    expect(imputeIntake(old, 14)).toMatchObject({ coupled: false, sigma: 300 }); // none in window
  });
  it("unlogged days propagate (never skipped) and increase uncertainty", () => {
    const n = 30;
    const logged = runKalman(base(n));
    const gap = runKalman(base(n, { intake: base(n).intake.map((v, t) => (t >= 10 && t < 20 ? null : v)) }));
    expect(gap.x).toHaveLength(n);
    expect(gap.intakeUsed[15].imputed).toBe(true);
    expect(gap.intakeUsed[15].I).toBe(2300);
    expect(gap.PPred[15][0]).toBeGreaterThan(logged.PPred[15][0]);
  });
  it("with no intake at all, weight change does not move T", () => {
    const n = 30;
    const r = runKalman(base(n, { intake: new Array(n).fill(null) }));
    expect(r.x[n - 1][2]).toBeCloseTo(2700, 6);
  });
});

describe("water tags and glycogen", () => {
  it("water tags double σ_W on the tagged day and 2 following days", () => {
    const tagged = [false, false, true, false, false, false];
    expect(waterBoostMask(tagged)).toEqual([false, false, true, true, true, false]);
    const n = 6;
    const plain = runKalman(base(n));
    const boosted = runKalman(base(n, { waterBoost: waterBoostMask(tagged) }));
    // predicted W variance grows by the extra (4 − 1)·σ_W² on the tagged day
    const sw2 = 0.6 ** 2 * (1 - 0.6 ** 2);
    const diff = boosted.PPred[2][4] - plain.PPred[2][4];
    expect(diff).toBeCloseTo(3 * sw2, 6);
    expect(boosted.PPred[5][4]).toBeLessThan(boosted.PPred[4][4] + 1e-9);
  });

  it("day-1 glycogen noise only when the onboarding answer is 'no'", () => {
    const no = glycogenMask(20, { alreadyStable: false });
    const yes = glycogenMask(20, { alreadyStable: true });
    expect(no.mask.slice(0, 9)).toEqual([false, true, true, true, true, true, true, true, false]);
    expect(yes.mask.every((m) => !m)).toBe(true);
    const rNo = runKalman(base(20, { glycogen: no.mask }));
    const rYes = runKalman(base(20, { glycogen: yes.mask }));
    expect(rNo.PPred[3][0] - rYes.PPred[3][0]).toBeGreaterThan(0.2);
  });

  it("later intake shifts (> 400 kcal) always trigger it, regardless of the answer", () => {
    const intake = [...new Array(20).fill(2500), ...new Array(20).fill(1900)];
    const shifts = detectIntakeShifts(intake);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].day).toBe(20);
    for (const alreadyStable of [true, false]) {
      const g = glycogenMask(40, { alreadyStable, shifts });
      for (let t = 21; t <= 27; t++) expect(g.mask[t]).toBe(true);
      expect(g.mask[28]).toBe(false);
    }
    const est = estimateTDEE({ ...base(40), intake, alreadyStable: true });
    expect(est.glycogen.reasons.map((r) => r.reason)).toEqual(["intake-shift"]);
  });

  it("no shift for normal day-to-day variation (≤ 400)", () => {
    const intake = Array.from({ length: 40 }, (_, t) => (t < 20 ? 2300 : 2600));
    expect(detectIntakeShifts(intake)).toHaveLength(0);
    expect(detectIntakeShifts(new Array(40).fill(null))).toHaveLength(0);
  });
});

describe("observation handling", () => {
  it("rejects an observation with |innovation| > 4·sqrt(S)", () => {
    const b = base(30);
    b.obs[20] += 8;
    const r = runKalman(b);
    const inn = r.innovations.find((i) => i.t === 20);
    expect(inn.outlier).toBe(true);
    expect(Math.abs(r.x[20][0] - r.x[19][0])).toBeLessThan(0.2);
  });
  it("no update on days without a weigh-in", () => {
    const b = base(10);
    b.obs[5] = null;
    const r = runKalman(b);
    expect(r.x[5]).toEqual(r.xPred[5]);
    expect(r.innovations.some((i) => i.t === 5)).toBe(false);
  });
  it("initial water variance follows the water SD (e.g. tuned) unless initWVar is given", () => {
    expect(runKalman(base(3), { waterSD: 1.0 }).P[0][4]).toBe(1.0);
    expect(runKalman(base(3), { waterSD: 0.3 }).P[0][4]).toBeCloseTo(0.09, 12);
    expect(runKalman(base(3), { waterSD: 1.0, initWVar: 0.25 }).P[0][4]).toBe(0.25);
  });

  it("initialises M from the first weight, W = 0, T = formula, with spec variances", () => {
    const r = runKalman(base(3));
    expect(r.x[0]).toEqual([90, 0, 2700]);
    expect(r.P[0][0]).toBeCloseTo(0.36, 12);
    expect(r.P[0][4]).toBeCloseTo(0.36, 12);
    expect(r.P[0][8]).toBeCloseTo(324 ** 2, 6);
  });
});

describe("smoother and outputs", () => {
  it("RTS: last smoothed = filtered; smoothed variance ≤ filtered", () => {
    const sim = simulate({ seed: 5, days: 60 });
    const r = runKalman({ obs: sim.weights, intake: sim.intakeLogged, rho: 7700, T0: sim.T0, sigmaF: sim.sigmaF });
    const s = rtsSmooth(r);
    expect(s.x[59]).toEqual(r.x[59]);
    for (let t = 0; t < 60; t++) expect(s.P[t][8]).toBeLessThanOrEqual(r.P[t][8] + 1e-9);
  });
  it("tissue rate recovers the true rate on clean data", () => {
    const n = 60;
    const b = base(n, { obs: Array.from({ length: n }, (_, t) => 90 - (500 / 7700) * t), T0: 2800 });
    const r = runKalman(b);
    const tr = tissueRate(rtsSmooth(r), n - 1, 14);
    expect(tr.rate).toBeCloseTo(-500 / 7700, 2);
    expect(tr.lo).toBeLessThan(tr.rate);
    expect(tr.hi).toBeGreaterThan(tr.rate);
  });
  it("summary: ± is 1.96·SD, data share and label", () => {
    const r = runKalman(base(42));
    const s = summarize(r);
    expect(s.half95).toBeCloseTo(1.96 * Math.sqrt(r.P[41][8]), 9);
    expect(s.dataShare).toBeCloseTo(1 - r.P[41][8] / 324 ** 2, 9);
    expect(s.label).toBe(s.dataShare >= 0.5 ? "Measured" : "Estimated");
  });
});

describe("per-user tuning", () => {
  it("anchors after ≥ 42 days with ≥ 30 weigh-ins, then every 30 days", () => {
    expect(tuningAnchor(new Array(41).fill(80))).toBeNull();
    expect(tuningAnchor(new Array(42).fill(80))).toBe(41);
    expect(tuningAnchor(new Array(71).fill(80))).toBe(41);
    expect(tuningAnchor(new Array(72).fill(80))).toBe(71);
    const sparse = Array.from({ length: 60 }, (_, t) => (t % 2 ? null : 80)); // 30 weigh-ins by day 59
    expect(tuningAnchor(sparse)).toBe(58);
  });
  it("grid-searches the spec grid and prefers the true water noise", () => {
    const sim = simulate({ seed: 11, days: 120, phi: 0.85, waterSD: 1.0 });
    const t = tuneWaterParams({ obs: sim.weights, intake: sim.intakeLogged, rho: 7700, T0: sim.T0, sigmaF: sim.sigmaF });
    expect(t.grid).toHaveLength(20);
    expect(t.grid.reduce((a, g) => a + g.weight, 0)).toBeCloseTo(1, 9);
    expect(t.waterSD).toBeGreaterThanOrEqual(0.8);
  });
});
