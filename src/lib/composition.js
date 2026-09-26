// Body-composition analysis: mean of the first 3 vs mean of the last 3
// readings (same source) with minimum detectable changes.
import { daysBetween } from "./dates.js";

export const SOURCES = [
  { key: "bia", label: "BIA scale" },
  { key: "dexa", label: "DEXA" },
  { key: "calipers", label: "Calipers" },
  { key: "tape", label: "Tape only" },
];

export const sourceLabel = (k) => SOURCES.find((s) => s.key === k)?.label ?? "Unknown";

/** Minimum detectable change per source and metric (below = no measurable change). */
export const MDC = {
  bia: { fatMass: 1.5, muscleMass: 1.5, bodyFat: 2 },
  dexa: { fatMass: 1.0, muscleMass: 1.0 },
  calipers: { bodyFat: 2 },
  tape: { waist: 1.0 },
};

export const MIN_READINGS_PER_END = 3;
export const MIN_DAYS_APART = 21;
export const BIA_MUSCLE_NOTE = "low confidence (BIA muscle includes water)";

const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Average of 2–3 waist readings taken in one sitting. */
export function averageReadings(readings) {
  const xs = (readings || []).map(Number).filter((v) => Number.isFinite(v) && v > 0);
  return xs.length ? meanOf(xs) : null;
}

/**
 * Compare the mean of the first 3 with the mean of the last 3 readings.
 * Needs ≥ 3 readings at each end (6 in total, non-overlapping) and the two
 * groups' mean dates ≥ 21 days apart.
 * readings: [{date, value}] (any order)
 */
export function compareEnds(readings, { minEach = MIN_READINGS_PER_END, minDays = MIN_DAYS_APART } = {}) {
  const r = readings.filter((x) => x && Number.isFinite(x.value)).sort((a, b) => a.date.localeCompare(b.date));
  if (r.length < minEach * 2) return { ok: false, n: r.length, reason: `needs ${minEach} readings at each end (${minEach * 2} total); have ${r.length}` };
  const first = r.slice(0, minEach), last = r.slice(-minEach);
  const t0 = first[0].date;
  const meanDay = (g) => meanOf(g.map((x) => daysBetween(t0, x.date)));
  const daysApart = meanDay(last) - meanDay(first);
  if (daysApart < minDays) return { ok: false, n: r.length, daysApart, reason: `the first and last readings need to be ≥ ${minDays} days apart; they are ${Math.round(daysApart)}` };
  const firstMean = meanOf(first.map((x) => x.value));
  const lastMean = meanOf(last.map((x) => x.value));
  return { ok: true, n: r.length, daysApart, firstMean, lastMean, delta: lastMean - firstMean, from: first[0].date, to: last[last.length - 1].date };
}

/** −1 / 0 / +1 against a minimum detectable change (null if not comparable). */
export function signal(cmp, mdc) {
  if (!cmp || !cmp.ok) return null;
  return Math.abs(cmp.delta) < mdc ? 0 : cmp.delta > 0 ? 1 : -1;
}

/**
 * US Navy tape body-fat estimate (all cm). Returns null when inputs are
 * missing or a log argument would be ≤ 0.
 */
export function navyBodyFat({ sex, waist, neck, hip, height }) {
  if (!(height > 0) || !(neck > 0) || !(waist > 0)) return null;
  let d;
  if (sex === "male") {
    const a = waist - neck;
    if (!(a > 0)) return null;
    d = 1.0324 - 0.19077 * Math.log10(a) + 0.15456 * Math.log10(height);
  } else if (sex === "female") {
    if (!(hip > 0)) return null;
    const a = waist + hip - neck;
    if (!(a > 0)) return null;
    d = 1.29579 - 0.35004 * Math.log10(a) + 0.221 * Math.log10(height);
  } else return null;
  if (!(d > 0)) return null;
  const bf = 495 / d - 450;
  return Number.isFinite(bf) ? bf : null;
}

const series = (entries, source, key) =>
  entries.filter((e) => (source == null || e.source === source) && Number.isFinite(e[key])).map((e) => ({ date: e.date, value: e[key] }));

/**
 * Analyse entries within [from, to] (inclusive; either may be null).
 * Waist is the primary fat signal; scale/caliper/DEXA fat is the cross-check.
 */
