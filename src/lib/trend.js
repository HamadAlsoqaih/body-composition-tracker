// Weight data cleaning, display trend and the regression cross-check.
import { daysBetween, lastNDays } from "./dates.js";

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * One weight per calendar day. If several weigh-ins share a date: the earliest
 * by timestamp when every entry has one; otherwise (legacy entries without a
 * time) the mean.
 */
export function dailyWeights(entries) {
  const groups = new Map();
  for (const e of entries || []) {
    if (!e || typeof e.date !== "string" || !Number.isFinite(e.weight)) continue;
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }
  const out = [];
  for (const [date, g] of groups) {
    let weight, method;
    if (g.length === 1) {
      weight = g[0].weight;
      method = "single";
    } else if (g.every((e) => typeof e.time === "string" && !Number.isNaN(Date.parse(e.time)))) {
      const first = [...g].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))[0];
      weight = first.weight;
      method = "earliest";
    } else {
      weight = mean(g.map((e) => e.weight));
      method = "mean";
    }
    out.push({ date, weight, n: g.length, method, ids: g.map((e) => e.id) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const OUTLIER_MIN_KG = 1.5;
export const OUTLIER_MAD_K = 3.5;
export const MAD_TO_SD = 1.4826;

/**
 * Flag daily weights that deviate from the centred 7-day rolling median by
 * more than max(1.5 kg, 3.5 × 1.4826 × MAD), where MAD is the median absolute
 * deviation of all those deviations. A point needs at least 3 weigh-ins in its
 * ±3-day window to be judged. `includeDates` lets the user un-ignore a day.
 */
export function flagOutliers(daily, includeDates = []) {
  const keep = new Set(includeDates);
  const devs = daily.map((p) => {
    const win = daily.filter((q) => Math.abs(daysBetween(p.date, q.date)) <= 3).map((q) => q.weight);
    if (win.length < 3) return { rollingMedian: null, dev: null };
    const rm = median(win);
    return { rollingMedian: rm, dev: p.weight - rm };
  });
  const ds = devs.filter((d) => d.dev != null).map((d) => d.dev);
  const md = median(ds);
  const mad = ds.length ? median(ds.map((d) => Math.abs(d - md))) : null;
  const threshold = Math.max(OUTLIER_MIN_KG, mad == null ? 0 : OUTLIER_MAD_K * MAD_TO_SD * mad);
  const points = daily.map((p, i) => {
    const { rollingMedian, dev } = devs[i];
    const flagged = dev != null && Math.abs(dev) > threshold;
    return { ...p, rollingMedian, dev, flagged, overridden: flagged && keep.has(p.date), outlier: flagged && !keep.has(p.date) };
  });
  return { points, threshold, mad };
}

export const EMA_ALPHA = 0.1;

/** Display trend: EMA with alpha 0.1/day; a gap of d days uses 1 − 0.9^d. */
export function emaTrend(points) {
  const out = [];
  let t = null, prev = null;
  for (const p of points) {
    if (t == null) t = p.weight;
    else {
      const d = Math.max(1, daysBetween(prev, p.date));
      const a = 1 - Math.pow(1 - EMA_ALPHA, d);
      t = t + a * (p.weight - t);
    }
    prev = p.date;
    out.push({ date: p.date, trend: t });
  }
  return out;
}

/** Trend value on or before `date` (null if none). */
export function trendAt(trend, date) {
  let v = null;
  for (const p of trend) {
    if (p.date > date) break;
    v = p.trend;
  }
  return v;
}

export const REGRESSION_WINDOW = 28;
export const REGRESSION_MIN_WEIGHINS = 7;
export const REGRESSION_MIN_INTAKE_DAYS = 7;

/**
 * Cross-check: OLS of daily weight on day index over the last 28 days, with
 * the slope SE inflated for lag-1 autocorrelation of the residuals.
 * TDEE = mean intake of complete days in the window − slope × energyPerKg.
 */
export function regressionCrossCheck({ points, intakeByDate, energyPerKg, endDate, windowDays = REGRESSION_WINDOW }) {
  const win = lastNDays(windowDays, endDate);
  const start = win[0];
  const inWin = new Set(win);
  const pts = points.filter((p) => inWin.has(p.date)).map((p) => ({ x: daysBetween(start, p.date), y: p.weight }));
  const intakes = win.filter((d) => intakeByDate.has(d)).map((d) => intakeByDate.get(d));
  const base = { start, end: endDate, n: pts.length, intakeDays: intakes.length };
  if (pts.length < REGRESSION_MIN_WEIGHINS) return { ...base, ok: false, reason: `needs ≥ ${REGRESSION_MIN_WEIGHINS} weigh-ins in the last ${windowDays} days` };

  const n = pts.length;
  const mx = mean(pts.map((p) => p.x));
  const my = mean(pts.map((p) => p.y));
  let sxx = 0, sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const res = pts.map((p) => ({ x: p.x, r: p.y - intercept - slope * p.x }));
  const ssr = res.reduce((a, q) => a + q.r * q.r, 0);
  const seRaw = Math.sqrt(ssr / (n - 2) / sxx);

  let num = 0, pairs = 0;
  for (let i = 1; i < res.length; i++) {
    if (res[i].x - res[i - 1].x === 1) {
      num += res[i].r * res[i - 1].r;
      pairs += 1;
    }
  }
  let rho, rhoSource;
  if (pairs < 10) {
    rho = 0.5;
    rhoSource = "default (fewer than 10 consecutive-day pairs)";
  } else {
    const raw = ssr > 0 ? (num / pairs) / (ssr / n) : 0;
    rho = Math.min(0.9, Math.max(0, raw));
    rhoSource = "measured";
  }
  const se = seRaw * Math.sqrt((1 + rho) / (1 - rho));
  const out = { ...base, ok: true, slope, se, seRaw, rho, rhoSource, pairs, energyPerKg };
  if (intakes.length < REGRESSION_MIN_INTAKE_DAYS) {
    return { ...out, tdee: null, reason: `needs ≥ ${REGRESSION_MIN_INTAKE_DAYS} complete food days in the window` };
  }
  const meanIntake = mean(intakes);
  return { ...out, meanIntake, tdee: meanIntake - slope * energyPerKg, tdeeSD: se * energyPerKg };
}
