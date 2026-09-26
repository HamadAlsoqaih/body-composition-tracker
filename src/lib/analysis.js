// Orchestrator: turns stored state into every number the UI shows. The
// explain-the-math screen reads the same object, so the numbers always match.
import { localDateString, dateRange, daysBetween, lastNDays, lastWeekdayOnOrBefore, weekday, addDays } from "./dates.js";
import { dailyWeights, flagOutliers, emaTrend, trendAt, regressionCrossCheck } from "./trend.js";
import { completeIntakeByDate, intakeSummary, yesterdayPrompt, dayTags } from "./foodlog.js";
import { formulaTDEE, bodyFatEstimate, energyPerKgSchedule, activityFactor, bmrFor, bmi, energyPerKgFor, ACTIVITY_LEVELS } from "./energy.js";
import { estimateTDEE, Z95 } from "./kalman.js";
import {
  targetCalories, proteinReferenceWeight, proteinPerKgFor, macroTargets, onTrack, goalETA, defaultRate, rateWarning, LOW_CARB_NOTE,
} from "./targets.js";
import { effectiveGoal, applyCalorieFloor, rapidLossWarning, validateGoalWeight, MSG } from "./guardrails.js";
import { navyBodyFat } from "./composition.js";
import { roundTo } from "./units.js";

export const MIN_DAYS_FOR_STATUS = 14;

/** Body-fat readings usable for energyPerKg / Katch-McArdle. */
export function bodyFatReadings(entries, settings) {
  const r = entries
    .filter((e) => Number.isFinite(e.bodyFat) && ["dexa", "bia", "calipers"].includes(e.source))
    .map((e) => ({ date: e.date, bf: e.bodyFat, source: e.source }));
  if (settings?.bf) r.push({ date: settings.bf.date, bf: settings.bf.value, source: settings.bf.source });
  return r.sort((a, b) => a.date.localeCompare(b.date));
}

/** Which profile fields are still needed for any calorie math. */
export function missingProfile(settings) {
  const m = [];
  if (!(settings.heightCm > 0)) m.push("height");
  if (!(settings.age > 0)) m.push("age");
  if (settings.sex !== "male" && settings.sex !== "female") m.push("sex used for the calculation");
  if (!activityFactor(settings.activity)) m.push("activity level");
  if (settings.alreadyStable == null) m.push("current-intake question");
  if (settings.checkinWeekday == null) m.push("weekly check-in day");
  return m;
}

/** Latest Navy estimate from the newest tape entry that has the inputs. */
export function latestNavy(entries, settings) {
  if (!settings.heightCm || !settings.sex) return null;
  const tape = [...entries].filter((e) => e.waist != null && e.neck != null).sort((a, b) => b.date.localeCompare(a.date));
  for (const e of tape) {
    const bf = navyBodyFat({ sex: settings.sex, waist: e.waist, neck: e.neck, hip: e.hips, height: settings.heightCm });
    if (bf != null) return { bf, date: e.date };
  }
  return null;
}

function sliceInputs(inp, end) {
  return {
    ...inp,
    obs: inp.obs.slice(0, end + 1),
    intake: inp.intake.slice(0, end + 1),
    rho: inp.rho.slice(0, end + 1),
    tagged: inp.tagged.slice(0, end + 1),
  };
}

const lossPctPerWeek = (rate, w) => (rate && w ? (-rate.rate * 7 * 100) / w : null);

/**
 * Compute the full model. Pure: depends only on `state` and `today`.
 */
