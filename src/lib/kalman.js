// Primary TDEE estimator: a 3-state Kalman filter with an RTS smoother.
//
// State x = [M, W, T]
//   M = tissue mass (kg), W = water deviation (kg, mean 0), T = TDEE (kcal/day)
// Transition t−1 → t (I = intake on day t−1, ρ = energyPerKg):
//   M_t = M_{t−1} + (I − T_{t−1}) / ρ        (+ intake noise σ_I/ρ, + glycogen noise)
//   W_t = φ·W_{t−1} + η_W,  η_W ~ N(0, σ_W²)
//   T_t = T_{t−1} + η_T,    η_T ~ N(0, 15²)
// Observation on weigh-in days: y = M + W + v, v ~ N(0, 0.2²)
//
// Matrices are 3×3, row-major arrays of 9 numbers; math is written out by hand.

export const DEFAULTS = {
  phi: 0.6,
  waterSD: 0.6, // marginal SD of W (kg); σ_W = waterSD·sqrt(1 − φ²)
  sigmaT: 15, // kcal/day random walk of TDEE
  scaleSD: 0.2, // kg, scale precision
  initMVar: 0.6 ** 2,
  // initWVar: defaults to waterSD² (the marginal water variance) unless passed
  glycogenSD: 0.5, // kg/day extra process noise on M
  glycogenDays: 7,
  waterTagFactor: 2,
  outlierSigmas: 4,
  completeMinSigma: 50,
  completeSigmaFrac: 0.1,
  unloggedMinSigma: 300,
  imputeWindow: 14,
};

export const TUNE_PHI = [0.3, 0.5, 0.7, 0.85];
export const TUNE_WATER_SD = [0.3, 0.45, 0.6, 0.8, 1.0];
export const TUNE_MIN_DAYS = 42;
export const TUNE_MIN_WEIGHINS = 30;
export const TUNE_EVERY_DAYS = 30;
export const SHIFT_KCAL = 400;
export const SHIFT_MIN_DAYS = 3;

// ---------- 3×3 matrix helpers ----------
export const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(A, B) {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
  }
  return C;
}

export function transpose(A) {
  return [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
}

export const add = (A, B) => A.map((v, i) => v + B[i]);
export const sub = (A, B) => A.map((v, i) => v - B[i]);

export function mulVec(A, x) {
  return [
    A[0] * x[0] + A[1] * x[1] + A[2] * x[2],
    A[3] * x[0] + A[4] * x[1] + A[5] * x[2],
    A[6] * x[0] + A[7] * x[1] + A[8] * x[2],
  ];
}

export function det(A) {
  return (
    A[0] * (A[4] * A[8] - A[5] * A[7]) -
    A[1] * (A[3] * A[8] - A[5] * A[6]) +
    A[2] * (A[3] * A[7] - A[4] * A[6])
  );
}

export function inv(A) {
  const d = det(A);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-300) throw new Error("singular matrix");
  const c = [
    A[4] * A[8] - A[5] * A[7], -(A[1] * A[8] - A[2] * A[7]), A[1] * A[5] - A[2] * A[4],
    -(A[3] * A[8] - A[5] * A[6]), A[0] * A[8] - A[2] * A[6], -(A[0] * A[5] - A[2] * A[3]),
    A[3] * A[7] - A[4] * A[6], -(A[0] * A[7] - A[1] * A[6]), A[0] * A[4] - A[1] * A[3],
  ];
  return c.map((v) => v / d);
}

/** Force symmetry and non-negative variances (numerical hygiene). */
export function symmetrize(P) {
  const S = [...P];
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const v = (P[i * 3 + j] + P[j * 3 + i]) / 2;
      S[i * 3 + j] = v;
      S[j * 3 + i] = v;
    }
    if (!(S[i * 4] > 1e-12)) S[i * 4] = 1e-12;
  }
  return S;
}

/** Positive-definite check via leading principal minors (Sylvester). */
export function isPositiveDefinite(P) {
  const m1 = P[0];
  const m2 = P[0] * P[4] - P[1] * P[3];
  return m1 > 0 && m2 > 0 && det(P) > 0;
}

// ---------- input preparation ----------

/**
 * Intake used for the transition out of day `t`: the logged kcal on a
 * complete day, otherwise the mean of complete days in the last 14 days.
 * With no complete days in that window intake is assumed to track TDEE
 * (the M–T coupling is removed so weight change says nothing about T).
 */
