import React, { useState, useMemo, useRef, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// ---------- config ----------
const COMPOSITION = [
  { key: "weight", label: "Weight", unit: "kg", required: true, goodDir: "down" },
  { key: "bodyFat", label: "Body Fat", unit: "%", goodDir: "down" },
  { key: "fatMass", label: "Fat Mass", unit: "kg", goodDir: "down" },
  { key: "muscleMass", label: "Muscle Mass", unit: "kg", goodDir: "up" },
];

const TAPE = [
  { key: "neck", label: "Neck" },
  { key: "chest", label: "Chest" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "armL", label: "Arm L" },
  { key: "armR", label: "Arm R" },
  { key: "thighL", label: "Thigh L" },
  { key: "thighR", label: "Thigh R" },
  { key: "calfL", label: "Calf L" },
  { key: "calfR", label: "Calf R" },
].map((t) => ({ ...t, unit: "cm", goodDir: "neutral" }));

const ALL = [...COMPOSITION, ...TAPE];

// ---------- seed data (demo only — cleared in real build) ----------
const seed = [];

// recent daily calories/protein (empty for new users)
const seedFood = [];

// ---------- helpers ----------
const fmt = (n, d = 1) => (n == null || isNaN(n) ? "—" : Number(n).toFixed(d).replace(/\.0$/, ""));
const parse = (v) => (v === "" || v == null ? null : Number(v));
// signed display like "−1.2 kg" / "+0.3 kg"
const signed = (n, unit) => {
  if (n == null || isNaN(n)) return "—";
  const v = Number(n);
  const s = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${s}${fmt(Math.abs(v))}${unit === "%" ? "%" : " " + unit}`;
};
// color class: goodDir is which direction is good for this metric
const dirClass = (n, goodDir) => {
  if (n == null || Math.abs(n) < 0.05) return "mv-flat";
  const good = goodDir === "down" ? n < 0 : n > 0;
  return good ? "mv-good" : "mv-bad";
};

// ---------- persistence ----------
const LS = {
  load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
  },
};

function Ring({ pct, color, size = 128, stroke = 9, children }) {
  const clamped = Math.max(0, Math.min(1, Math.abs(pct)));
  const deg = clamped * 360;
  return (
    <div className="ringwrap" style={{ width: size, height: size }}>
      <div
        className="ringtrack"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${color} ${deg}deg, #1c2230 ${deg}deg 360deg)`,
        }}
      >
        <div className="ringhole" style={{ width: size - stroke * 2, height: size - stroke * 2 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [entries, setEntries] = useState(() => LS.load("bt_entries", seed));
  const [modal, setModal] = useState(null); // 'comp' | 'tape' | null
  const [chartKey, setChartKey] = useState(null);
  const [baseMode, setBaseMode] = useState("first"); // 'first' | 'last'
  const [range, setRange] = useState("all"); // '1m' | '3m' | '6m' | '1y' | 'all'
  const [goals, setGoals] = useState(() => LS.load("bt_goals", { weight: null, bodyFat: null }));
  const [goalDraft, setGoalDraft] = useState({});
  const [showGoals, setShowGoals] = useState(false);
  const [draft, setDraft] = useState({});
  const [tab, setTab] = useState("body"); // 'body' | 'nutrition'
  const [foodLog, setFoodLog] = useState(() => LS.load("bt_food", seedFood)); // [{id,date,calories,protein}]
  const [foodDraft, setFoodDraft] = useState({});
  const [showFood, setShowFood] = useState(false);
  const [nutriSettings, setNutriSettings] = useState(() => LS.load("bt_settings", { goalDir: "lose", rateKgWk: 0.5, proteinPerKg: 1.8, activityFactor: 1.45, height: 175, age: 25, sex: "male" }));
  const [showNutriSettings, setShowNutriSettings] = useState(false);
  const [nsDraft, setNsDraft] = useState({});
  const [showDetails, setShowDetails] = useState(false);
  const [showBodyAnalysis, setShowBodyAnalysis] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !LS.load("bt_seen_welcome", false));

  // persist to localStorage whenever data changes
  useEffect(() => { LS.save("bt_entries", entries); }, [entries]);
  useEffect(() => { LS.save("bt_food", foodLog); }, [foodLog]);
  useEffect(() => { LS.save("bt_goals", goals); }, [goals]);
  useEffect(() => { LS.save("bt_settings", nutriSettings); }, [nutriSettings]);

  const dismissWelcome = () => {
    LS.save("bt_seen_welcome", true);
    setShowWelcome(false);
  };

  const RANGES = [
    { key: "1m", label: "1M", months: 1 },
    { key: "3m", label: "3M", months: 3 },
    { key: "6m", label: "6M", months: 6 },
    { key: "1y", label: "1Y", months: 12 },
    { key: "all", label: "All", months: null },
  ];

  const sorted = useMemo(() => [...entries].sort((a, b) => a.date.localeCompare(b.date)), [entries]);
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const prev = sorted[sorted.length - 2];

  // filter chart data by selected range; start never earlier than first measurement
  const chartData = useMemo(() => {
    if (range === "all" || sorted.length === 0) return sorted;
    const months = RANGES.find((r) => r.key === range)?.months;
    if (!months) return sorted;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const filtered = sorted.filter((e) => e.date >= cutoffStr);
    // always keep at least the first point so the line has an anchor
    return filtered.length >= 2 ? filtered : sorted;
  }, [sorted, range]);

  // ---------- nutrition analysis ----------
  const KCAL_PER_KG = 7700; // energy in 1 kg body mass (approx)

  const nutrition = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const wkStr = weekAgo.toISOString().slice(0, 10);

    // last 7 days of food
    const recent = foodLog.filter((f) => f.date >= wkStr);
    const nDays = recent.length;
    const avgCals = nDays ? recent.reduce((s, f) => s + (f.calories || 0), 0) / nDays : null;
    const avgProt = nDays ? recent.reduce((s, f) => s + (f.protein || 0), 0) / nDays : null;
    // carbs/fat: average only over days they were actually logged
    const avgOver = (key) => {
      const logged = recent.filter((f) => f[key] != null);
      return logged.length ? logged.reduce((s, f) => s + f[key], 0) / logged.length : null;
    };
    const avgCarbs = avgOver("carbs");
    const avgFat = avgOver("fat");

    const bw = latest?.weight ?? null;
    const proteinTarget = bw ? bw * nutriSettings.proteinPerKg : null;
    // fat floor: 0.8 g/kg bodyweight (hormone/health minimum)
    const fatFloor = bw ? bw * 0.8 : null;

    // weight trend over the last ~2 weeks (kg/week) from actual weigh-ins
    const twoWk = new Date(today);
    twoWk.setDate(twoWk.getDate() - 16);
    const twoWkStr = twoWk.toISOString().slice(0, 10);
    const recentW = sorted.filter((e) => e.date >= twoWkStr && e.weight != null);
    let trendKgWk = null, trustTrend = false;
    if (recentW.length >= 2) {
      const a = recentW[0], b = recentW[recentW.length - 1];
      const days = (new Date(b.date) - new Date(a.date)) / 86400000;
      if (days >= 3) {
        trendKgWk = ((b.weight - a.weight) / days) * 7;
        trustTrend = true;
      }
    }

    // maintenance (TDEE): prefer trend-inferred, else Mifflin-St Jeor
    let tdee = null, tdeeMethod = null;
    if (trustTrend && avgCals != null) {
      // if losing X kg/wk on avgCals, maintenance = avgCals + energy deficit realized
      tdee = avgCals - (trendKgWk * KCAL_PER_KG) / 7;
      tdeeMethod = "measured";
    } else if (bw != null) {
      const { height, age, sex, activityFactor } = nutriSettings;
      const bmr = sex === "male"
        ? 10 * bw + 6.25 * height - 5 * age + 5
        : 10 * bw + 6.25 * height - 5 * age - 161;
      tdee = bmr * activityFactor;
      tdeeMethod = "estimated";
    }

    // target intake based on goal direction + rate
    const dir = nutriSettings.goalDir; // 'lose' | 'gain' | 'maintain'
    const rate = nutriSettings.rateKgWk;
    let targetCals = null;
    if (tdee != null) {
      if (dir === "lose") targetCals = tdee - (rate * KCAL_PER_KG) / 7;
      else if (dir === "gain") targetCals = tdee + (rate * KCAL_PER_KG) / 7;
      else targetCals = tdee;
    }

    // carb target = calories left after protein + fat, at the calorie target (protein/carbs 4 kcal/g, fat 9)
    let carbTarget = null;
    if (targetCals != null && proteinTarget != null && fatFloor != null) {
      const fatForCalc = avgFat != null ? Math.max(avgFat, fatFloor) : fatFloor;
      const remaining = targetCals - proteinTarget * 4 - fatForCalc * 9;
      carbTarget = remaining > 0 ? remaining / 4 : 0;
    }

    // recommendation
    let rec = null, recTone = "hold";
    if (avgCals != null && targetCals != null) {
      const diff = avgCals - targetCals; // + means eating above target
      const absd = Math.abs(diff);
      if (absd < 100) { rec = "You're on target. Keep intake steady."; recTone = "hold"; }
      else if (dir === "lose") {
        if (diff > 0) { rec = `Eating ~${Math.round(diff)} kcal/day above your loss target. Cut back to hit ${Math.round(rate * 1000) / 1000} kg/week.`; recTone = "cut"; }
        else { rec = `Eating ~${Math.round(absd)} kcal/day below target — you may be losing faster than planned. Consider eating a bit more to protect muscle.`; recTone = "add"; }
      } else if (dir === "gain") {
        if (diff < 0) { rec = `Eating ~${Math.round(absd)} kcal/day below your gain target. Add food to support muscle gain.`; recTone = "add"; }
        else { rec = `Eating ~${Math.round(diff)} kcal/day above target — surplus may add more fat than needed. Trim slightly.`; recTone = "cut"; }
      } else {
        rec = diff > 0 ? `~${Math.round(diff)} kcal/day above maintenance. Trim slightly to hold weight.` : `~${Math.round(absd)} kcal/day below maintenance. Add a little to hold weight.`;
        recTone = diff > 0 ? "cut" : "add";
      }
    }

    // protein flag
    let proteinNote = null, proteinOk = true;
    if (avgProt != null && proteinTarget != null) {
      if (avgProt < proteinTarget - 5) { proteinNote = `Protein low: ${Math.round(avgProt)}g vs ${Math.round(proteinTarget)}g target. Raise it to protect muscle in a deficit.`; proteinOk = false; }
      else { proteinNote = `Protein on point: ${Math.round(avgProt)}g vs ${Math.round(proteinTarget)}g target.`; proteinOk = true; }
    }

    // fat flag: check against 0.8 g/kg floor
    let fatNote = null, fatOk = true;
    if (avgFat != null && fatFloor != null) {
      if (avgFat < fatFloor - 3) { fatNote = `Fat low: ${Math.round(avgFat)}g vs ~${Math.round(fatFloor)}g minimum (0.8 g/kg). Very low fat over time can hurt hormones — bring it up.`; fatOk = false; }
      else { fatNote = `Fat adequate: ${Math.round(avgFat)}g (floor ~${Math.round(fatFloor)}g).`; fatOk = true; }
    }

    // carb flag: compare to remaining-calorie target
    let carbNote = null, carbOk = true;
    if (avgCarbs != null && carbTarget != null) {
      if (carbTarget < 50) { carbNote = `Your protein and fat targets leave little room for carbs (~${Math.round(carbTarget)}g). Fine short-term, but low carbs can flatten training — consider a small calorie bump or less fat.`; carbOk = false; }
      else if (avgCarbs < carbTarget - 40) { carbNote = `Carbs on the low side: ${Math.round(avgCarbs)}g vs ~${Math.round(carbTarget)}g available. If training feels flat, shift some fat calories to carbs.`; carbOk = false; }
      else { carbNote = `Carbs in range: ${Math.round(avgCarbs)}g vs ~${Math.round(carbTarget)}g available.`; carbOk = true; }
    }

    // sanity: do logged macros roughly match logged calories?
    let macroMismatch = null;
    if (avgProt != null && avgCarbs != null && avgFat != null && avgCals != null) {
      const macroKcal = avgProt * 4 + avgCarbs * 4 + avgFat * 9;
      const gap = Math.abs(macroKcal - avgCals);
      if (gap > avgCals * 0.15) {
        macroMismatch = `Your logged macros add up to ~${Math.round(macroKcal)} kcal but you logged ~${Math.round(avgCals)} kcal — a ${Math.round((gap / avgCals) * 100)}% gap. One of the numbers is likely off.`;
      }
    }

    // ---------- data-driven insights ----------
    const insights = [];

    // 1. logging quality gate
    if (nDays > 0 && nDays < 4) {
      insights.push({ tone: "warn", text: `Only ${nDays} day${nDays === 1 ? "" : "s"} logged this week. Averages and recommendations are unreliable below ~4 days — log more for accuracy.` });
    }

    // 2. deficit vs actual loss mismatch (needs both trend + intake + tdee)
    if (trustTrend && avgCals != null && tdee != null) {
      const impliedRate = ((tdee - avgCals) * 7) / KCAL_PER_KG; // expected kg/wk loss (+ = losing)
      const actualLoss = -trendKgWk; // + = losing
      const gap = actualLoss - impliedRate;
      if (Math.abs(gap) >= 0.3) {
        if (gap < 0) {
          insights.push({ tone: "warn", text: `Your intake implies ~${fmt(impliedRate, 2)} kg/week loss but the scale shows ~${fmt(actualLoss, 2)}. Likely water retention, under-logged calories, or your maintenance estimate is high. Give it another week before changing anything.` });
        } else {
          insights.push({ tone: "info", text: `You're losing faster than your intake implies (~${fmt(actualLoss, 2)} vs ~${fmt(impliedRate, 2)} kg/week). Often glycogen/water early on — expect it to settle.` });
        }
      }
    }

    // 3. muscle loss warning (needs 2 comp entries with muscle + fat)
    const compW = sorted.filter((e) => e.muscleMass != null && e.fatMass != null);
    if (compW.length >= 2) {
      const a = compW[0], b = compW[compW.length - 1];
      const dMuscle = b.muscleMass - a.muscleMass;
      const dFat = b.fatMass - a.fatMass;
      const totalLoss = (a.weight ?? 0) - (b.weight ?? 0);
      if (totalLoss > 0.5) {
        const muscleShare = -dMuscle / totalLoss; // fraction of lost weight that was muscle
        if (dMuscle < 0 && muscleShare > 0.35) {
          insights.push({ tone: "warn", text: `About ${Math.round(muscleShare * 100)}% of your weight loss has been muscle. That's high — slow the deficit, push protein toward 2.0 g/kg, and keep resistance training hard.` });
        } else if (dMuscle >= 0 && dFat < 0) {
          insights.push({ tone: "good", text: `Fat down, muscle holding or up — this is exactly what you want. Keep the current approach.` });
        }
      }
    }

    // 4. waist vs weight divergence (recomp signal)
    const waistW = sorted.filter((e) => e.waist != null && e.weight != null);
    if (waistW.length >= 2) {
      const a = waistW[0], b = waistW[waistW.length - 1];
      const dWaist = b.waist - a.waist;
      const dW = b.weight - a.weight;
      if (Math.abs(dW) < 1 && dWaist <= -1.5) {
        insights.push({ tone: "good", text: `Weight is flat but your waist dropped ${fmt(Math.abs(dWaist))} cm — that's recomposition (losing fat, holding mass). The scale is hiding real progress here.` });
      }
    }

    // 5. rate too aggressive vs setting
    if (trustTrend && nutriSettings.goalDir === "lose") {
      const actualLoss = -trendKgWk;
      if (actualLoss > nutriSettings.rateKgWk + 0.35 && actualLoss > 0) {
        insights.push({ tone: "warn", text: `You're losing ~${fmt(actualLoss, 2)} kg/week vs your ${fmt(nutriSettings.rateKgWk, 2)} target. Faster isn't better — it costs muscle. Add ~${Math.round(((actualLoss - nutriSettings.rateKgWk) * KCAL_PER_KG) / 7)} kcal/day.` });
      }
    }

    // 6. protein day-consistency
    if (proteinTarget != null && recent.length >= 3) {
      const under = recent.filter((f) => f.protein != null && f.protein < proteinTarget - 10).length;
      if (under >= Math.ceil(recent.length / 2)) {
        insights.push({ tone: "warn", text: `Protein was under target on ${under} of ${recent.length} logged days. Consistency matters more than the weekly average — aim to hit it daily.` });
      }
    }

    // 7. goal ETA
    const etas = [];
    if (trustTrend) {
      if (goals.weight != null && latest?.weight != null && trendKgWk < -0.02) {
        const wk = (latest.weight - goals.weight) / -trendKgWk;
        if (wk > 0) etas.push(`goal weight in ~${Math.ceil(wk)} week${Math.ceil(wk) === 1 ? "" : "s"}`);
      }
    }
    if (etas.length) insights.push({ tone: "info", text: `At your current rate: ${etas.join(", ")}.` });

    // 8. macro-specific insights
    if (macroMismatch) insights.push({ tone: "warn", text: macroMismatch });
    if (fatNote && !fatOk) insights.push({ tone: "warn", text: fatNote });
    if (carbNote && !carbOk) insights.push({ tone: "warn", text: carbNote });

    return { nDays, avgCals, avgProt, avgCarbs, avgFat, proteinTarget, fatFloor, carbTarget, fatNote, fatOk, carbNote, carbOk, trendKgWk, trustTrend, tdee, tdeeMethod, targetCals, rec, recTone, proteinNote, proteinOk, insights, bw, recentWCount: recentW.length, rate: nutriSettings.rateKgWk, dir: nutriSettings.goalDir };
  }, [foodLog, sorted, latest, nutriSettings, goals]);

  // ---------- body composition analysis (measured, BIA-aware, tape cross-checked) ----------
  const bodyAnalysis = useMemo(() => {
    if (sorted.length < 2) {
      return { status: "insufficient", headline: "Need at least two entries", detail: "Log a second weigh-in (ideally a week or more apart) so trends can be measured. A single reading can't show direction." };
    }
    const a = sorted[0];
    const b = sorted[sorted.length - 1];
    const days = (new Date(b.date) - new Date(a.date)) / 86400000;

    const has = (e, k) => e[k] != null;
    const d = (k) => (has(a, k) && has(b, k) ? b[k] - a[k] : null);

    const dWeight = d("weight");
    const dFat = d("fatMass");
    const dMuscle = d("muscleMass");
    const dBF = d("bodyFat");
    const dWaist = d("waist");

    // signals: -1 fat down / muscle down, +1 up, 0 flat. threshold to ignore noise.
    const sig = (v, thresh) => (v == null ? null : Math.abs(v) < thresh ? 0 : v > 0 ? 1 : -1);
    const fatSig = sig(dFat, 0.4);       // kg
    const muscleSig = sig(dMuscle, 0.3);  // kg (BIA noisy, higher bar)
    const waistSig = sig(dWaist, 1.0);    // cm — most reliable fat signal

    // does tape agree with scale on fat direction?
    // fat down should show as waist down. muscle up often shows as limbs up, waist stable.
    let agreement = "unknown";
    if (fatSig != null && waistSig != null) {
      if (fatSig <= 0 && waistSig <= 0 && (fatSig < 0 || waistSig < 0)) agreement = "agree-loss";
      else if (fatSig >= 0 && waistSig >= 0 && (fatSig > 0 || waistSig > 0)) agreement = "agree-gain";
      else if (fatSig !== waistSig) agreement = "conflict";
      else agreement = "flat";
    }

    // classify phase
    let status = "unclear", headline = "", detail = "", tone = "hold", change = null;
    const fatDown = fatSig === -1 || waistSig === -1;
    const muscleUp = muscleSig === 1;
    const muscleDown = muscleSig === -1;

    if (fatDown && muscleUp) {
      status = "recomp"; tone = "good";
      headline = "Recomposition — losing fat, gaining muscle";
      detail = "Both directions are moving the right way at once. This is the ideal outcome and usually only sustained by beginners, returnees, or those with higher body fat. Don't change anything that's working.";
    } else if (fatDown && !muscleDown) {
      status = "cut"; tone = "good";
      headline = "Losing fat, holding muscle";
      detail = "Fat is coming off while muscle stays put — exactly what a good cut looks like. Keep protein high and training hard to hold that muscle.";
    } else if (fatDown && muscleDown) {
      status = "cut-muscle-loss"; tone = "warn";
      const share = dWeight && dWeight < 0 ? Math.round((-dMuscle / -dWeight) * 100) : null;
      headline = "Losing fat, but also losing muscle";
      detail = `You're dropping fat but muscle is falling too${share != null ? ` (~${share}% of lost weight)` : ""}. That's the sign of too aggressive a deficit or too little protein/training stimulus.`;
      change = "Slow the deficit (smaller weekly loss target), push protein toward 2.0 g/kg, and make sure you're training with enough intensity.";
    } else if (!fatDown && muscleUp) {
      status = "gain"; tone = "info";
      headline = "Gaining muscle, fat not dropping";
      detail = "Muscle is up but fat isn't coming down — consistent with a surplus or maintenance bulk. Fine if you're intentionally building.";
      if (fatSig === 1) change = "If you didn't intend to add fat, trim the surplus slightly so more of the gain is lean.";
    } else if (fatSig === 1 && !muscleUp) {
      status = "gain-fat"; tone = "warn";
      headline = "Gaining fat without muscle";
      detail = "Fat is up and muscle isn't following. If you're bulking, the surplus is too large or training/protein is lacking.";
      change = "Cut the surplus back, prioritize protein and progressive training, or switch to a slight deficit if you didn't mean to bulk.";
    } else {
      status = "flat"; tone = "hold";
      headline = "Holding steady";
      detail = "No meaningful change in fat or muscle across this span. If you have a goal, that means your current intake is at maintenance — adjust calories to start moving.";
    }

    // confidence based on BIA noise + tape agreement + time span
    let confidence = "medium", confNote = "";
    if (agreement === "conflict") {
      confidence = "low";
      confNote = "Your scale's body-fat reading and your waist measurement disagree here. BIA scales are noisy (hydration alone swings them 1–2%). Trust the waist trend more, and re-check in a week.";
    } else if (agreement === "agree-loss" || agreement === "agree-gain") {
      confidence = "high";
      confNote = "Scale and tape agree, so this reading is trustworthy.";
    } else if (days < 14) {
      confidence = "low";
      confNote = "Short time span — give it two weeks or more for BIA noise to average out.";
    } else {
      confNote = "Based on measured trends; BIA muscle/fat numbers carry some noise, so watch the direction over multiple readings rather than any single one.";
    }

    return {
      status, headline, detail, tone, change, confidence, confNote, days: Math.round(days),
      dWeight, dFat, dMuscle, dBF, dWaist, agreement,
      from: a.date, to: b.date,
    };
  }, [sorted]);

  const openAdd = (type) => {
    setDraft({ date: new Date().toISOString().slice(0, 10) });
    setModal(type);
  };

  const saveEntry = () => {
    if (modal === "comp" && (draft.weight == null || draft.weight === "")) {
      alert("Weight is required.");
      return;
    }
    const clean = { id: Date.now(), date: draft.date || new Date().toISOString().slice(0, 10) };
    ALL.forEach((m) => {
      if (draft[m.key] !== undefined) clean[m.key] = parse(draft[m.key]);
    });
    // auto fat mass if blank
    if ((clean.fatMass == null) && clean.weight != null && clean.bodyFat != null) {
      clean.fatMass = +(clean.weight * (clean.bodyFat / 100)).toFixed(1);
    }
    setEntries((e) => [...e, clean]);
    setModal(null);
  };

  const delta = (key, mode) => {
    if (!latest || latest[key] == null) return null;
    const base = mode === "first" ? first : prev;
    if (!base || base[key] == null || base.id === latest.id) return null;
    return latest[key] - base[key];
  };

  // pct of ring fill = magnitude of change relative to baseline value
  const ringPct = (key, mode) => {
    const d = delta(key, mode);
    const base = mode === "first" ? first : prev;
    if (d == null || !base || !base[key]) return 0;
    return d / base[key];
  };

  const colorFor = (m, d) => {
    if (d == null || d === 0) return "#5b6472";
    if (m.goodDir === "neutral") return "#5aa9e6";
    const good = m.goodDir === "down" ? d < 0 : d > 0;
    return good ? "#3ddc84" : "#ff5c72";
  };

  const GOAL_COLOR = "#3ddc84";     // progressing toward goal
  const OVERSHOOT_COLOR = "#22d3ee"; // passed the goal
  const NOGOAL_COLOR = "#5aa9e6";    // goal-capable metric with no goal set

  const hasGoal = (key) => goals[key] != null;

  // progress 0..1 from first measurement toward goal; can exceed 1 (overshoot)
  const goalProgress = (key) => {
    const target = goals[key];
    if (target == null || !first || first[key] == null || !latest) return 0;
    const start = first[key];
    const now = latest[key];
    if (start === target) return now === target ? 1 : 0;
    return (start - now) / (start - target);
  };

  // decide ring fill + color for a composition metric
  const ringFor = (m) => {
    if (m.key === "weight" || m.key === "bodyFat") {
      if (!hasGoal(m.key)) {
        // goal-capable but no goal: full solid blue circle
        return { pct: 1, color: NOGOAL_COLOR };
      }
      const p = goalProgress(m.key);
      if (p >= 1) return { pct: 1, color: OVERSHOOT_COLOR };
      return { pct: Math.max(0, p), color: GOAL_COLOR };
    }
    // other metrics: unchanged behavior
    const d = delta(m.key, baseMode);
    return { pct: ringPct(m.key, baseMode), color: colorFor(m, d) };
  };

  const saveGoals = () => {
    setGoals({
      weight: goalDraft.weight === "" || goalDraft.weight == null ? null : Number(goalDraft.weight),
      bodyFat: goalDraft.bodyFat === "" || goalDraft.bodyFat == null ? null : Number(goalDraft.bodyFat),
    });
    setShowGoals(false);
  };

  const openGoals = () => {
    setGoalDraft({ weight: goals.weight ?? "", bodyFat: goals.bodyFat ?? "" });
    setShowGoals(true);
  };

  const openFood = () => {
    setFoodDraft({ date: new Date().toISOString().slice(0, 10) });
    setShowFood(true);
  };

  const saveFood = () => {
    if (foodDraft.calories == null || foodDraft.calories === "") { alert("Calories are required."); return; }
    const date = foodDraft.date || new Date().toISOString().slice(0, 10);
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const entry = { id: Date.now(), date, calories: Number(foodDraft.calories), protein: num(foodDraft.protein), carbs: num(foodDraft.carbs), fat: num(foodDraft.fat) };
    // replace same-date entry if exists, else add
    setFoodLog((log) => {
      const others = log.filter((f) => f.date !== date);
      return [...others, entry];
    });
    setShowFood(false);
  };

  const openNutriSettings = () => {
    setNsDraft({ ...nutriSettings });
    setShowNutriSettings(true);
  };

  const saveNutriSettings = () => {
    setNutriSettings({
      goalDir: nsDraft.goalDir || "lose",
      rateKgWk: Number(nsDraft.rateKgWk) || 0.5,
      proteinPerKg: Number(nsDraft.proteinPerKg) || 1.8,
      activityFactor: Number(nsDraft.activityFactor) || 1.45,
      height: Number(nsDraft.height) || 175,
      age: Number(nsDraft.age) || 25,
      sex: nsDraft.sex || "male",
    });
    setShowNutriSettings(false);
  };

  return (
    <div className="app">
      <style>{css}</style>

      {/* first-time welcome */}
      {showWelcome && (
        <div className="welcome" onClick={dismissWelcome}>
          <div className="welcomecard" onClick={(e) => e.stopPropagation()}>
            <div className="wlogo">◐</div>
            <h2 className="wtitle">Welcome to BodyTracker</h2>
            <p className="wlead">A private tracker for your weight, body composition, and nutrition. Everything stays on your device — no account, no cloud.</p>
            <div className="wfeatures">
              <div className="wfeat"><b>Track your body</b><span>Log weight, body fat, fat &amp; muscle mass, and tape measurements. Only weight is required.</span></div>
              <div className="wfeat"><b>See what's changing</b><span>Rings show progress from your first entry or last one; set goals for weight and body fat. Tap any ring for its trend.</span></div>
              <div className="wfeat"><b>Understand your composition</b><span>Once you have two entries, the app reads whether you're losing fat, building muscle, or both — cross-checking your scale against your tape measurements.</span></div>
              <div className="wfeat"><b>Guide your nutrition</b><span>Log daily calories and protein. The app learns your real maintenance from your weight trend and tells you whether to eat more or less.</span></div>
            </div>
            <p className="wnote">Your numbers from a smart scale are treated as noisy but useful — the app is honest about confidence and never predicts what it can't measure.</p>
            <button className="wbtn" onClick={dismissWelcome}>Start tracking</button>
          </div>
        </div>
      )}

      <header className="top">
        <div>
          <div className="eyebrow">{tab === "body" ? "Body Composition" : "Nutrition"}</div>
          <h1>{tab === "body" ? "Progress" : "Intake"}</h1>
        </div>
        <div className="headright">
          {tab === "body" ? (
            <>
              <div className="basetoggle">
                <button className={baseMode === "first" ? "on" : ""} onClick={() => setBaseMode("first")}>vs First</button>
                <button className={baseMode === "last" ? "on" : ""} onClick={() => setBaseMode("last")}>vs Last</button>
              </div>
              <button className="gear" onClick={openGoals} aria-label="Set goals">⚙</button>
            </>
          ) : (
            <button className="gear" onClick={openNutriSettings} aria-label="Nutrition settings">⚙</button>
          )}
        </div>
      </header>

      {tab === "body" && (sorted.length === 0 ? (
        <div className="empty">No entries yet. Add your first weigh-in to start tracking.</div>
      ) : (
        <>
          <button className="analysiscard" data-tone={bodyAnalysis.tone} onClick={() => setShowBodyAnalysis(true)}>
            <div className="anrow">
              <div className="anlabel">Body composition</div>
              {bodyAnalysis.status !== "insufficient" && (
                <div className={`anconf ${bodyAnalysis.confidence}`}>{bodyAnalysis.confidence} confidence</div>
              )}
            </div>
            <div className="anhead">{bodyAnalysis.headline}</div>
            <div className="anhint">Tap for the full breakdown →</div>
          </button>

          <section className="grid">
            {COMPOSITION.map((m) => {
              const d = delta(m.key, baseMode);
              const ring = ringFor(m);
              const goalSet = (m.key === "weight" || m.key === "bodyFat") && hasGoal(m.key);
              const overshot = goalSet && goalProgress(m.key) >= 1;
              return (
                <button key={m.key} className="card" onClick={() => setChartKey(m.key)}>
                  <Ring pct={ring.pct} color={ring.color}>
                    <div className="ringinner">
                      <div className="val">{fmt(latest[m.key])}</div>
                      <div className="u">{m.unit}</div>
                    </div>
                  </Ring>
                  <div className="clabel">{m.label}</div>
                  {goalSet ? (
                    <div className="cdelta" style={{ color: ring.color }}>
                      {overshot ? "✓ goal " : `${Math.round(Math.max(0, goalProgress(m.key)) * 100)}% → `}{fmt(goals[m.key])}{m.unit === "%" ? "%" : " " + m.unit}
                    </div>
                  ) : (
                    <div className="cdelta" style={{ color: ring.color }}>
                      {d == null ? "—" : `${d > 0 ? "▲" : d < 0 ? "▼" : "•"} ${fmt(Math.abs(d))}${m.unit === "%" ? "%" : " " + m.unit}`}
                    </div>
                  )}
                </button>
              );
            })}
          </section>

          <div className="sectlabel">Tape measurements</div>
          <section className="grid tape">
            {TAPE.map((m) => {
              const d = delta(m.key, baseMode);
              const col = colorFor(m, d);
              return (
                <button key={m.key} className="card sm" onClick={() => setChartKey(m.key)}>
                  <Ring pct={ringPct(m.key, baseMode)} color={col} size={92} stroke={7}>
                    <div className="ringinner">
                      <div className="val sm">{fmt(latest[m.key])}</div>
                      <div className="u">cm</div>
                    </div>
                  </Ring>
                  <div className="clabel sm">{m.label}</div>
                  <div className="cdelta sm" style={{ color: col }}>
                    {d == null ? "—" : `${d > 0 ? "▲" : d < 0 ? "▼" : "•"} ${fmt(Math.abs(d))}`}
                  </div>
                </button>
              );
            })}
          </section>
        </>
      ))}

      {tab === "nutrition" && (
        <>
          <div className="reccard" data-tone={nutrition.recTone || "hold"}>
            <div className="reclabel">Recommendation</div>
            <div className="rectext">{nutrition.rec || "Log a few days of calories to get a recommendation."}</div>
            <button className="explainbtn" onClick={() => setShowDetails(true)}>Explain the math →</button>
          </div>

          {nutrition.insights && nutrition.insights.length > 0 && (
            <div className="insights">
              <div className="sectlabel" style={{ margin: "0 4px 10px" }}>Insights</div>
              {nutrition.insights.map((ins, i) => (
                <div key={i} className={`insight ${ins.tone}`}>
                  <span className="idot" />
                  <span>{ins.text}</span>
                </div>
              ))}
            </div>
          )}

          <section className="statgrid">
            <div className="stat">
              <div className="statnum">{nutrition.avgCals != null ? Math.round(nutrition.avgCals) : "—"}</div>
              <div className="statlab">avg kcal / day<br/><small>last {nutrition.nDays || 0} days</small></div>
            </div>
            <div className="stat">
              <div className="statnum">{nutrition.targetCals != null ? Math.round(nutrition.targetCals) : "—"}</div>
              <div className="statlab">target kcal / day<br/><small>{nutriSettings.goalDir}</small></div>
            </div>
            <div className="stat">
              <div className="statnum">{nutrition.tdee != null ? Math.round(nutrition.tdee) : "—"}</div>
              <div className="statlab">maintenance<br/><small>{nutrition.tdeeMethod || "—"}</small></div>
            </div>
            <div className="stat">
              <div className="statnum" style={{ color: nutrition.trendKgWk == null ? "#e8ecf2" : nutrition.trendKgWk < 0 ? "#3ddc84" : "#ff5c72" }}>
                {nutrition.trendKgWk != null ? `${nutrition.trendKgWk > 0 ? "+" : ""}${fmt(nutrition.trendKgWk, 2)}` : "—"}
              </div>
              <div className="statlab">kg / week<br/><small>weight trend</small></div>
            </div>
          </section>

          <div className={`protcard ${nutrition.proteinOk ? "ok" : "low"}`}>
            <div className="protrow">
              <span>Protein</span>
              <strong>{nutrition.avgProt != null ? Math.round(nutrition.avgProt) : "—"}g <small>/ {nutrition.proteinTarget != null ? Math.round(nutrition.proteinTarget) : "—"}g</small></strong>
            </div>
            {nutrition.proteinNote && <div className="protnote">{nutrition.proteinNote}</div>}
          </div>

          <div className="macrogrid">
            <div className={`macro ${nutrition.carbOk ? "" : "low"}`}>
              <div className="macronum">{nutrition.avgCarbs != null ? Math.round(nutrition.avgCarbs) : "—"}<span>g</span></div>
              <div className="macrolab">carbs <small>/ {nutrition.carbTarget != null ? Math.round(nutrition.carbTarget) : "—"}g</small></div>
            </div>
            <div className={`macro ${nutrition.fatOk ? "" : "low"}`}>
              <div className="macronum">{nutrition.avgFat != null ? Math.round(nutrition.avgFat) : "—"}<span>g</span></div>
              <div className="macrolab">fat <small>/ ≥{nutrition.fatFloor != null ? Math.round(nutrition.fatFloor) : "—"}g</small></div>
            </div>
          </div>

          {nutrition.fatNote && <div className={`macronote ${nutrition.fatOk ? "ok" : "low"}`}>{nutrition.fatNote}</div>}
          {nutrition.carbNote && <div className={`macronote ${nutrition.carbOk ? "ok" : "low"}`}>{nutrition.carbNote}</div>}

          {nutrition.tdeeMethod === "estimated" && (
            <div className="notecard">Maintenance is a formula estimate right now. Once you have 2+ weigh-ins spanning several days in the same week you log food, it switches to a measured value based on your actual weight trend — far more accurate.</div>
          )}

          <div className="sectlabel">Recent days</div>
          <div className="foodlist">
            {[...foodLog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map((f) => (
              <div key={f.id} className="foodrow">
                <span className="fdate">{f.date.slice(5)}</span>
                <span className="fcal">{f.calories} kcal</span>
                <span className="fmacros">
                  {f.protein != null ? `${f.protein}P` : ""}{f.carbs != null ? ` ${f.carbs}C` : ""}{f.fat != null ? ` ${f.fat}F` : ""}
                  {f.protein == null && f.carbs == null && f.fat == null ? "—" : ""}
                </span>
              </div>
            ))}
            {foodLog.length === 0 && <div className="empty" style={{ padding: "30px 0" }}>No calories logged yet.</div>}
          </div>
        </>
      )}

      {/* nutrition settings sheet */}
      {showNutriSettings && (
        <div className="sheet" onClick={() => setShowNutriSettings(false)}>
          <div className="sheetinner" onClick={(e) => e.stopPropagation()}>
            <div className="sheettop">
              <h2>Nutrition settings</h2>
              <button className="x" onClick={() => setShowNutriSettings(false)}>✕</button>
            </div>
            <label className="fld">
              <span>Goal</span>
              <div className="segrow">
                {["lose", "maintain", "gain"].map((g) => (
                  <button key={g} type="button" className={nsDraft.goalDir === g ? "seg on" : "seg"} onClick={() => setNsDraft({ ...nsDraft, goalDir: g })}>{g}</button>
                ))}
              </div>
            </label>
            <label className="fld">
              <span>Weekly rate <small>kg/week</small></span>
              <input type="number" inputMode="decimal" step="0.05" value={nsDraft.rateKgWk ?? ""} onChange={(e) => setNsDraft({ ...nsDraft, rateKgWk: e.target.value })} />
            </label>
            <label className="fld">
              <span>Protein per kg bodyweight <small>g/kg</small></span>
              <input type="number" inputMode="decimal" step="0.1" value={nsDraft.proteinPerKg ?? ""} onChange={(e) => setNsDraft({ ...nsDraft, proteinPerKg: e.target.value })} />
            </label>
            <p className="hint" style={{ margin: "-4px 0 12px" }}>1.6 is the minimum; 1.8–2.2 is better while losing fat.</p>
            <div className="tapegrid">
              <label className="fld">
                <span>Height <small>cm</small></span>
                <input type="number" inputMode="decimal" value={nsDraft.height ?? ""} onChange={(e) => setNsDraft({ ...nsDraft, height: e.target.value })} />
              </label>
              <label className="fld">
                <span>Age</span>
                <input type="number" inputMode="decimal" value={nsDraft.age ?? ""} onChange={(e) => setNsDraft({ ...nsDraft, age: e.target.value })} />
              </label>
            </div>
            <label className="fld">
              <span>Sex <small>for formula fallback</small></span>
              <div className="segrow">
                {["male", "female"].map((s) => (
                  <button key={s} type="button" className={nsDraft.sex === s ? "seg on" : "seg"} onClick={() => setNsDraft({ ...nsDraft, sex: s })}>{s}</button>
                ))}
              </div>
            </label>
            <label className="fld">
              <span>Activity factor <small>1.2 sedentary – 1.7 very active</small></span>
              <input type="number" inputMode="decimal" step="0.05" value={nsDraft.activityFactor ?? ""} onChange={(e) => setNsDraft({ ...nsDraft, activityFactor: e.target.value })} />
            </label>
            <button className="save" onClick={saveNutriSettings}>Save settings</button>
          </div>
        </div>
      )}

      {/* body composition analysis sheet */}
      {showBodyAnalysis && (
        <div className="sheet" onClick={() => setShowBodyAnalysis(false)}>
          <div className="sheetinner" onClick={(e) => e.stopPropagation()}>
            <div className="sheettop">
              <h2>Body composition</h2>
              <button className="x" onClick={() => setShowBodyAnalysis(false)}>✕</button>
            </div>

            {bodyAnalysis.status === "insufficient" ? (
              <p className="detbody">{bodyAnalysis.detail}</p>
            ) : (
              <>
                <div className="reccard" data-tone={bodyAnalysis.tone} style={{ marginBottom: 16 }}>
                  <div className="reclabel">Current phase · {bodyAnalysis.days} days</div>
                  <div className="rectext">{bodyAnalysis.headline}</div>
                </div>

                <p className="detbody" style={{ marginBottom: 16 }}>{bodyAnalysis.detail}</p>

                {bodyAnalysis.change && (
                  <div className="insight warn" style={{ marginBottom: 16 }}>
                    <span className="idot" />
                    <span><b>Change something:</b> {bodyAnalysis.change}</span>
                  </div>
                )}

                <div className="detlabel">What moved ({bodyAnalysis.from.slice(5)} → {bodyAnalysis.to.slice(5)})</div>
                <div className="movegrid">
                  <div className="moverow"><span>Weight</span><b className={dirClass(bodyAnalysis.dWeight, "down")}>{signed(bodyAnalysis.dWeight, "kg")}</b></div>
                  <div className="moverow"><span>Fat mass</span><b className={dirClass(bodyAnalysis.dFat, "down")}>{signed(bodyAnalysis.dFat, "kg")}</b></div>
                  <div className="moverow"><span>Muscle mass</span><b className={dirClass(bodyAnalysis.dMuscle, "up")}>{signed(bodyAnalysis.dMuscle, "kg")}</b></div>
                  <div className="moverow"><span>Body fat</span><b className={dirClass(bodyAnalysis.dBF, "down")}>{signed(bodyAnalysis.dBF, "%")}</b></div>
                  <div className="moverow"><span>Waist</span><b className={dirClass(bodyAnalysis.dWaist, "down")}>{signed(bodyAnalysis.dWaist, "cm")}</b></div>
                </div>

                <div className={`protcard ${bodyAnalysis.confidence === "low" ? "low" : "ok"}`} style={{ marginTop: 16 }}>
                  <div className="protrow"><span>Confidence</span><strong style={{ textTransform: "capitalize" }}>{bodyAnalysis.confidence}</strong></div>
                  <div className="protnote">{bodyAnalysis.confNote}</div>
                </div>

                <div className="detnote" style={{ marginTop: 16 }}>
                  Your body-fat and muscle numbers come from a BIA smart scale, which is directionally useful but noisy. This analysis cross-checks them against your waist and other tape measurements — when they agree, confidence is high; when they conflict, it says so and leans on the tape data rather than guessing.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* details / explain sheet */}
      {showDetails && (
        <div className="sheet" onClick={() => setShowDetails(false)}>
          <div className="sheetinner" onClick={(e) => e.stopPropagation()}>
            <div className="sheettop">
              <h2>How this was calculated</h2>
              <button className="x" onClick={() => setShowDetails(false)}>✕</button>
            </div>

            <div className="detblock">
              <div className="detlabel">1 · Your intake</div>
              <div className="detbody">
                {nutrition.avgCals != null ? (
                  <>Averaged <b>{Math.round(nutrition.avgCals)} kcal/day</b> across the <b>{nutrition.nDays}</b> day{nutrition.nDays === 1 ? "" : "s"} you logged in the last week{nutrition.avgProt != null ? <>, with <b>{Math.round(nutrition.avgProt)}g protein/day</b></> : ""}.{nutrition.nDays < 4 ? " Fewer than 4 days means these numbers are shaky — log more." : ""}</>
                ) : "No calories logged in the last 7 days yet."}
              </div>
            </div>

            <div className="detblock">
              <div className="detlabel">2 · Maintenance (TDEE)</div>
              <div className="detbody">
                {nutrition.tdee == null ? "Needs your weight, or intake + weight trend, to estimate." :
                 nutrition.tdeeMethod === "measured" ? (
                  <>Measured from your body's actual response — the accurate way. You averaged <b>{Math.round(nutrition.avgCals)} kcal</b> and your weight moved <b>{fmt(nutrition.trendKgWk, 2)} kg/week</b>. One kg of body mass ≈ 7,700 kcal, so:<br/><span className="mono">{Math.round(nutrition.avgCals)} − ({fmt(nutrition.trendKgWk, 2)} × 7700 ÷ 7) = <b>{Math.round(nutrition.tdee)} kcal</b></span></>
                 ) : (
                  <>Formula estimate (Mifflin-St Jeor × activity), used because there isn't enough weight-trend data yet ({nutrition.recentWCount} recent weigh-in{nutrition.recentWCount === 1 ? "" : "s"}). Result: <b>{Math.round(nutrition.tdee)} kcal</b>. This switches to the measured method once you have 2+ weigh-ins several days apart while logging food.</>
                 )}
              </div>
            </div>

            <div className="detblock">
              <div className="detlabel">3 · Your target</div>
              <div className="detbody">
                {nutrition.targetCals == null ? "Set once maintenance is known." : (
                  <>Goal is to <b>{nutrition.dir}</b>{nutrition.dir !== "maintain" ? <> at <b>{fmt(nutrition.rate, 2)} kg/week</b></> : ""}. That rate needs a {nutrition.dir === "gain" ? "surplus" : "deficit"} of <span className="mono">{fmt(nutrition.rate, 2)} × 7700 ÷ 7 ≈ {Math.round((nutrition.rate * 7700) / 7)} kcal/day</span>, so your target is <b>{Math.round(nutrition.targetCals)} kcal/day</b>.</>
                )}
              </div>
            </div>

            {nutrition.avgCals != null && nutrition.targetCals != null && (
              <div className="detblock">
                <div className="detlabel">4 · The recommendation</div>
                <div className="detbody">
                  You're eating <b>{Math.round(nutrition.avgCals)}</b> vs a target of <b>{Math.round(nutrition.targetCals)}</b> — a gap of <b>{Math.round(nutrition.avgCals - nutrition.targetCals)} kcal/day</b>. {nutrition.rec}
                </div>
              </div>
            )}

            <div className="detblock">
              <div className="detlabel">5 · Protein</div>
              <div className="detbody">
                {nutrition.proteinTarget == null ? "Needs your current weight." : (
                  <>Target is <span className="mono">{fmt(nutrition.bw)} kg × {fmt(nutriSettings.proteinPerKg, 1)} = {Math.round(nutrition.proteinTarget)}g/day</span>. {nutrition.proteinNote}</>
                )}
              </div>
            </div>

            <div className="detblock">
              <div className="detlabel">6 · Fat &amp; carbs</div>
              <div className="detbody">
                {nutrition.fatFloor == null ? "Needs your current weight." : (
                  <>
                    Fat floor is <span className="mono">{fmt(nutrition.bw)} kg × 0.8 = {Math.round(nutrition.fatFloor)}g/day</span> — the minimum for hormone health. Carbs are whatever calories remain after protein and fat:
                    <br /><span className="mono">({Math.round(nutrition.targetCals || 0)} − {Math.round(nutrition.proteinTarget || 0)}×4 − {Math.round(nutrition.fatFloor)}×9) ÷ 4 ≈ {nutrition.carbTarget != null ? Math.round(nutrition.carbTarget) : "—"}g</span>
                    <br />{nutrition.fatNote} {nutrition.carbNote}
                  </>
                )}
              </div>
            </div>

            <div className="detnote">
              What this can't do: predict how much of a change will be fat vs. muscle from calories alone. That depends on training, sleep, and genetics. Recommendations here are built on your weight trend and macros — the parts the data can actually measure.
            </div>
          </div>
        </div>
      )}

      {/* food entry sheet */}
      {showFood && (
        <div className="sheet" onClick={() => setShowFood(false)}>
          <div className="sheetinner" onClick={(e) => e.stopPropagation()}>
            <div className="sheettop">
              <h2>Log calories</h2>
              <button className="x" onClick={() => setShowFood(false)}>✕</button>
            </div>
            <label className="fld">
              <span>Date</span>
              <input type="date" value={foodDraft.date || ""} onChange={(e) => setFoodDraft({ ...foodDraft, date: e.target.value })} />
            </label>
            <label className="fld">
              <span>Calories <em>*</em> <small>kcal</small></span>
              <input type="number" inputMode="decimal" value={foodDraft.calories ?? ""} onChange={(e) => setFoodDraft({ ...foodDraft, calories: e.target.value })} />
            </label>
            <label className="fld">
              <span>Protein <small>g</small></span>
              <input type="number" inputMode="decimal" value={foodDraft.protein ?? ""} onChange={(e) => setFoodDraft({ ...foodDraft, protein: e.target.value })} />
            </label>
            <div className="tapegrid">
              <label className="fld">
                <span>Carbs <small>g</small></span>
                <input type="number" inputMode="decimal" value={foodDraft.carbs ?? ""} onChange={(e) => setFoodDraft({ ...foodDraft, carbs: e.target.value })} />
              </label>
              <label className="fld">
                <span>Fat <small>g</small></span>
                <input type="number" inputMode="decimal" value={foodDraft.fat ?? ""} onChange={(e) => setFoodDraft({ ...foodDraft, fat: e.target.value })} />
              </label>
            </div>
            <p className="hint" style={{ marginBottom: 12 }}>Logging the same date again overwrites it — enter your daily total.</p>
            <button className="save" onClick={saveFood}>Save day</button>
          </div>
        </div>
      )}
      {showGoals && (
        <div className="sheet" onClick={() => setShowGoals(false)}>
          <div className="sheetinner" onClick={(e) => e.stopPropagation()}>
            <div className="sheettop">
              <h2>Set goals</h2>
              <button className="x" onClick={() => setShowGoals(false)}>✕</button>
            </div>
            <p className="hint" style={{ marginBottom: 16 }}>Ring fills as you move from your first entry toward the goal. Leave blank to remove a goal.</p>
            <label className="fld">
              <span>Target weight <small>kg</small></span>
              <input type="number" inputMode="decimal" value={goalDraft.weight ?? ""} onChange={(e) => setGoalDraft({ ...goalDraft, weight: e.target.value })} />
            </label>
            <label className="fld">
              <span>Target body fat <small>%</small></span>
              <input type="number" inputMode="decimal" value={goalDraft.bodyFat ?? ""} onChange={(e) => setGoalDraft({ ...goalDraft, bodyFat: e.target.value })} />
            </label>
            <button className="save" onClick={saveGoals}>Save goals</button>
          </div>
        </div>
      )}

      {/* chart drawer */}
      {chartKey && (
        <div className="sheet" onClick={() => { setChartKey(null); setRange("all"); }}>
          <div className="sheetinner" onClick={(e) => e.stopPropagation()}>
            <div className="sheettop">
              <h2>{ALL.find((m) => m.key === chartKey)?.label} trend</h2>
              <button className="x" onClick={() => setChartKey(null)}>✕</button>
            </div>
            <div className="rangebar">
              {RANGES.map((r) => (
                <button key={r.key} className={range === r.key ? "on" : ""} onClick={() => setRange(r.key)}>{r.label}</button>
              ))}
            </div>
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#1c2230" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#6b7480", fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fill: "#6b7480", fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ background: "#141922", border: "1px solid #26303f", borderRadius: 12, color: "#fff" }} />
                  <Line type="monotone" dataKey={chartKey} stroke="#5aa9e6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* add modal */}
      {modal && (
        <div className="sheet" onClick={() => setModal(null)}>
          <div className="sheetinner" onClick={(e) => e.stopPropagation()}>
            <div className="sheettop">
              <h2>{modal === "comp" ? "Weight & composition" : "Tape measurements"}</h2>
              <button className="x" onClick={() => setModal(null)}>✕</button>
            </div>
            <label className="fld">
              <span>Date</span>
              <input type="date" value={draft.date || ""} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </label>

            {modal === "comp" && (
              <>
                {COMPOSITION.map((m) => (
                  <label key={m.key} className="fld">
                    <span>{m.label} {m.required && <em>*</em>} <small>{m.unit}</small></span>
                    <input type="number" inputMode="decimal" placeholder={m.key === "fatMass" ? "auto if blank" : ""}
                      value={draft[m.key] ?? ""} onChange={(e) => setDraft({ ...draft, [m.key]: e.target.value })} />
                  </label>
                ))}
                <p className="hint">Fat mass auto-fills from weight × body fat % if left blank. Muscle mass is manual.</p>
              </>
            )}

            {modal === "tape" && (
              <>
                <div className="tapegrid">
                  {TAPE.map((m) => (
                    <label key={m.key} className="fld">
                      <span>{m.label} <small>cm</small></span>
                      <input type="number" inputMode="decimal" value={draft[m.key] ?? ""} onChange={(e) => setDraft({ ...draft, [m.key]: e.target.value })} />
                    </label>
                  ))}
                </div>
              </>
            )}
            <button className="save" onClick={saveEntry}>Save entry</button>
          </div>
        </div>
      )}

      {/* bottom bar: add actions + tab switcher */}
      <nav className="bottombar">
        {tab === "body" ? (
          <div className="actions">
            <button className="primary" onClick={() => openAdd("comp")}>+ Weight</button>
            <button onClick={() => openAdd("tape")}>+ Tape</button>
          </div>
        ) : (
          <div className="actions">
            <button className="primary" onClick={openFood}>+ Calories</button>
          </div>
        )}
        <div className="tabswitch">
          <button className={tab === "body" ? "on" : ""} onClick={() => setTab("body")}>Body</button>
          <button className={tab === "nutrition" ? "on" : ""} onClick={() => setTab("nutrition")}>Nutrition</button>
        </div>
      </nav>
    </div>
  );
}

const css = `
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
.app {
  --bg:#0b0e14; --panel:#141922; --line:#1c2230; --txt:#e8ecf2; --dim:#6b7480;
  background: var(--bg); color: var(--txt); min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
  padding: max(env(safe-area-inset-top), 16px) 16px calc(150px + env(safe-area-inset-bottom)) 16px;
  max-width: 640px; margin: 0 auto;
}
.top { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:22px; }
.headright { display:flex; align-items:center; gap:10px; }
.gear { border:1px solid var(--line); background:var(--panel); color:var(--dim); width:38px; height:38px; border-radius:12px; font-size:17px; }
.gear:active { transform:scale(.95); }
.eyebrow { font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--dim); margin-bottom:4px; }
h1 { margin:0; font-size:30px; font-weight:650; letter-spacing:-.02em; }
.basetoggle { display:flex; background:var(--panel); border:1px solid var(--line); border-radius:999px; padding:3px; }
.basetoggle button { border:0; background:transparent; color:var(--dim); font-size:12px; font-weight:600; padding:6px 12px; border-radius:999px; }
.basetoggle button.on { background:#26303f; color:#fff; }
.grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-bottom:8px; }
.grid.tape { grid-template-columns:repeat(3,1fr); gap:10px; }
.sectlabel { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--dim); margin:26px 4px 12px; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:20px; padding:16px 8px 14px; display:flex; flex-direction:column; align-items:center; gap:6px; cursor:pointer; transition:transform .12s, border-color .12s; }
.card:active { transform:scale(.97); border-color:#2e3a4d; }
.ringwrap { position:relative; display:flex; align-items:center; justify-content:center; }
.ringtrack { border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background .7s cubic-bezier(.4,0,.2,1); }
.ringhole { border-radius:50%; background:var(--panel); display:flex; flex-direction:column; align-items:center; justify-content:center; }
.ringinner { text-align:center; line-height:1; }
.val { font-size:24px; font-weight:680; letter-spacing:-.02em; }
.val.sm { font-size:18px; }
.u { font-size:10px; color:var(--dim); margin-top:3px; }
.clabel { font-size:13px; font-weight:600; margin-top:2px; }
.clabel.sm { font-size:11px; }
.cdelta { font-size:12px; font-weight:600; }
.cdelta.sm { font-size:10px; }
.empty { text-align:center; color:var(--dim); padding:80px 20px; font-size:15px; }
.bottombar { position:fixed; bottom:0; left:0; right:0; display:flex; flex-direction:column; gap:10px; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); background:linear-gradient(to top, var(--bg) 78%, transparent); max-width:640px; margin:0 auto; }
.actions { display:flex; gap:12px; }
.actions button { flex:1; border:0; border-radius:16px; padding:15px; font-size:15px; font-weight:650; color:#fff; background:#26303f; }
.actions button.primary { background:#5aa9e6; color:#06121e; }
.actions button:active { transform:scale(.98); }
.tabswitch { display:flex; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:4px; }
.tabswitch button { flex:1; border:0; background:transparent; color:var(--dim); font-size:14px; font-weight:650; padding:10px 0; border-radius:10px; }
.tabswitch button.on { background:#26303f; color:#fff; }
/* nutrition */
.reccard { border-radius:20px; padding:18px; margin-bottom:14px; border:1px solid var(--line); background:var(--panel); }
.reccard[data-tone="cut"] { border-color:#7a3b46; background:linear-gradient(180deg,#241820,#141922); }
.reccard[data-tone="add"] { border-color:#2c5a3f; background:linear-gradient(180deg,#16241d,#141922); }
.reccard[data-tone="hold"] { border-color:#2a4258; background:linear-gradient(180deg,#141f28,#141922); }
.reclabel { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--dim); margin-bottom:8px; }
.rectext { font-size:16px; font-weight:550; line-height:1.4; }
.explainbtn { margin-top:12px; border:0; background:rgba(255,255,255,.06); color:var(--txt); font-size:13px; font-weight:600; padding:9px 14px; border-radius:10px; }
.explainbtn:active { transform:scale(.98); }
.detblock { margin-bottom:16px; }
.detlabel { font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); margin-bottom:6px; }
.detbody { font-size:14px; line-height:1.55; color:var(--txt); }
.detbody b { font-weight:680; }
.mono { display:inline-block; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:3px 8px; margin-top:4px; color:#9fb4c8; }
.detnote { font-size:12.5px; line-height:1.5; color:var(--dim); background:var(--bg); border:1px dashed var(--line); border-radius:14px; padding:13px 15px; margin-top:4px; }
.statgrid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:14px; }
.stat { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:14px; }
.statnum { font-size:26px; font-weight:680; letter-spacing:-.02em; }
.statlab { font-size:12px; color:var(--dim); margin-top:4px; line-height:1.3; }
.statlab small { color:#4a525e; }
.protcard { border-radius:16px; padding:14px 16px; margin-bottom:14px; border:1px solid var(--line); background:var(--panel); }
.protcard.low { border-color:#7a5a2b; }
.protrow { display:flex; justify-content:space-between; align-items:center; font-size:15px; }
.protrow strong { font-weight:680; }
.protrow small { color:var(--dim); font-weight:500; }
.protnote { font-size:12.5px; color:var(--dim); margin-top:8px; line-height:1.4; }
.macrogrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
.macro { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:14px 16px; }
.macro.low { border-color:#7a5a2b; }
.macronum { font-size:24px; font-weight:680; letter-spacing:-.02em; }
.macronum span { font-size:14px; color:var(--dim); font-weight:500; margin-left:2px; }
.macrolab { font-size:12.5px; color:var(--dim); margin-top:2px; }
.macrolab small { color:#4a525e; }
.macronote { font-size:12.5px; line-height:1.45; color:var(--dim); border-radius:12px; padding:11px 14px; margin-bottom:10px; border:1px solid var(--line); background:var(--panel); }
.macronote.low { border-color:#5a4a2b; }
.notecard { font-size:12.5px; color:var(--dim); line-height:1.5; background:var(--panel); border:1px dashed var(--line); border-radius:14px; padding:12px 14px; margin-bottom:14px; }
.foodlist { display:flex; flex-direction:column; gap:6px; }
.foodrow { display:flex; justify-content:space-between; align-items:center; gap:10px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px 14px; font-size:14px; }
.fdate { color:var(--dim); font-weight:600; flex:none; }
.fcal { font-weight:650; margin-left:auto; }
.fmacros { color:var(--dim); font-size:12.5px; flex:none; font-variant-numeric:tabular-nums; }
.segrow { display:flex; gap:6px; }
.seg { flex:1; border:1px solid var(--line); background:var(--bg); color:var(--dim); font-size:13px; font-weight:600; padding:11px 0; border-radius:11px; text-transform:capitalize; }
.seg.on { background:#5aa9e6; color:#06121e; border-color:#5aa9e6; }
.insights { margin-bottom:16px; }.insight { display:flex; gap:11px; align-items:flex-start; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:13px 15px; margin-bottom:8px; font-size:13.5px; line-height:1.45; }
.insight .idot { flex:none; width:8px; height:8px; border-radius:50%; margin-top:6px; }
.insight.warn .idot { background:#ffb020; }
.insight.warn { border-color:#5a4a2b; }
.insight.good .idot { background:#3ddc84; }
.insight.good { border-color:#2c5a3f; }
.insight.info .idot { background:#5aa9e6; }
.insight.info { border-color:#2a4258; }
.analysiscard { width:100%; text-align:left; border-radius:20px; padding:16px 18px; margin-bottom:14px; border:1px solid var(--line); background:var(--panel); }
.analysiscard[data-tone="good"] { border-color:#2c5a3f; background:linear-gradient(180deg,#16241d,#141922); }
.analysiscard[data-tone="warn"] { border-color:#5a4a2b; background:linear-gradient(180deg,#241f16,#141922); }
.analysiscard[data-tone="info"] { border-color:#2a4258; background:linear-gradient(180deg,#141f28,#141922); }
.analysiscard:active { transform:scale(.99); }
.anrow { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.anlabel { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--dim); }
.anconf { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:3px 8px; border-radius:999px; }
.anconf.high { background:rgba(61,220,132,.16); color:#3ddc84; }
.anconf.medium { background:rgba(90,169,230,.16); color:#5aa9e6; }
.anconf.low { background:rgba(255,176,32,.16); color:#ffb020; }
.anhead { font-size:17px; font-weight:640; line-height:1.3; }
.anhint { font-size:12px; color:var(--dim); margin-top:6px; }
.movegrid { display:flex; flex-direction:column; gap:6px; }
.moverow { display:flex; justify-content:space-between; align-items:center; background:var(--bg); border:1px solid var(--line); border-radius:11px; padding:11px 14px; font-size:14px; }
.moverow span { color:var(--dim); }
.moverow b { font-weight:680; }
.mv-good { color:#3ddc84; }
.mv-bad { color:#ff5c72; }
.mv-flat { color:#8a94a2; }
.sheet { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:flex-end; justify-content:center; z-index:50; backdrop-filter:blur(4px); }
.sheetinner { background:var(--panel); width:100%; max-width:480px; margin:0 auto; border-radius:24px 24px 0 0; padding:20px 18px calc(24px + env(safe-area-inset-bottom)); max-height:90vh; overflow-y:auto; overflow-x:hidden; border-top:1px solid var(--line); animation:up .28s cubic-bezier(.4,0,.2,1); }
@keyframes up { from { transform:translateY(100%); } }
.sheettop { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
.sheettop h2 { margin:0; font-size:19px; font-weight:640; }
.rangebar { display:flex; gap:6px; margin-bottom:14px; background:var(--bg); padding:4px; border-radius:12px; }
.rangebar button { flex:1; border:0; background:transparent; color:var(--dim); font-size:13px; font-weight:600; padding:8px 0; border-radius:9px; }
.rangebar button.on { background:#26303f; color:#fff; }
.x { border:0; background:#26303f; color:#fff; width:34px; height:34px; border-radius:50%; font-size:15px; }
.fld { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; min-width:0; }
.fld span { font-size:13px; color:var(--dim); font-weight:500; }
.fld span em { color:#ff5c72; font-style:normal; }
.fld span small { color:#4a525e; }
.fld input { width:100%; max-width:100%; min-width:0; -webkit-appearance:none; appearance:none; background:var(--bg); border:1px solid var(--line); border-radius:12px; padding:13px 14px; color:var(--txt); font-size:16px; }
.fld input[type="date"] { display:block; text-align:left; }
.fld input:focus { outline:none; border-color:#5aa9e6; }
.tapegrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; width:100%; }
.hint { font-size:12px; color:var(--dim); margin:4px 0 0; line-height:1.4; }
.save { width:100%; border:0; border-radius:16px; padding:16px; font-size:16px; font-weight:650; background:#5aa9e6; color:#06121e; margin-top:8px; }
.save:active { transform:scale(.99); }
@media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } }
.welcome { position:fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(5,7,11,.82); backdrop-filter:blur(8px); }
.welcomecard { background:var(--panel); border:1px solid var(--line); border-radius:26px; max-width:440px; width:100%; max-height:90vh; overflow-y:auto; padding:28px 22px calc(24px + env(safe-area-inset-bottom)); animation:pop .34s cubic-bezier(.2,.8,.2,1); }
@keyframes pop { from { opacity:0; transform:translateY(16px) scale(.97); } }
.wlogo { font-size:44px; line-height:1; color:#5aa9e6; text-align:center; margin-bottom:12px; }
.wtitle { margin:0 0 8px; font-size:26px; font-weight:680; letter-spacing:-.02em; text-align:center; }
.wlead { margin:0 0 22px; font-size:14.5px; line-height:1.5; color:var(--dim); text-align:center; }
.wfeatures { display:flex; flex-direction:column; gap:14px; margin-bottom:20px; }
.wfeat { display:flex; flex-direction:column; gap:3px; padding-left:14px; border-left:2px solid #26303f; }
.wfeat b { font-size:14.5px; font-weight:640; }
.wfeat span { font-size:13px; line-height:1.45; color:var(--dim); }
.wnote { font-size:12.5px; line-height:1.5; color:var(--dim); background:var(--bg); border:1px dashed var(--line); border-radius:14px; padding:12px 14px; margin:0 0 20px; }
.wbtn { width:100%; border:0; border-radius:16px; padding:16px; font-size:16px; font-weight:680; background:#5aa9e6; color:#06121e; }
.wbtn:active { transform:scale(.99); }
`;