export function computeModel(state, today = localDateString()) {
  const { entries, food, days, settings, goals } = state;
  const person = { heightCm: settings.heightCm, age: settings.age, sex: settings.sex };

  // ---- weight cleaning ----
  const daily = dailyWeights(entries.filter((e) => e.date <= today));
  const cleaning = flagOutliers(daily, settings.includeDates);
  const clean = cleaning.points.filter((p) => !p.outlier);
  const trend = emaTrend(clean);
  const trendWeight = trend.length ? trend[trend.length - 1].trend : null;
  const latestWeight = clean.length ? clean[clean.length - 1].weight : null;

  // ---- intake ----
  const intakeByDate = completeIntakeByDate(food, days);
  const week = intakeSummary(food, days, lastNDays(7, today));
  const readings = bodyFatReadings(entries, settings);
  const missing = missingProfile(settings);
  const multiplier = activityFactor(settings.activity);

  const out = {
    today,
    missing,
    cleaning: { ...cleaning, used: clean.length, ignored: cleaning.points.filter((p) => p.outlier).length, kalmanIgnored: [] },
    trend,
    trendWeight,
    latestWeight,
    week,
    intakeByDate,
    yesterday: yesterdayPrompt(food, days, today),
    navy: latestNavy(entries, settings),
    bmi: bmi(trendWeight, settings.heightCm),
    goalCheck: validateGoalWeight(goals.weight, settings.heightCm),
    kalman: null,
  };

  const canFormula = settings.heightCm > 0 && settings.age > 0 && (settings.sex === "male" || settings.sex === "female") && multiplier;
  if (!clean.length || !canFormula) {
    out.reason = !clean.length ? "Add a weigh-in to start the estimate." : `Complete your profile (${missing.join(", ")}) to get an estimate.`;
    out.guard = effectiveGoal({ age: settings.age, pregnant: settings.pregnant, weightKg: trendWeight, heightCm: settings.heightCm, dir: settings.goalDir });
    return out;
  }

  // ---- filter timeline: first usable weigh-in … today ----
  const start = clean[0].date;
  const dates = dateRange(start, today);
  const n = dates.length;
  const cleanByDate = new Map(clean.map((p) => [p.date, p.weight]));
  const obs = dates.map((d) => cleanByDate.get(d) ?? null);
  const intake = dates.map((d) => intakeByDate.get(d) ?? null);
  const tagged = dates.map((d) => dayTags(days, d).length > 0);
  const firstTrend = trend[0].trend;
  const sched = energyPerKgSchedule({ dates, readings, trendAtDate: (d) => trendAt(trend, d) ?? firstTrend, person });

  // formula prior on day 1
  const bf0 = bodyFatEstimate({ readings, date: start, weightKg: obs[0], ...person });
  const prior = formulaTDEE({ weightKg: obs[0], ...person, bfPercent: bf0.measured ? bf0.bfPercent : null, multiplier });
  const inputs = { obs, intake, rho: sched.rho, T0: prior.tdee, sigmaF: prior.sigma, alreadyStable: settings.alreadyStable === true, tagged };

  const full = estimateTDEE(inputs);

  // ---- weekly snapshot (fixed check-in weekday) ----
  const wd = settings.checkinWeekday ?? weekday(start);
  let snapDate = lastWeekdayOnOrBefore(today, wd);
  if (snapDate < start) snapDate = start;
  const snapIdx = daysBetween(start, snapDate);
  const snap = snapIdx === n - 1 ? full : estimateTDEE(sliceInputs(inputs, snapIdx));
  const prevIdx = snapIdx - 7;
  const prev = prevIdx >= MIN_DAYS_FOR_STATUS ? estimateTDEE(sliceInputs(inputs, prevIdx)) : null;
  const nextCheckin = addDays(snapDate, 7) <= today ? today : addDays(lastWeekdayOnOrBefore(today, wd), 7);

  const snapTrendW = trendAt(trend, snapDate) ?? firstTrend;
  const prevTrendW = prev ? trendAt(trend, dates[prevIdx]) ?? firstTrend : null;
  const energy = sched.weeks[Math.floor(snapIdx / 7)];
  const bfNow = bodyFatEstimate({ readings, date: snapDate, weightKg: snapTrendW, ...person });
  const formulaNow = formulaTDEE({ weightKg: snapTrendW, ...person, bfPercent: bfNow.measured ? bfNow.bfPercent : null, multiplier });

  const s = snap.summary;
  const tdee = { ...s, displayTdee: roundTo(s.tdee, 10), displayHalf: roundTo(s.half95, 10) };

  // ---- regression cross-check at the snapshot ----
  const reg = regressionCrossCheck({ points: clean.filter((p) => p.date <= snapDate), intakeByDate, energyPerKg: energy.energyPerKg, endDate: snapDate });
  let agreement = null;
  if (reg.ok && reg.tdee != null) {
    const limit = Z95 * Math.sqrt(s.sd ** 2 + reg.tdeeSD ** 2);
    agreement = { diff: s.tdee - reg.tdee, limit, agrees: Math.abs(s.tdee - reg.tdee) <= limit };
  }

  // ---- goals, guardrails and targets ----
  const guard = effectiveGoal({ age: settings.age, pregnant: settings.pregnant, weightKg: snapTrendW, heightCm: settings.heightCm, dir: settings.goalDir });
  let targets = null;
  if (guard.allowTargets) {
    const dir = guard.dir;
    const ratePct = dir === "maintain" ? 0 : settings.ratePct ?? defaultRate(dir);
    const tc = targetCalories({ tdee: s.tdee, dir, ratePct, trendWeightKg: snapTrendW, energyPerKg: energy.energyPerKg });
    const bmrNow = bmrFor({ weightKg: snapTrendW, ...person, bfPercent: bfNow.measured ? bfNow.bfPercent : null });
    const floor = applyCalorieFloor({ targetKcal: tc.target, bmr: bmrNow?.bmr, sex: settings.sex });
    const ref = proteinReferenceWeight({ weightKg: snapTrendW, heightCm: settings.heightCm, bfPercent: bfNow.bfPercent, bfMeasured: bfNow.measured, sex: settings.sex });
    const ppk = proteinPerKgFor(dir, settings.proteinPerKg);
    const macros = macroTargets({ targetKcal: floor.targetKcal, refWeight: ref.refWeight, proteinPerKg: ppk });
    const enoughForStatus = snapIdx >= MIN_DAYS_FOR_STATUS && snap.rate14;
    const status = enoughForStatus ? onTrack({ targetRateKgDay: tc.rateKgDay, rate: snap.rate14, energyPerKg: energy.energyPerKg }) : null;
    targets = {
      dir,
      requestedDir: settings.goalDir,
      ratePct,
      rateWarning: rateWarning(dir, ratePct),
      ...tc,
      mathTarget: tc.target,
      target: floor.targetKcal,
      floor,
      bmr: bmrNow,
      ref,
      proteinPerKg: ppk,
      macros,
      lowCarbNote: macros.lowCarb ? LOW_CARB_NOTE : null,
      status,
      eta: goals.weight != null && out.goalCheck.ok ? goalETA({ currentKg: snapTrendW, goalKg: goals.weight, dir, ratePct }) : null,
    };
  }

  // ---- safety: rapid loss across two consecutive weekly updates ----
  const lossNow = snapIdx >= MIN_DAYS_FOR_STATUS ? lossPctPerWeek(snap.rate14, snapTrendW) : null;
  const lossPrev = prev ? lossPctPerWeek(prev.rate14, prevTrendW) : null;
  const rapid = rapidLossWarning([lossPrev, lossNow]);

  // outliers caught by the filter's innovation check
  out.cleaning.kalmanIgnored = full.kalmanOutliers.map((t) => dates[t]);

  Object.assign(out, {
    guard,
    targets,
    rapid,
    lossPctWeek: { now: lossNow, prev: lossPrev },
    energy,
    energyWeeks: sched.weeks,
    bfNow,
    prior,
    formulaNow,
    regression: reg,
    agreement,
    snapshot: { date: snapDate, index: snapIdx, nextCheckin, weekday: wd },
    kalman: {
      start,
      end: today,
      days: n,
      tdee,
      rate14: snap.rate14,
      full: full.summary,
      params: snap.params,
      tuning: snap.tuning,
      tuningMode: snap.tuningMode,
      glycogen: snap.glycogen.reasons.map((r) => ({ ...r, date: dates[r.day] })),
      alreadyStable: settings.alreadyStable === true,
      history: dates.map((d, i) => ({
        date: d,
        smoothed: full.smoothedT[i].m,
        lo: full.smoothedT[i].m - Z95 * full.smoothedT[i].sd,
        hi: full.smoothedT[i].m + Z95 * full.smoothedT[i].sd,
        filtered: full.filteredT[i].m,
      })),
      completeDays: intake.filter((v) => v != null).length,
      weighIns: obs.filter((v) => v != null).length,
    },
  });
  out.insights = buildInsights(out);
  return out;
}