export function imputeIntake(intake, t, cfg = DEFAULTS) {
  const v = intake[t];
  if (v != null) {
    return { I: v, sigma: Math.max(cfg.completeMinSigma, cfg.completeSigmaFrac * v), coupled: true, imputed: false };
  }
  const xs = [];
  for (let j = Math.max(0, t - cfg.imputeWindow + 1); j <= t; j++) if (intake[j] != null) xs.push(intake[j]);
  if (!xs.length) return { I: null, sigma: cfg.unloggedMinSigma, coupled: false, imputed: true };
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const s = xs.length > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)) : 0;
  return { I: m, sigma: Math.max(cfg.unloggedMinSigma, s), coupled: true, imputed: true };
}

/**
 * Days where the 7-day mean intake differs from the previous 7-day mean by
 * > 400 kcal. Compares complete days in [t, t+6] with [t−7, t−1] (each needs
 * ≥ 3 complete days); a contiguous run of such days yields one shift, at the
 * day with the largest difference.
 */
export function detectIntakeShifts(intake, { threshold = SHIFT_KCAL, minDays = SHIFT_MIN_DAYS } = {}) {
  const n = intake.length;
  const meanOf = (a, b) => {
    const xs = [];
    for (let j = Math.max(0, a); j <= Math.min(n - 1, b); j++) if (intake[j] != null) xs.push(intake[j]);
    return xs.length >= minDays ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  };
  const shifts = [];
  let run = null;
  for (let t = 7; t < n; t++) {
    const prev = meanOf(t - 7, t - 1);
    const next = meanOf(t, t + 6);
    const diff = prev != null && next != null ? next - prev : null;
    if (diff != null && Math.abs(diff) > threshold) {
      if (!run || Math.abs(diff) > Math.abs(run.diff)) run = { day: t, diff };
    } else if (run) {
      shifts.push(run);
      run = null;
    }
  }
  if (run) shifts.push(run);
  return shifts;
}

/**
 * Mask of transitions (into day t) that receive glycogen/water process noise:
 * days 1–7 unless the user was already eating at this intake for 2+ weeks,
 * and the 7 days after every detected intake shift regardless of that answer.
 */
export function glycogenMask(n, { alreadyStable = false, shifts = [], days = DEFAULTS.glycogenDays } = {}) {
  const mask = new Array(n).fill(false);
  const reasons = [];
  if (!alreadyStable) {
    for (let t = 1; t <= days && t < n; t++) mask[t] = true;
    reasons.push({ day: 0, reason: "start" });
  }
  for (const s of shifts) {
    for (let t = s.day + 1; t <= s.day + days && t < n; t++) mask[t] = true;
    reasons.push({ day: s.day, reason: "intake-shift", diff: s.diff });
  }
  return { mask, reasons };
}

/** Water-event tags widen σ_W on the tagged day and the 2 following days. */
export function waterBoostMask(tagged) {
  const n = tagged.length;
  const mask = new Array(n).fill(false);
  for (let t = 0; t < n; t++) if (tagged[t] || (t >= 1 && tagged[t - 1]) || (t >= 2 && tagged[t - 2])) mask[t] = true;
  return mask;
}

// ---------- filter ----------

/**
 * Run the filter over n days.
 * inputs: {
 *   obs: (kg|null)[]         weigh-ins (rolling-median outliers already removed)
 *   intake: (kcal|null)[]    complete-day intake, null = unknown
 *   rho: number | number[]   energy per kg (per day allowed)
 *   T0, sigmaF               formula prior
 *   glycogen: bool[]         extra M noise on transition into day t
 *   waterBoost: bool[]       σ_W × 2 on transition into day t
 * }
 */
