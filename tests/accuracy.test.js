// Accuracy tests of the RAW estimators on simulated data (section 11 A–H).
// Every scenario is deterministic (seeded). Measured rates are printed so the
// numbers can be reported, and asserted against the spec thresholds.
import { describe, it, expect } from "vitest";
import { simulate } from "./sim.js";
import { estimateTDEE } from "../src/lib/kalman.js";
import { flagOutliers, emaTrend, regressionCrossCheck, trendAt } from "../src/lib/trend.js";
import { energyPerKgSchedule } from "../src/lib/energy.js";
import { addDays } from "../src/lib/dates.js";

const START = "2026-01-01";
const RUNS = 1000;
const seedOf = (s) => s * 7919 + 17;
// TUNING_MODE=max runs the suite with the maximum-likelihood cell only (for reporting).
const TUNING_MODE = process.env.TUNING_MODE || "average";
const report = (name, value) => console.log(`[accuracy:${TUNING_MODE}] ${name}: ${value}`);

/** Clean weigh-ins exactly like the app: rolling-median outlier flagging. */
function clean(weights) {
  const daily = weights.map((w, i) => ({ date: addDays(START, i), weight: w }));
  const { points } = flagOutliers(daily);
  return { points, obs: points.map((p) => (p.outlier ? null : p.weight)), flagged: points.filter((p) => p.outlier).map((p) => daysIdx(p.date)) };
}
const daysIdx = (d) => Math.round((Date.parse(d) - Date.parse(START)) / 86400000);

/** Run the estimator on a simulation up to (and including) day index `end`. */
function estimate(sim, { alreadyStable = false, rho = 7700, end = sim.days - 1, cleanData = false } = {}) {
  let obs = sim.weights.slice(0, end + 1);
  let flagged = [];
  if (cleanData) ({ obs, flagged } = clean(obs));
  const k = obs.findIndex((v) => v != null); // filter starts at the first usable weigh-in
  const est = estimateTDEE({
    obs: obs.slice(k),
    intake: sim.intakeLogged.slice(k, end + 1),
    rho: Array.isArray(rho) ? rho.slice(k, end + 1) : rho,
    T0: sim.T0,
    sigmaF: sim.sigmaF,
    alreadyStable,
  }, { tuningMode: TUNING_MODE });
  return { est, flagged, offset: k };
}

describe("A — constant TDEE 2,800, intake 2,300 ± 150, 42 days", () => {
  it("|error| ≤ 275 at day 42 in ≥ 95% of 1,000 runs", () => {
    let ok = 0;
    for (let s = 1; s <= RUNS; s++) {
      const sim = simulate({ seed: seedOf(s) });
      const { est } = estimate(sim);
      if (Math.abs(est.summary.tdee - 2800) <= 275) ok++;
    }
    report("A within ±275", ok / RUNS);
    expect(ok / RUNS).toBeGreaterThanOrEqual(0.95);
  });
});

describe("B — water SD 0.8, φ 0.7", () => {
  it("95% interval contains the true TDEE at day 42 in ≥ 90% of runs", () => {
    let ok = 0;
    for (let s = 1; s <= RUNS; s++) {
      const sim = simulate({ seed: seedOf(s), waterSD: 0.8, phi: 0.7 });
      const { est } = estimate(sim);
      if (est.summary.lo <= 2800 && 2800 <= est.summary.hi) ok++;
    }
    report("B coverage", ok / RUNS);
    expect(ok / RUNS).toBeGreaterThanOrEqual(0.9);
  });
});

describe("C — 20% unlogged days + 2 typo weigh-ins (+5 kg)", () => {
  it("typos flagged; |error| ≤ 350 in ≥ 95% of runs", () => {
    let ok = 0, allFlagged = 0, falsePos = 0;
    for (let s = 1; s <= RUNS; s++) {
      const sim = simulate({ seed: seedOf(s), unloggedFrac: 0.2, typos: 2 });
      const { est, flagged, offset } = estimate(sim, { cleanData: true });
      const kalmanFlag = est.kalmanOutliers.map((t) => t + offset);
      const all = new Set([...flagged, ...kalmanFlag]);
      if (sim.typoDays.every((d) => all.has(d))) allFlagged++;
      falsePos += [...all].filter((d) => !sim.typoDays.includes(d)).length;
      if (Math.abs(est.summary.tdee - 2800) <= 350) ok++;
    }
    report("C within ±350", ok / RUNS);
    report("C runs with both typos flagged", allFlagged / RUNS);
    report("C false-positive flags per run", falsePos / RUNS);
    expect(allFlagged / RUNS).toBeGreaterThanOrEqual(0.99);
    expect(ok / RUNS).toBeGreaterThanOrEqual(0.95);
  });
});

