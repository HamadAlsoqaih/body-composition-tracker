// Safety guardrails for a public app. Wording is neutral and non-judgmental.
import { bmi, weightAtBmi } from "./energy.js";

export const MIN_ADULT_AGE = 18;
export const MIN_BMI = 18.5;
export const FLOOR_FEMALE = 1200;
export const FLOOR_MALE = 1500;
export const RAPID_LOSS_PCT_WEEK = 1.5;

export const MSG = {
  minor: "Calorie targets are for adults. Please talk to a doctor or parent.",
  pregnant: "Pregnant or breastfeeding: deficit targets are turned off and maintenance is shown. Please follow your doctor's or midwife's advice on nutrition.",
  lowBmi: "Your BMI is below 18.5, so weight-loss targets are turned off. Maintenance is shown instead.",
  rapidLoss: "Your estimated loss has been above 1.5% of body weight per week for two weekly updates in a row. Consider eating more, and consider checking in with a doctor or dietitian.",
  disclaimer: "Estimates only, not medical advice.",
};

/** Words the app must never use. */
export const AVOID_WORDS = ["bad day", "cheat", "cheated", "guilt", "guilty", "failure", "failed day", "junk", "sinful", "naughty"];

/** Decide which goal direction is allowed, before any numbers are computed. */
export function effectiveGoal({ age, pregnant, weightKg, heightCm, dir }) {
  const messages = [];
  if (Number.isFinite(age) && age < MIN_ADULT_AGE) {
    return { allowTargets: false, dir: null, messages: [{ tone: "warn", text: MSG.minor }] };
  }
  let d = dir || "maintain";
  if (pregnant) {
    if (d !== "maintain") d = "maintain";
    messages.push({ tone: "warn", text: MSG.pregnant });
  }
  const b = bmi(weightKg, heightCm);
  if (b != null && b < MIN_BMI && d === "lose") {
    d = "maintain";
    messages.push({ tone: "warn", text: MSG.lowBmi });
  }
  return { allowTargets: true, dir: d, requestedDir: dir, messages, bmi: b };
}

export const calorieFloor = ({ bmr, sex }) => Math.max(Number.isFinite(bmr) ? bmr : 0, sex === "female" ? FLOOR_FEMALE : FLOOR_MALE);

/** Never recommend below max(BMR, 1,200 female formula / 1,500 male formula). */
export function applyCalorieFloor({ targetKcal, bmr, sex }) {
  const floor = calorieFloor({ bmr, sex });
  if (targetKcal >= floor) return { targetKcal, capped: false, floor };
  return {
    targetKcal: floor,
    capped: true,
    floor,
    message: `The math gives ${Math.round(targetKcal)} kcal/day, which is below the minimum this app will suggest (${Math.round(floor)} kcal/day — the larger of your estimated BMR and ${sex === "female" ? "1,200" : "1,500"} kcal). The target is set to ${Math.round(floor)} kcal/day; expect slower progress than the chosen rate.`,
  };
}

/** Goal weights below BMI 18.5 are rejected. */
export function validateGoalWeight(goalKg, heightCm) {
  if (goalKg == null) return { ok: true };
  if (!Number.isFinite(goalKg) || goalKg <= 0) return { ok: false, message: "Enter a valid goal weight." };
  if (!(heightCm > 0)) return { ok: true };
  const minKg = weightAtBmi(MIN_BMI, heightCm);
  if (goalKg < minKg) {
    return { ok: false, minKg, message: `That goal is below a BMI of 18.5 for your height (about ${minKg.toFixed(1)} kg), which is classed as underweight. Please choose ${minKg.toFixed(1)} kg or more.` };
  }
  return { ok: true, minKg };
}

/**
 * weeklyLossPct: estimated loss (% of body weight per week, positive = losing)
 * at each weekly update, oldest first. Warn when the last two exceed 1.5%.
 */
export function rapidLossWarning(weeklyLossPct) {
  const xs = (weeklyLossPct || []).filter((x) => x != null);
  if (xs.length < 2) return null;
  const [a, b] = xs.slice(-2);
  return a > RAPID_LOSS_PCT_WEEK && b > RAPID_LOSS_PCT_WEEK ? { tone: "warn", text: MSG.rapidLoss } : null;
}

/** True if a string contains wording the app avoids. */
export function hasAvoidedWording(text) {
  const t = String(text).toLowerCase();
  return AVOID_WORDS.some((w) => t.includes(w));
}
