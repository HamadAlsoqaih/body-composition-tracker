// Energy content of weight change, BMR formulas, activity multiplier and the
// formula TDEE used as the Kalman prior.
import { daysBetween } from "./dates.js";

/** Fallback only — used when fat mass cannot be determined at all. */
export const ENERGY_PER_KG_FALLBACK = 7700;

/** Energy density of lean and fat tissue (kcal/kg), Hall 2008. */
export const LEAN_KCAL_PER_KG = 1816;
export const FAT_KCAL_PER_KG = 9440;
/** Forbes constant (kg). */
export const FORBES_C = 10.4;

/**
 * Hall 2008 (Int J Obes 32:573) with the Forbes relation:
 *   p = 10.4 / (10.4 + FM)   — lean fraction of a weight change
 *   energyPerKg = p·1816 + (1 − p)·9440
 */
export function hallForbesEnergyPerKg(fatMassKg) {
  if (!Number.isFinite(fatMassKg) || fatMassKg < 0) {
    return { p: null, energyPerKg: ENERGY_PER_KG_FALLBACK, fallback: true };
  }
  const p = FORBES_C / (FORBES_C + fatMassKg);
  return { p, energyPerKg: p * LEAN_KCAL_PER_KG + (1 - p) * FAT_KCAL_PER_KG, fallback: false };
}

export function bmi(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  return weightKg / (heightCm / 100) ** 2;
}

/** Weight (kg) at a given BMI for a height. */
export const weightAtBmi = (targetBmi, heightCm) => targetBmi * (heightCm / 100) ** 2;

/** Deurenberg 1991: BF% = 1.20·BMI + 0.23·age − 10.8·S − 5.4 (S = 1 male formula, 0 female). */
export function deurenbergBF(bmiValue, age, sex) {
  const S = sex === "male" ? 1 : 0;
  return 1.2 * bmiValue + 0.23 * age - 10.8 * S - 5.4;
}

/** Katch-McArdle BMR = 370 + 21.6 × lean mass (kg). */
export const katchMcArdle = (leanMassKg) => 370 + 21.6 * leanMassKg;

/** Mifflin-St Jeor 1990 BMR. */
export function mifflinStJeor(weightKg, heightCm, age, sex) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

export const ACTIVITY_LEVELS = [
  { key: "sedentary", factor: 1.2, label: "Sedentary", example: "Desk job, little walking, no planned exercise." },
  { key: "light", factor: 1.375, label: "Lightly active", example: "On your feet some of the day, or light exercise 1–3 days a week." },
  { key: "moderate", factor: 1.55, label: "Moderately active", example: "Moderate exercise 3–5 days a week, or a job with regular walking." },
  { key: "very", factor: 1.725, label: "Very active", example: "Hard training 6–7 days a week, or a physically demanding job." },
  { key: "extreme", factor: 1.9, label: "Extremely active", example: "Hard physical labour plus training, or twice-a-day endurance training." },
];

export const activityFactor = (key) => ACTIVITY_LEVELS.find((a) => a.key === key)?.factor ?? null;

/** Suggest a level from average daily steps (suggestion only; user decides). */
export function activityFromSteps(steps) {
  if (!Number.isFinite(steps) || steps < 0) return null;
  if (steps < 5000) return "sedentary";
  if (steps < 7500) return "light";
  if (steps < 10000) return "moderate";
  if (steps < 12500) return "very";
  return "extreme";
}

/** Nearest level to an arbitrary legacy multiplier (e.g. old default 1.45). */
export function nearestActivityLevel(factor) {
  if (!Number.isFinite(factor)) return null;
  return ACTIVITY_LEVELS.reduce((best, a) => (Math.abs(a.factor - factor) < Math.abs(best.factor - factor) ? a : best)).key;
}