export function runKalman(inputs, params = {}) {
  const cfg = { ...DEFAULTS, ...params };
  const { obs, intake, T0, sigmaF } = inputs;
  const n = obs.length;
  const rhoAt = (t) => (Array.isArray(inputs.rho) ? inputs.rho[t] : inputs.rho);
  const glycogen = inputs.glycogen || [];
  const waterBoost = inputs.waterBoost || [];
  const sigmaWBase = cfg.waterSD * Math.sqrt(1 - cfg.phi * cfg.phi);
  const R = cfg.scaleSD ** 2;

  const M0 = obs[0];
  if (M0 == null) throw new Error("first day must have a weigh-in");
  let x = [M0, 0, T0];
  const initWVar = cfg.initWVar != null ? cfg.initWVar : cfg.waterSD ** 2;
  let P = [cfg.initMVar, 0, 0, 0, initWVar, 0, 0, 0, sigmaF * sigmaF];

  const xs = [x], Ps = [P], xPred = [null], PPred = [null], Fs = [null];
  const innovations = [];
  const intakeUsed = [null];
  let loglik = 0;
  let nObs = 0;

  for (let t = 1; t < n; t++) {
    const rho = rhoAt(t - 1);
    const it = imputeIntake(intake, t - 1, cfg);
    const c = it.coupled ? 1 : 0;
    const F = [1, 0, -c / rho, 0, cfg.phi, 0, 0, 0, 1];
    const u = [c ? it.I / rho : 0, 0, 0];
    const sigmaW = sigmaWBase * (waterBoost[t] ? cfg.waterTagFactor : 1);
    const qM = (it.sigma / rho) ** 2 + (glycogen[t] ? cfg.glycogenSD ** 2 : 0);
    const Q = [qM, 0, 0, 0, sigmaW * sigmaW, 0, 0, 0, cfg.sigmaT ** 2];

    const xp = add(mulVec(F, x), u);
    const Pp = symmetrize(add(mul(mul(F, P), transpose(F)), Q));
    xPred.push(xp);
    PPred.push(Pp);
    Fs.push(F);
    intakeUsed.push({ ...it, rho, glycogen: !!glycogen[t], waterBoost: !!waterBoost[t] });

    x = xp;
    P = Pp;
    const y = obs[t];
    if (y != null) {
      const nu = y - (x[0] + x[1]);
      const S = P[0] + P[1] + P[3] + P[4] + R;
      const outlier = Math.abs(nu) > cfg.outlierSigmas * Math.sqrt(S);
      innovations.push({ t, nu, S, outlier });
      if (!outlier) {
        const K = [(P[0] + P[1]) / S, (P[3] + P[4]) / S, (P[6] + P[7]) / S];
        x = [x[0] + K[0] * nu, x[1] + K[1] * nu, x[2] + K[2] * nu];
        // Joseph form: P = (I − KH) P (I − KH)ᵀ + K R Kᵀ, H = [1, 1, 0]
        const A = [1 - K[0], -K[0], 0, -K[1], 1 - K[1], 0, -K[2], -K[2], 1];
        const KRK = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) KRK.push(K[i] * R * K[j]);
        P = symmetrize(add(mul(mul(A, P), transpose(A)), KRK));
        loglik += -0.5 * (Math.log(2 * Math.PI * S) + (nu * nu) / S);
        nObs += 1;
      }
    }
    xs.push(x);
    Ps.push(P);
  }
  return { n, x: xs, P: Ps, xPred, PPred, F: Fs, innovations, intakeUsed, loglik, nObs, params: cfg, sigmaF, T0 };
}

/** Rauch–Tung–Striebel smoother (display only). Also returns smoother gains. */
export function rtsSmooth(run) {
  const { n, x, P, xPred, PPred, F } = run;
  const xs = new Array(n), Ps = new Array(n), C = new Array(n).fill(null);
  xs[n - 1] = x[n - 1];
  Ps[n - 1] = P[n - 1];
  for (let t = n - 2; t >= 0; t--) {
    const G = mul(mul(P[t], transpose(F[t + 1])), inv(PPred[t + 1]));
    C[t] = G;
    const dx = [xs[t + 1][0] - xPred[t + 1][0], xs[t + 1][1] - xPred[t + 1][1], xs[t + 1][2] - xPred[t + 1][2]];
    xs[t] = add(x[t], mulVec(G, dx));
    Ps[t] = symmetrize(add(P[t], mul(mul(G, sub(Ps[t + 1], PPred[t + 1])), transpose(G))));
  }
  return { x: xs, P: Ps, C };
}

/**
 * Tissue-mass change rate (kg/day) over the last `window` days ending at
 * `end`, from the smoothed M, with a 95% interval. Uses the smoothed
 * lag-covariance Cov(x_a, x_end) = C_a·C_{a+1}···C_{end−1}·P^s_end.
 */
