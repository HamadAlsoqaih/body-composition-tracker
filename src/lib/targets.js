// Calorie and macro targets, "on track" check and goal ETA.
import { bmi, weightAtBmi } from "./energy.js";

/** Goal rate as % of body weight per week. */
export const RATE_LIMITS = {
  lose: { min: 0.25, max: 1.0, def: 0.5 },
  gain: { min: 0.1, max: 0.5, def: 0.25 },
  maintain: { min: 0, max: 0, def: 0 },
};

export const defaultRate = (dir) => (RATE_LIMITS[dir] || RATE_LIMITS.maintain).def;

/** Warning text when the chosen rate is outside the suggested range. */
export function rateWarning(dir, ratePct) {
  const L = RATE_LIMITS[dir];
  if (!L || dir === "maintain") return null;
  if (!Number.isFinite(ratePct) || ratePct <= 0) return `Choose a rate between ${L.min}% and ${L.max}% of body weight per week.`;
  if (ratePct < L.min) return `${ratePct}%/week is below the suggested ${L.min}–${L.max}% range; changes this small are hard to measure.`;
  if (ratePct > L.max) return `${ratePct}%/week is above the suggested ${L.min}–${L.max}% range. Faster ${dir === "lose" ? "loss tends to cost more muscle" : "gain tends to add more fat"}.`;
  return null;
}

/** Signed target change of tissue mass, kg/day. */
export function targetRateKgPerDay(dir, ratePct, weightKg) {
  if (dir === "maintain" || !Number.isFinite(ratePct)) return 0;
  const kgPerDay = ((ratePct / 100) * weightKg) / 7;
  return dir === "lose" ? -kgPerDay : kgPerDay;
}

/** Target kcal/day = TDEE ∓ rate × trend weight × energyPerKg / 7. */
export function targetCalories({ tdee, dir, ratePct, trendWeightKg, energyPerKg }) {
  if (!Number.isFinite(tdee) || !Number.isFinite(trendWeightKg) || !Number.isFinite(energyPerKg)) return null;
  const rateKgDay = targetRateKgPerDay(dir, ratePct, trendWeightKg);
  const delta = rateKgDay * energyPerKg; // negative = deficit
  return { target: tdee + delta, delta, rateKgDay, rateKgWeek: rateKgDay * 7 };
}

export const PROTEIN_RANGE = { min: 1.2, max: 2.4 };
export const defaultProteinPerKg = (dir) => (dir === "lose" ? 1.8 : 1.6);

export function proteinPerKgFor(dir, userValue) {
  if (Number.isFinite(userValue)) return Math.min(PROTEIN_RANGE.max, Math.max(PROTEIN_RANGE.min, userValue));
  return defaultProteinPerKg(dir);
}

/**
 * Reference weight for protein and fat:
 *  - measured BF% above 25% (male formula) / 32% (female formula):
 *      lean mass / 0.85 (male) or lean mass / 0.75 (female)
 *  - else BMI > 30: weight at BMI 25 for their height
 *  - else: current trend weight
 */
export function proteinReferenceWeight({ weightKg, heightCm, bfPercent, bfMeasured, sex }) {
  const cut = sex === "female" ? 32 : 25;
  if (bfMeasured && Number.isFinite(bfPercent) && bfPercent > cut) {
    const lean = weightKg * (1 - bfPercent / 100);
    const div = sex === "female" ? 0.75 : 0.85;
    return { refWeight: lean / div, reason: `body fat ${bfPercent.toFixed(1)}% is above ${cut}%, so lean mass ${lean.toFixed(1)} kg ÷ ${div} is used`, branch: "lean" };
  }
  const b = bmi(weightKg, heightCm);
  if (b != null && b > 30) {
    return { refWeight: weightAtBmi(25, heightCm), reason: `BMI ${b.toFixed(1)} is above 30, so the weight at BMI 25 for your height is used`, branch: "bmi25" };
  }
  return { refWeight: weightKg, reason: "your current trend weight is used", branch: "trend" };
}

/**
 * Protein = g/kg × reference weight; fat floor = max(20% of target kcal ÷ 9,
 * 0.5 g/kg reference weight); carbs = remaining kcal ÷ 4.
 */
export function macroTargets({ targetKcal, refWeight, proteinPerKg }) {
  const protein = proteinPerKg * refWeight;
  const fatFromKcal = (0.2 * targetKcal) / 9;
  const fatFromWeight = 0.5 * refWeight;
  const fat = Math.max(fatFromKcal, fatFromWeight);
  const carbsRaw = (targetKcal - protein * 4 - fat * 9) / 4;
  const carbs = Math.max(0, carbsRaw);
  return {
    protein,
    fat,
    fatBasis: fatFromKcal >= fatFromWeight ? "20% of calories" : "0.5 g/kg reference weight",
    fatFromKcal,
    fatFromWeight,
    carbs,
    carbsRaw,
    lowCarb: carbsRaw < 50,
  };
}

export const LOW_CARB_NOTE =
  "Your protein and fat targets leave little room for carbs. That's fine short-term, but low carbs can make training feel flat — consider a smaller deficit or a little less fat.";

/**
 * On track if the target rate lies inside the 95% interval of the estimated
 * tissue change rate; otherwise the kcal/day change needed.
 */
export function onTrack({ targetRateKgDay, rate, energyPerKg }) {
  if (!rate || !Number.isFinite(rate.lo)) return null;
  const inside = rate.lo <= targetRateKgDay && targetRateKgDay <= rate.hi;
  const adjustKcal = (targetRateKgDay - rate.rate) * energyPerKg; // negative = eat less
  return { onTrack: inside, adjustKcal: inside ? 0 : adjustKcal, rawAdjustKcal: adjustKcal };
}

/**
 * Weeks to reach a goal weight at a constant % of body weight per week.
 * Because the rate is a percentage, kg/week shrinks as weight drops:
 * weeks = ln(goal / now) / ln(1 ∓ r). The range assumes the achieved rate is
 * within ±25% of the target (an assumption).
 */
export function goalETA({ currentKg, goalKg, dir, ratePct }) {
  if (!Number.isFinite(currentKg) || !Number.isFinite(goalKg) || !(ratePct > 0) || dir === "maintain") return null;
  if (dir === "lose" && goalKg >= currentKg) return null;
  if (dir === "gain" && goalKg <= currentKg) return null;
  const weeks = (r) => Math.log(goalKg / currentKg) / Math.log(dir === "lose" ? 1 - r : 1 + r);
  const r = ratePct / 100;
  return { weeks: weeks(r), low: weeks(r * 1.25), high: weeks(r * 0.75) };
}