/** BMR: Katch-McArdle when a measured BF% is known, otherwise Mifflin-St Jeor. */
export function bmrFor({ weightKg, heightCm, age, sex, bfPercent }) {
  if (Number.isFinite(bfPercent) && bfPercent > 0 && bfPercent < 75 && weightKg > 0) {
    const lean = weightKg * (1 - bfPercent / 100);
    return { bmr: katchMcArdle(lean), method: "katch", leanMass: lean, inputs: { weightKg, bfPercent } };
  }
  if (!(weightKg > 0) || !(heightCm > 0) || !(age > 0) || !(sex === "male" || sex === "female")) return null;
  return { bmr: mifflinStJeor(weightKg, heightCm, age, sex), method: "mifflin", inputs: { weightKg, heightCm, age, sex } };
}

export const FORMULA_SIGMA_FRACTION = 0.12;

/** Formula TDEE = BMR × activity multiplier; σ_f = 12% (an assumption). */
export function formulaTDEE({ weightKg, heightCm, age, sex, bfPercent, multiplier }) {
  const b = bmrFor({ weightKg, heightCm, age, sex, bfPercent });
  if (!b || !(multiplier > 0)) return null;
  const tdee = b.bmr * multiplier;
  return { ...b, multiplier, tdee, sigma: FORMULA_SIGMA_FRACTION * tdee };
}

export const BF_SOURCES = ["dexa", "bia", "calipers"];
export const BF_MAX_AGE_DAYS = 180;

/**
 * Best body-fat % available on `date`, in priority order:
 *   1. DEXA, trend-smoothed (OLS over DEXA readings, evaluated at the latest one)
 *   2. BIA / calipers: mean of the last 3 readings
 *   3. Deurenberg estimate from BMI (flagged as an estimate)
 * Readings older than 180 days are not used.
 * readings: [{date, bf, source}]
 */
export function bodyFatEstimate({ readings = [], date, weightKg, heightCm, age, sex }) {
  const usable = readings
    .filter((r) => r && Number.isFinite(r.bf) && r.bf > 0 && r.bf < 75 && r.date <= date && daysBetween(r.date, date) <= BF_MAX_AGE_DAYS)
    .sort((a, b) => a.date.localeCompare(b.date));
  const withFm = (o) => ({ ...o, fatMass: weightKg > 0 ? (weightKg * o.bfPercent) / 100 : null });

  const dexa = usable.filter((r) => r.source === "dexa");
  if (dexa.length) {
    let bf = dexa[dexa.length - 1].bf;
    if (dexa.length >= 3) {
      const t0 = dexa[0].date;
      const xs = dexa.map((r) => daysBetween(t0, r.date));
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = dexa.reduce((a, r) => a + r.bf, 0) / dexa.length;
      let sxx = 0, sxy = 0;
      dexa.forEach((r, i) => {
        sxx += (xs[i] - mx) ** 2;
        sxy += (xs[i] - mx) * (r.bf - my);
      });
      if (sxx > 0) bf = my + (sxy / sxx) * (xs[xs.length - 1] - mx);
    }
    return withFm({ bfPercent: bf, source: "dexa", isEstimate: false, n: dexa.length, measured: true });
  }
  const bia = usable.filter((r) => r.source === "bia" || r.source === "calipers");
  if (bia.length) {
    const last = bia.slice(-3);
    const bf = last.reduce((a, r) => a + r.bf, 0) / last.length;
    const src = last.every((r) => r.source === "calipers") ? "calipers" : last.every((r) => r.source === "bia") ? "bia" : "bia/calipers";
    return withFm({ bfPercent: bf, source: src, isEstimate: false, n: last.length, measured: true });
  }
  const b = bmi(weightKg, heightCm);
  if (b != null && age > 0 && (sex === "male" || sex === "female")) {
    return withFm({ bfPercent: deurenbergBF(b, age, sex), source: "deurenberg", isEstimate: true, n: 0, measured: false, bmi: b });
  }
  return { bfPercent: null, source: "none", isEstimate: true, n: 0, measured: false, fatMass: null };
}

/** energyPerKg with the full provenance used for explain-the-math. */
export function energyPerKgFor(bfInfo) {
  const h = hallForbesEnergyPerKg(bfInfo?.fatMass);
  return { ...h, fatMass: bfInfo?.fatMass ?? null, bfPercent: bfInfo?.bfPercent ?? null, source: h.fallback ? "fallback 7700" : bfInfo.source, isEstimate: !!bfInfo?.isEstimate };
}