export function tissueRate(smooth, end, window = 14) {
  const a = Math.max(0, end - window);
  const w = end - a;
  if (w < 1) return null;
  let G = I3();
  for (let t = a; t < end; t++) G = mul(G, smooth.C[t]);
  const cross = mul(G, smooth.P[end]);
  const v = smooth.P[a][0] + smooth.P[end][0] - 2 * cross[0];
  const rate = (smooth.x[end][0] - smooth.x[a][0]) / w;
  const sdRate = Math.sqrt(Math.max(v, 0)) / w;
  return { rate, sd: sdRate, lo: rate - 1.96 * sdRate, hi: rate + 1.96 * sdRate, days: w };
}

/** First index at which per-user tuning is allowed, then every 30 days. */
export function tuningAnchor(obs) {
  let count = 0, first = null;
  for (let t = 0; t < obs.length; t++) {
    if (obs[t] != null) count += 1;
    if (t >= TUNE_MIN_DAYS - 1 && count >= TUNE_MIN_WEIGHINS) {
      first = t;
      break;
    }
  }
  if (first == null) return null;
  return first + Math.floor((obs.length - 1 - first) / TUNE_EVERY_DAYS) * TUNE_EVERY_DAYS;
}

const sliceInputs = (inputs, end) => ({
  ...inputs,
  obs: inputs.obs.slice(0, end + 1),
  intake: inputs.intake.slice(0, end + 1),
  rho: Array.isArray(inputs.rho) ? inputs.rho.slice(0, end + 1) : inputs.rho,
  glycogen: inputs.glycogen ? inputs.glycogen.slice(0, end + 1) : undefined,
  waterBoost: inputs.waterBoost ? inputs.waterBoost.slice(0, end + 1) : undefined,
});

/**
 * Grid-search φ and marginal water SD by the innovation log-likelihood of the
 * data up to the latest tuning anchor. Returns every grid cell with its
 * log-likelihood, the maximum-likelihood cell, and normalised likelihood
 * weights (posterior under a uniform prior over the grid).
 */
export function tuneWaterParams(inputs, params = {}) {
  const anchor = tuningAnchor(inputs.obs);
  if (anchor == null) return null;
  const sliced = sliceInputs(inputs, anchor);
  const grid = [];
  for (const phi of TUNE_PHI) {
    for (const waterSD of TUNE_WATER_SD) {
      grid.push({ phi, waterSD, loglik: runKalman(sliced, { ...params, phi, waterSD }).loglik });
    }
  }
  const best = grid.reduce((a, b) => (b.loglik > a.loglik ? b : a));
  const ws = grid.map((g) => Math.exp(g.loglik - best.loglik));
  const W = ws.reduce((a, b) => a + b, 0);
  grid.forEach((g, i) => (g.weight = ws[i] / W));
  const meanPhi = grid.reduce((a, g) => a + g.weight * g.phi, 0);
  const meanWaterSD = grid.reduce((a, g) => a + g.weight * g.waterSD, 0);
  return { phi: best.phi, waterSD: best.waterSD, loglik: best.loglik, meanPhi, meanWaterSD, anchor, grid };
}

export const Z95 = 1.96;

/** Headline numbers from a filter run at index `t` (default: last day). */
export function summarize(run, t = run.n - 1) {
  return summaryFrom(run.x[t][2], Math.max(run.P[t][8], 0), run.sigmaF);
}

function summaryFrom(T, varT, sigmaF) {
  const sd = Math.sqrt(varT);
  const dataShare = Math.min(1, Math.max(0, 1 - varT / (sigmaF * sigmaF)));
  return { tdee: T, sd, half95: Z95 * sd, lo: T - Z95 * sd, hi: T + Z95 * sd, dataShare, label: dataShare >= 0.5 ? "Measured" : "Estimated" };
}

/** Mixture mean/variance of per-component (mean, variance) pairs. */
function mixture(comps) {
  const m = comps.reduce((a, c) => a + c.w * c.m, 0);
  const v = comps.reduce((a, c) => a + c.w * (c.v + c.m * c.m), 0) - m * m;
  return { m, v: Math.max(v, 0) };
}