export function analyzeComposition(entries, { from = null, to = null, weightSeries = null } = {}) {
  const inRange = (entries || []).filter((e) => e && typeof e.date === "string" && (!from || e.date >= from) && (!to || e.date <= to));

  const waist = compareEnds(series(inRange, null, "waist"));
  const metrics = {
    waist: { ...waist, source: "tape", key: "waist", mdc: MDC.tape.waist, signal: signal(waist, MDC.tape.waist) },
  };
  for (const [src, table] of Object.entries(MDC)) {
    if (src === "tape") continue;
    for (const [key, mdc] of Object.entries(table)) {
      const c = compareEnds(series(inRange, src, key));
      metrics[`${src}.${key}`] = { ...c, source: src, key, mdc, signal: signal(c, mdc) };
    }
  }
  const wpts = weightSeries
    ? weightSeries.filter((p) => (!from || p.date >= from) && (!to || p.date <= to)).map((p) => ({ date: p.date, value: p.weight }))
    : series(inRange, null, "weight");
  const weight = compareEnds(wpts);

  // scale-side fat signal: DEXA > calipers > BIA
  const pickFat = ["dexa.fatMass", "calipers.bodyFat", "bia.fatMass", "bia.bodyFat"].map((k) => metrics[k]).find((m) => m.ok);
  const pickMuscle = ["dexa.muscleMass", "bia.muscleMass"].map((k) => metrics[k]).find((m) => m.ok);
  const scaleFatSig = pickFat ? pickFat.signal : null;
  const waistSig = metrics.waist.ok ? metrics.waist.signal : null;
  const fatSig = waistSig != null ? waistSig : scaleFatSig;
  const muscleSig = pickMuscle ? pickMuscle.signal : null;
  const muscleLowConfidence = pickMuscle?.source === "bia";

  const base = { metrics, weight, fatSource: waistSig != null ? metrics.waist : pickFat || null, muscleSource: pickMuscle || null, muscleLowConfidence };

  if (fatSig == null && muscleSig == null) {
    const why = [metrics.waist, metrics["bia.fatMass"], metrics["dexa.fatMass"], metrics["calipers.bodyFat"]].find((m) => m.reason)?.reason;
    return { ...base, status: "insufficient", tone: "hold", headline: "Not enough data yet", detail: `Composition changes are judged from the average of your first 3 and last 3 readings from the same source, at least ${MIN_DAYS_APART} days apart${why ? ` (${why})` : ""}.` };
  }

  const fatDown = fatSig === -1, fatUp = fatSig === 1, muscleUp = muscleSig === 1, muscleDown = muscleSig === -1;
  let status, headline, detail, tone, change = null;
  if (fatDown && muscleUp) {
    status = "recomp"; tone = "good";
    headline = "Recomposition — losing fat, gaining muscle";
    detail = "Fat signals are down and muscle is up by more than the measurement noise. Keep doing what's working.";
  } else if (fatDown && muscleDown) {
    status = "cut-muscle-loss"; tone = "warn";
    headline = "Losing fat and some muscle";
    detail = "Fat is coming down, and muscle has also dropped by more than the measurement noise.";
    change = "A smaller deficit, protein toward the upper end of your range, and regular resistance training help keep muscle.";
  } else if (fatDown) {
    status = "cut"; tone = "good";
    headline = "Losing fat";
    detail = muscleSig === 0 ? "Fat signals are down; muscle has no measurable change." : "Fat signals are down.";
  } else if (fatUp || muscleUp) {
    status = muscleUp && !fatUp ? "gain" : fatUp && !muscleUp ? "gain-fat" : "gain-both";
    tone = "info";
    headline = status === "gain" ? "Gaining muscle" : status === "gain-fat" ? "Gaining — mostly fat signals" : "Gaining fat and muscle";
    detail = "Measured changes exceed the noise thresholds in the gaining direction. That fits a surplus — fine if it's intended.";
    if (fatUp) change = "If gaining fat isn't the plan, a slightly smaller surplus shifts more of the gain toward muscle.";
  } else {
    status = "flat"; tone = "hold";
    headline = "No measurable change yet";
    detail = "Changes so far are within the measurement noise of your methods. That's normal over short spans — keep logging.";
  }

  let agreement = "unknown";
  if (scaleFatSig != null && waistSig != null) {
    if (scaleFatSig === waistSig) agreement = scaleFatSig === 0 ? "flat" : "agree";
    else if (scaleFatSig === 0 || waistSig === 0) agreement = "partial";
    else agreement = "conflict";
  }
  let confidence = "medium", confNote;
  if (agreement === "conflict") {
    confidence = "low";
    confNote = "Your scale/caliper fat reading and your waist point in opposite directions. The waist trend is weighted more; re-check over the next few weeks.";
  } else if (agreement === "agree") {
    confidence = "high";
    confNote = "Scale and tape agree, so this reading is more trustworthy.";
  } else if (agreement === "partial") {
    confNote = "Only one of scale and tape shows a measurable change.";
  } else {
    confNote = waistSig != null ? "Based on your waist trend (the most reliable fat signal here)." : "No waist data to cross-check against; add tape measurements for a stronger signal.";
  }
  if (muscleLowConfidence && muscleSig != null && muscleSig !== 0 && confidence === "high") confidence = "medium";

  return { ...base, status, headline, detail, tone, change, agreement, confidence, confNote, fatSig, muscleSig, waistSig, scaleFatSig };
}