const r0 = (x) => Math.round(x);

/** Neutral, data-driven notes. */
export function buildInsights(m) {
  const ins = [];
  if (m.rapid) ins.push(m.rapid);
  for (const g of m.guard?.messages || []) ins.push(g);
  if (m.targets?.floor?.capped) ins.push({ tone: "warn", text: m.targets.floor.message });
  if (m.targets?.rateWarning) ins.push({ tone: "info", text: m.targets.rateWarning });
  if (m.week.completeDays < 4) {
    ins.push({ tone: "info", text: `${m.week.completeDays} of the last 7 days are marked complete. Only complete days count as known intake — the estimate still works, just with a wider range.` });
  }
  for (const mm of m.week.mismatches.slice(0, 2)) {
    ins.push({ tone: "info", text: `${mm.date}: macros add up to ~${r0(mm.macroKcal)} kcal vs ${r0(mm.kcal)} kcal logged (${r0(mm.gapPct * 100)}% apart). One of the numbers may be off.` });
  }
  const t = m.targets;
  if (t && m.week.avgProtein != null && m.week.avgProtein < t.macros.protein - 10) {
    ins.push({ tone: "info", text: `Protein averaged ${r0(m.week.avgProtein)} g on ${m.week.proteinDays} logged day(s) vs a ${r0(t.macros.protein)} g target.` });
  }
  if (t && m.week.avgFat != null && m.week.avgFat < t.macros.fat - 5) {
    ins.push({ tone: "info", text: `Fat averaged ${r0(m.week.avgFat)} g vs a ${r0(t.macros.fat)} g minimum (${t.macros.fatBasis}). Very low fat over long periods isn't recommended.` });
  }
  if (t?.lowCarbNote) ins.push({ tone: "info", text: t.lowCarbNote });
  if (t?.eta) {
    ins.push({ tone: "info", text: `At ${t.ratePct}% of body weight per week, the goal weight is roughly ${Math.ceil(t.eta.low)}–${Math.ceil(t.eta.high)} weeks away (central ${Math.ceil(t.eta.weeks)}). Weekly kg change shrinks as weight drops, and real progress varies.` });
  }
  return ins;
}