describe("D / D2 — glycogen", () => {
  it("D: 1.5 kg drop over days 1–5, answer 'no': |error| ≤ 275 in ≥ 95%", () => {
    let ok = 0;
    for (let s = 1; s <= RUNS; s++) {
      const sim = simulate({ seed: seedOf(s), glycogenDrop: 1.5 });
      const { est } = estimate(sim, { alreadyStable: false });
      if (Math.abs(est.summary.tdee - 2800) <= 275) ok++;
    }
    report("D within ±275", ok / RUNS);
    expect(ok / RUNS).toBeGreaterThanOrEqual(0.95);
  });

  it("D2: already dieting, answer 'yes': ≤ 275 in ≥ 95%, and day-21 data share ≥ D's", () => {
    let ok = 0, shareWorse = 0;
    for (let s = 1; s <= RUNS; s++) {
      const sim2 = simulate({ seed: seedOf(s) });
      const { est } = estimate(sim2, { alreadyStable: true });
      if (Math.abs(est.summary.tdee - 2800) <= 275) ok++;
      const simD = simulate({ seed: seedOf(s), glycogenDrop: 1.5 });
      const d21D = estimate(simD, { alreadyStable: false, end: 20 }).est.summary.dataShare;
      const d21D2 = estimate(sim2, { alreadyStable: true, end: 20 }).est.summary.dataShare;
      if (d21D2 < d21D) shareWorse++;
    }
    report("D2 within ±275", ok / RUNS);
    report("D2 runs where day-21 data share < D's", shareWorse);
    expect(ok / RUNS).toBeGreaterThanOrEqual(0.95);
    expect(shareWorse).toBe(0);
  });
});

describe("E — data share", () => {
  // The spec gives no per-run rate for E, so it is asserted on the median run;
  // the share of individual runs meeting each bound is printed for reporting.
  it("< 0.3 at day 7 and ≥ 0.7 at day 42 (scenario A, median run)", () => {
    const N = 500;
    const d7 = [], d42 = [];
    for (let s = 1; s <= N; s++) {
      const sim = simulate({ seed: seedOf(s) });
      d7.push(estimate(sim, { end: 6 }).est.summary.dataShare);
      d42.push(estimate(sim).est.summary.dataShare);
    }
    const med = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
    report("E median share at day 7", med(d7).toFixed(3));
    report("E median share at day 42", med(d42).toFixed(3));
    report("E runs with share < 0.3 at day 7", d7.filter((x) => x < 0.3).length / N);
    report("E runs with share ≥ 0.7 at day 42", d42.filter((x) => x >= 0.7).length / N);
    expect(med(d7)).toBeLessThan(0.3);
    expect(med(d42)).toBeGreaterThanOrEqual(0.7);
  });
});

describe("F — lean user: Hall/Forbes energy per kg matters", () => {
  it("mean error days 60–90 < 100 with 4a; > 150 with fixed 7,700", () => {
    const N = 200;
    let mae4a = 0, bias7700 = 0;
    for (let s = 1; s <= N; s++) {
      const sim = simulate({ seed: seedOf(s), days: 90, w0: 75, fm0: 10, tdee: 2500, intakeMean: 2000, rho: "hall" });
      // correct BF% readings weekly (as DEXA), from the true tissue composition
      const readings = [];
      for (let t = 0; t < 90; t += 7) readings.push({ date: addDays(START, t), bf: (100 * sim.fatMass[t]) / sim.tissue[t], source: "dexa" });
      const dates = Array.from({ length: 90 }, (_, i) => addDays(START, i));
      const trend = emaTrend(sim.weights.map((w, i) => ({ date: dates[i], weight: w })));
      const { rho } = energyPerKgSchedule({ dates, readings, trendAtDate: (d) => trendAt(trend, d), person: { heightCm: 180, age: 30, sex: "male" } });
      const a = estimate(sim, { rho }).est;
      const b = estimate(sim, { rho: 7700 }).est;
      let e4 = 0, e77 = 0;
      for (let t = 59; t <= 89; t++) {
        e4 += Math.abs(a.filteredT[t].m - 2500);
        e77 += b.filteredT[t].m - 2500;
      }
      mae4a += e4 / 31;
      bias7700 += Math.abs(e77 / 31);
    }
    report("F mean |error| days 60–90 with 4a", (mae4a / N).toFixed(1));
    report("F mean error days 60–90 with fixed 7700", (bias7700 / N).toFixed(1));
    expect(mae4a / N).toBeLessThan(100);
    expect(bias7700 / N).toBeGreaterThan(150);
  });
});

describe("G — TDEE drifting 2,800 → 2,650 over 90 days", () => {
  it("|error| ≤ 250 at day 90 in ≥ 95% of runs", () => {
    let ok = 0;
    for (let s = 1; s <= RUNS; s++) {
      const sim = simulate({ seed: seedOf(s), days: 90, tdee: (t) => 2800 - (150 * t) / 89 });
      const { est } = estimate(sim);
      if (Math.abs(est.summary.tdee - sim.trueTdee[89]) <= 250) ok++;
    }
    report("G within ±250", ok / RUNS);
    expect(ok / RUNS).toBeGreaterThanOrEqual(0.95);
  });
});

describe("H — regression cross-check agrees with Kalman", () => {
  it("within 1.96·sqrt(σk² + σr²) in ≥ 90% of scenario A runs", () => {
    let agree = 0;
    for (let s = 1; s <= RUNS; s++) {
      const sim = simulate({ seed: seedOf(s) });
      const { est } = estimate(sim);
      const end = addDays(START, 41);
      const points = sim.weights.map((w, i) => ({ date: addDays(START, i), weight: w }));
      const intakeByDate = new Map(sim.intakeLogged.map((v, i) => [addDays(START, i), v]).filter(([, v]) => v != null));
      const r = regressionCrossCheck({ points, intakeByDate, energyPerKg: 7700, endDate: end });
      const lim = 1.96 * Math.sqrt(est.summary.sd ** 2 + r.tdeeSD ** 2);
      if (Math.abs(est.summary.tdee - r.tdee) <= lim) agree++;
    }
    report("H agreement", agree / RUNS);
    expect(agree / RUNS).toBeGreaterThanOrEqual(0.9);
  });
});