/**
 * Full raw estimator: builds the glycogen and water-tag masks, tunes the water
 * parameters when enough data exists, runs the filter and the smoother.
 *
 * inputs: {obs, intake, rho, T0, sigmaF, alreadyStable, tagged?, noTuning?}
 * params.tuningMode:
 *   "average" (default) — every grid cell is run and the results are combined
 *      with their likelihood weights, so uncertainty about φ / water SD is
 *      carried into the TDEE interval;
 *   "max" — use only the maximum-likelihood cell.
 */
export function estimateTDEE(inputs, params = {}) {
  const { tuningMode = "average", ...kfParams } = params;
  const n = inputs.obs.length;
  const shifts = detectIntakeShifts(inputs.intake);
  const gly = glycogenMask(n, { alreadyStable: !!inputs.alreadyStable, shifts });
  const waterBoost = inputs.tagged ? waterBoostMask(inputs.tagged) : undefined;
  const prepared = { ...inputs, glycogen: gly.mask, waterBoost };
  const tuning = inputs.noTuning ? null : tuneWaterParams(prepared, kfParams);

  let comps;
  if (!tuning) comps = [{ w: 1, params: kfParams }];
  else if (tuningMode === "max") comps = [{ w: 1, params: { ...kfParams, phi: tuning.phi, waterSD: tuning.waterSD } }];
  else comps = tuning.grid.filter((g) => g.weight > 1e-6).map((g) => ({ w: g.weight, params: { ...kfParams, phi: g.phi, waterSD: g.waterSD } }));
  const W = comps.reduce((a, c) => a + c.w, 0);
  comps.forEach((c) => (c.w /= W));

  for (const c of comps) {
    c.run = runKalman(prepared, c.params);
    c.smooth = n > 1 ? rtsSmooth(c.run) : { x: c.run.x, P: c.run.P, C: [null] };
    c.rate = n > 1 ? tissueRate(c.smooth, n - 1, 14) : null;
  }
  const top = comps.reduce((a, b) => (b.w > a.w ? b : a));
  const sigmaF = inputs.sigmaF;

  const last = mixture(comps.map((c) => ({ w: c.w, m: c.run.x[n - 1][2], v: c.run.P[n - 1][8] })));
  const summary = summaryFrom(last.m, last.v, sigmaF);

  // per-day series (filtered and smoothed TDEE), mixed over components
  const filteredT = [], smoothedT = [], smoothedM = [];
  for (let t = 0; t < n; t++) {
    const f = mixture(comps.map((c) => ({ w: c.w, m: c.run.x[t][2], v: c.run.P[t][8] })));
    const s = mixture(comps.map((c) => ({ w: c.w, m: c.smooth.x[t][2], v: c.smooth.P[t][8] })));
    const sm = mixture(comps.map((c) => ({ w: c.w, m: c.smooth.x[t][0], v: c.smooth.P[t][0] })));
    filteredT.push({ m: f.m, sd: Math.sqrt(f.v), dataShare: Math.min(1, Math.max(0, 1 - f.v / (sigmaF * sigmaF))) });
    smoothedT.push({ m: s.m, sd: Math.sqrt(s.v) });
    smoothedM.push({ m: sm.m, sd: Math.sqrt(sm.v) });
  }

  let rate14 = null;
  if (n > 1) {
    const r = mixture(comps.map((c) => ({ w: c.w, m: c.rate.rate, v: c.rate.sd ** 2 })));
    const sdR = Math.sqrt(r.v);
    rate14 = { rate: r.m, sd: sdR, lo: r.m - Z95 * sdR, hi: r.m + Z95 * sdR, days: top.rate.days };
  }

  return {
    run: top.run,
    smooth: top.smooth,
    summary,
    filteredT,
    smoothedT,
    smoothedM,
    rate14,
    tuning,
    tuningMode: tuning ? tuningMode : "defaults",
    components: comps.length,
    shifts,
    glycogen: gly,
    params: tuning
      ? tuningMode === "max"
        ? { phi: tuning.phi, waterSD: tuning.waterSD }
        : { phi: tuning.meanPhi, waterSD: tuning.meanWaterSD, mlPhi: tuning.phi, mlWaterSD: tuning.waterSD }
      : { phi: top.run.params.phi, waterSD: top.run.params.waterSD },
    innovations: top.run.innovations,
    kalmanOutliers: top.run.innovations.filter((i) => i.outlier).map((i) => i.t),
  };
}