/** Short recommendation line for the nutrition card. */
export function recommendation(m, fmtW = (kg) => `${kg.toFixed(2)} kg`) {
  if (m.guard && !m.guard.allowTargets) return { tone: "hold", text: MSG.minor };
  if (!m.kalman) return { tone: "hold", text: m.reason };
  const t = m.targets;
  if (!t) return { tone: "hold", text: "Targets aren't available." };
  const tgt = `${Math.round(t.target / 10) * 10} kcal/day`;
  if (!t.status) {
    return { tone: "hold", text: `Suggested intake: ${tgt}. An on-track check needs ${MIN_DAYS_FOR_STATUS} days of data (day ${m.snapshot.index + 1} so far).` };
  }
  const r = m.kalman.rate14;
  const wk = (x) => fmtW(x * 7);
  const range = `${wk(r.lo)} to ${wk(r.hi)} per week`;
  if (t.status.onTrack) {
    return { tone: "hold", text: `On track. Your estimated rate (${range}) includes your target of ${wk(t.rateKgDay)}/week. Suggested intake: ${tgt}.` };
  }
  const adj = Math.round(t.status.adjustKcal / 10) * 10;
  const dirWord = adj < 0 ? "less" : "more";
  return {
    tone: adj < 0 ? "cut" : "add",
    text: `Your estimated rate (${range}) doesn't include your target of ${wk(t.rateKgDay)}/week. Eating about ${Math.abs(adj)} kcal/day ${dirWord} than recently would close the gap. Suggested intake: ${tgt}.`,
  };
}

export { ACTIVITY_LEVELS, energyPerKgFor };
