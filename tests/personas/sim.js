// Ground-truth simulator for the persona study (test-only; never imported by the app).
//
// Truth per day:
//   tissue change = (true intake − true TDEE) / energyPerKg, Hall/Forbes from true fat mass
//   scale weight  = fat + fat-free mass + water (AR(1), φ 0.6) + event water + time-of-day offset + N(0, 0.2²)
//   logged intake = true intake × (1 + logging bias) × (1 + N(0, 0.08²))  (label error)
// The persona's plan (`plan <kcal> <reason>`) is their TRUE intake from the next day on;
// the logged numbers are derived from it with the persona's bias and label error.
// Every random stream comes from one recorded seed per persona (SEEDS), so runs reproduce exactly.
// True TDEE = baseline + 22 kcal per kg of tissue change (adaptation) + persona drift.
//
// The persona agent only ever sees the "life log" text: meals as they would log
// them, scale readings, tape/DEXA readings and life events. True TDEE, true
// intake and the truth file stay hidden.

const DAY = 86400000;

// ---------- small utils ----------
export function rng(seed) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = () => {
    let x = 0, y = 0;
    while (x === 0) x = u();
    while (y === 0) y = u();
    return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * y);
  };
  return { u, n };
}
const hash = (s) => [...String(s)].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
export function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY);
  return t.toISOString().slice(0, 10);
}
export const dow = (date) => new Date(date + "T12:00:00Z").getUTCDay(); // 0 Sun … 6 Sat
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const r0 = (x) => Math.round(x);
const r1 = (x) => Math.round(x * 10) / 10;
export const hallP = (fm) => 10.4 / (10.4 + fm);
export const energyPerKg = (fm) => hallP(fm) * 1816 + (1 - hallP(fm)) * 9440;

// ---------- persona ground truth ----------
// intake = TRUE mean daily intake at the start; logged = true × (1 + bias) × label error
const P = (o) => ({
  tz: "Asia/Riyadh", start: "2026-10-04", weeks: 12, bias: 0, waterSD: 0.6, adapt: 22,
  missingMacro: 0.1, completeProb: 0.95, glycogen: null, bia: null, dexa: null, tape: null,
  weigh: () => true, weighTime: () => "06:50", log: () => ({ mode: "full", complete: true }),
  meals: "standard", protein: 130, events: () => ({}), notes: () => [], ...o,
});
const weekday = (d, set) => set.includes(dow(d));
const prob = (p) => (r) => r.u() < p;

export const PERSONAS = {
  p01: P({ name: "Khalid", sex: "male", age: 34, height: 180, weight: 118, bf: 36, tdee: 2950, intake: 2500, bias: -0.2,
    weigh: (d) => weekday(d, [0, 2, 4]), protein: 110, missingMacro: 0.5,
    log: (d, r) => (r.u() < 0.5 ? { mode: "dinner", complete: r.u() < 0.4 } : { mode: "none" }),
    glycogen: -0.9 }),
  p02: P({ name: "Sara", tz: "Asia/Riyadh", sex: "female", age: 29, height: 163, weight: 76, bf: 35, tdee: 2150, intake: 1700, waterSD: 0.45,
    protein: 110, missingMacro: 0.05, glycogen: -0.6,
    events: (day) => { const c = (day + 10) % 28; const w = c >= 21 ? 0.25 * (c - 20) : 0; return { water: Math.min(w, 1.6), note: c === 21 ? "PMS started: you feel bloated." : c === 0 ? "Your period started today." : null }; },
    tape: { every: 14, sites: { waist: 84, hips: 106, neck: 33 }, readings: 1 } }),
  p03: P({ name: "Omar", sex: "male", age: 22, height: 178, weight: 74, bf: 24, tdee: 2600, intake: 2600, protein: 80, missingMacro: 0.25,
    recomp: { fmPerDay: -1.5 / 84, ffmPerDay: 1.5 / 84 }, bia: { bfSD: 2.0 },
    tape: { every: 7, sites: { waist: 86, neck: 37, chest: 96, armL: 30, armR: 30.5 }, readings: 1 } }),
  p04: P({ name: "Faisal", sex: "male", age: 19, height: 185, weight: 62, bf: 12, tdee: 3000, intake: 2900, bias: 0.15, waterSD: 0.5,
    weigh: (d) => !weekday(d, [5, 6]), protein: 110, missingMacro: 0.2, glycogen: 0.5 }),
  p05: P({ name: "Lina", tz: "America/New_York", sex: "female", age: 26, height: 168, weight: 55, bf: 22, tdee: 2250, intake: 2250, waterSD: 0.45,
    protein: 120, weigh: (d, r) => r.u() < 0.9, lateSnack: 0.55 }),
  p06: P({ name: "Hamad", sex: "male", age: 24, height: 186, weight: 95, bf: 29, tdee: 2950, intake: 2250, protein: 190, missingMacro: 0.02,
    bia: { bfSD: 1.5 }, alreadyDieting: true, tape: { every: 14, sites: { waist: 94, neck: 39 }, readings: 1 } }),
  p07: P({ name: "Noura", sex: "female", age: 41, height: 160, weight: 84, bf: 40, tdee: 2000, intake: 1600, protein: 85,
    weekendExtra: 800, weigh: (d) => !weekday(d, [0, 6]),
    log: (d) => (weekday(d, [0, 6]) ? { mode: "none" } : { mode: "full", complete: true }), glycogen: -0.6 }),
  p08: P({ name: "Yousef", sex: "male", age: 30, height: 175, weight: 92, bf: 30, tdee: 2700, intake: 2200, protein: 140, weigh: (d, r) => r.u() < 0.85,
    events: (day, date) => {
      let water = day >= 14 && day < 28 ? 1.5 * (day - 13) / 14 : day >= 28 ? 1.5 : 0;
      const note = day === 14 ? "You started taking creatine today (5 g/day)." : dow(date) === 4 ? "Thursday: dinner at a restaurant — very salty food." : null;
      return { water, salt: dow(date) === 4 ? 0.8 : 0, note };
    }, glycogen: -0.7 }),
  p09: P({ name: "Abdullah", sex: "male", age: 45, height: 172, weight: 101, bf: 33, tdee: 2650, intake: 2150, protein: 120,
    events: (day) => {
      const water = day < 7 ? 0 : day < 28 ? 0.11 * (day - 6) : day < 32 ? 0.11 * 21 * (1 - (day - 27) / 4) : 0;
      const note = day >= 14 && day < 28 && day % 3 === 0 ? "The scale hasn't moved in weeks. You're frustrated and thinking about cutting calories hard (maybe 1,500)." : day === 31 ? "Whoa — the scale dropped a lot in the last few days." : null;
      return { water: Math.max(0, water), note };
    }, glycogen: -0.6 }),
  p10: P({ name: "Reem", sex: "female", age: 33, height: 158, weight: 70, bf: 36, tdee: 1950, intake: 1500, protein: 90,
    sick: [28, 38], weigh: (d, r, day) => !(day >= 28 && day < 38),
    log: (d, r, day) => (day >= 28 && day < 38 ? { mode: "none" } : { mode: "full", complete: true }),
    events: (day) => ({ water: day >= 28 && day < 38 ? -0.8 : 0, note: day === 28 ? "You're sick (flu). You won't feel like using any apps for about 10 days; you barely eat." : day === 38 ? "You're feeling better and back to normal routine." : null }),
    glycogen: -0.6 }),
  p11: P({ name: "Mohammed", start: "2027-01-11", sex: "male", age: 27, height: 176, weight: 82, bf: 20, tdee: 2600, intake: 2550, protein: 140,
    weigh: (d, r) => r.u() < 0.85, ramadan: [28, 56],
    events: (day) => ({ water: day >= 28 && day < 56 ? -0.4 : 0, note: day === 28 ? "Ramadan started. You eat iftar at sunset and suhoor at about 03:30." : day === 56 ? "Ramadan is over — Eid! Back to normal meals." : null }) }),
  p12: P({ name: "Huda", sex: "female", age: 38, height: 165, weight: 68, bf: 33, tdee: 2000, intake: 1100, protein: 80, glycogen: -1.0,
    intakeFn: (day) => (day >= 14 ? 900 : 1100) }),
  p13: P({ name: "Ali", sex: "male", age: 16, height: 175, weight: 80, bf: 28, tdee: 2700, intake: 2400, protein: 90, weigh: (d, r) => r.u() < 0.6 }),
  p14: P({ name: "Maha", sex: "female", age: 31, height: 165, weight: 72, bf: 33, tdee: 2300, intake: 2350, protein: 95, weigh: (d) => weekday(d, [0, 2, 4]),
    pregnancyGainPerDay: 0.04 }),
  p15: P({ name: "Rana", sex: "female", age: 23, height: 165, weight: 49, bf: 20, tdee: 1800, intake: 1650, protein: 70, waterSD: 0.4 }),
  p16: P({ name: "Tariq", sex: "male", age: 36, height: 183, weight: 96, bf: 27, tdee: 2800, intake: 2300, protein: 150, glycogen: -0.7,
    notes: (day) => day === 9 ? ["When you enter your weight today you are in a hurry and type 9.6 instead of the real number."] :
      day === 23 ? ["Big family dinner day: you ate about 2,950 kcal in total. You log the whole day as a single entry — and you accidentally type 950 instead of 2950."] :
      day === 30 ? ["You accidentally log your lunch twice (same entry, same numbers)."] : [],
    intakeFn: (day) => (day === 23 ? 2950 : 2300) }),
  p17: P({ name: "Dana", sex: "female", age: 28, height: 170, weight: 66, bf: 30, tdee: 2200, intake: 1750, protein: 120, glycogen: -0.6,
    dexa: [0, 42, 83] }),
  p18: P({ name: "Sami", sex: "male", age: 50, height: 176, weight: 88, bf: 30, tdee: 2450, intake: 1950, protein: 110, weigh: (d) => weekday(d, [0, 3, 5]),
    tape: { every: 7, sites: { waist: 104, neck: 40, hips: 106 }, readings: 3 }, glycogen: -0.6 }),
  p19: P({ name: "Majed", sex: "male", age: 29, height: 178, weight: 72, bf: 11, tdee: 3700, intake: 3500, protein: 150, waterSD: 0.7 }),
  p20: P({ name: "Laila", sex: "female", age: 56, height: 160, weight: 74, bf: 42, tdee: 1800, intake: 1800, protein: 80, weigh: (d) => weekday(d, [0, 1, 3, 5]) }),
  p21: P({ name: "Nasser", sex: "male", age: 35, height: 190, weight: 170, bf: 45, tdee: 3600, intake: 2800, protein: 150, waterSD: 0.9, glycogen: -3.0 }),
  p22: P({ name: "Aisha", sex: "female", age: 30, height: 165, weight: 60, bf: 25, tdee: 2100, intake: 1600, protein: 110, glycogen: 0.6 }),
  p23: P({ name: "Hassan", sex: "male", age: 40, height: 178, weight: 90, bf: 25, tdee: 2600, intake: 2200, protein: 130, nightShift: true,
    weighTime: (d, r) => ["16:10", "18:30", "23:45", "05:20", "07:10", "16:40"][Math.floor(r.u() * 6)], glycogen: -0.6 }),
  p24: P({ name: "Returning user", sex: "male", age: 32, height: 177, weight: 88, bf: 22, tdee: 2700, intake: 2300, protein: 150, weeks: 4, history: 60 }),
  p25: P({ name: "Rami", sex: "male", age: 26, height: 181, weight: 85, bf: 20, tdee: 2750, intake: 2250, protein: 170, meals: "many", missingMacro: 0.3, glycogen: -0.6,
    notes: (day) => day === 4 ? ["You realise the lunch you logged yesterday was actually about 450 kcal, not what you entered. Fix it."] :
      day === 11 ? ["You logged a snack today that you didn't actually eat — delete it. (Log a 180 kcal 'protein bar' first, then delete it.)"] :
      day === 20 ? ["You mistyped a meal's protein today — edit it after logging."] : [] }),
  p26: P({ name: "Jana", sex: "female", age: 24, height: 167, weight: 64, bf: 30, tdee: 2050, intake: 1700, protein: 80, missingMacro: 0.3,
    weigh: (d) => weekday(d, [1, 4]), log: (d, r) => (r.u() < 0.5 ? { mode: "full", complete: r.u() < 0.5 } : { mode: "none" }), glycogen: -0.5 }),
};

/** One seed per persona (recorded in the report); every random stream derives from it. */
export const SEEDS = Object.fromEntries(Object.keys(PERSONAS).map((id, i) => [id, 20261004 + 101 * (i + 1)]));
const sk = (id, tag) => hash(`${SEEDS[id]}:${tag}`);

// ---------- meals ----------
const TEMPLATES = {
  standard: [["07:30", "Breakfast", 0.25], ["13:00", "Lunch", 0.35], ["16:30", "Snack", 0.1], ["20:00", "Dinner", 0.3]],
  many: [["07:00", "Breakfast", 0.2], ["10:30", "Snack", 0.1], ["13:00", "Lunch", 0.25], ["16:00", "Protein shake", 0.1], ["19:30", "Dinner", 0.25], ["22:00", "Evening snack", 0.1]],
  night: [["17:30", "Wake-up meal", 0.3], ["22:00", "Shift meal", 0.3], ["02:00", "Night snack", 0.15], ["04:40", "Pre-sleep meal", 0.25]],
  ramadan: [["18:00", "Iftar", 0.6], ["21:30", "Dessert & tea", 0.1], ["03:30", "Suhoor", 0.3]],
};
const FOODS = {
  Breakfast: ["eggs & toast", "oats with milk", "labneh sandwich", "foul & bread", "yogurt & granola"],
  Lunch: ["chicken kabsa", "shawarma plate", "grilled fish & rice", "chicken salad", "beef burger"],
  Dinner: ["pasta", "grilled chicken & potatoes", "mandi", "steak & vegetables", "pizza (3 slices)"],
  Snack: ["dates & coffee", "protein bar", "fruit", "nuts", "cookies"],
};
const foodName = (slot, r) => { const k = Object.keys(FOODS).find((x) => slot.includes(x)) || "Snack"; const a = FOODS[k]; return a[Math.floor(r.u() * a.length)]; };

// ---------- simulation state ----------
export function initState(id) {
  const p = PERSONAS[id];
  const fm = (p.weight * p.bf) / 100;
  const s = {
    id, day: 0, date: p.start, fm, ffm: p.weight - fm, fm0: fm, tissue0: p.weight,
    water: 0.6 * p.waterSD * rng(sk(id, 'water0')).n(), eventWater: 0, salt: 0, seed: SEEDS[id],
    plan: p.intake, planHistory: [{ day: 0, date: p.start, plan: p.intake, reason: 'starting intake (persona card)' }], today: null, truthLog: [],
  };
  s.today = makeDay(p, s);
  return s;
}

export function trueTdee(p, s, day = s.day) {
  const tissue = s.fm + s.ffm;
  let t = p.tdee + p.adapt * (tissue - s.tissue0);
  if (p.pregnancyGainPerDay) t += 1.2 * day; // pregnancy raises needs slowly
  return t;
}

function glycogenOffset(p, day) {
  if (!p.glycogen) return 0;
  return p.glycogen * Math.min(1, day / 5);
}

/** Build the day (truth for today's intake + the text the persona sees). */
function makeDay(p, s) {
  const r = rng(sk(s.id, `day:${s.day}`));
  const date = s.date;
  // true intake plan: the persona's own latest decision; scripted phases apply only until they decide something
  const planChanged = s.planHistory.length > 1;
  const truePlan = planChanged ? s.plan : p.intakeFn ? p.intakeFn(s.day) : s.plan;
  const inRamadan = p.ramadan && s.day >= p.ramadan[0] && s.day < p.ramadan[1];
  const sick = p.sick && s.day >= p.sick[0] && s.day < p.sick[1];
  let trueIntake = truePlan * (1 + 0.1 * r.n());
  if (p.weekendExtra && weekday(date, [0, 6])) trueIntake += p.weekendExtra;
  if (sick) trueIntake = 1000 * (1 + 0.1 * r.n());
  if (inRamadan) trueIntake *= 1.05;
  const loggedTotal = trueIntake * (1 + p.bias) * (1 + 0.08 * r.n());

  // meals
  const tpl = inRamadan ? TEMPLATES.ramadan : p.nightShift ? TEMPLATES.night : TEMPLATES[p.meals] || TEMPLATES.standard;
  const proteinDay = p.protein * (loggedTotal / Math.max(1, truePlan * (1 + p.bias)));
  const meals = tpl.map(([time, slot, share]) => {
    const kcal = loggedTotal * share * (1 + 0.15 * r.n());
    const prot = proteinDay * share * (1 + 0.2 * r.n());
    const fat = (kcal * 0.3) / 9;
    const carbs = Math.max(0, (kcal - prot * 4 - fat * 9) / 4);
    const m = { time, slot, food: foodName(slot, r), kcal: r0(kcal), protein: r0(prot), carbs: r0(carbs), fat: r0(fat) };
    if (r.u() < p.missingMacro) { delete m.carbs; delete m.fat; if (r.u() < 0.5) delete m.protein; }
    return m;
  });
  // rescale so meals sum to loggedTotal
  const sum = meals.reduce((a, m) => a + m.kcal, 0);
  meals.forEach((m) => (m.kcal = r0((m.kcal * loggedTotal) / sum)));
  if (p.lateSnack && r.u() < p.lateSnack) meals.push({ time: "00:40", nextDay: true, slot: "Late-night snack", food: "cereal / chips", kcal: r0(180 + 120 * r.u()), protein: r0(5 + 5 * r.u()) });
  // after-midnight meals in night/Ramadan templates happen on the next calendar day
  for (const m of meals) if (!m.nextDay && m.time < "06:00") m.nextDay = true;

  const habit = sick ? { mode: "none" } : p.log(date, r, s.day);
  const weighs = !sick && p.weigh(date, r, s.day);
  const weighTime = typeof p.weighTime === "function" ? p.weighTime(date, r) : p.weighTime;
  const ev = p.events(s.day, date) || {};
  return { day: s.day, date, trueIntake, loggedTotal, meals, habit, weighs, weighTime, ev, noise: r.n(), bfNoise: r.n(), musNoise: r.n(),
    tapeNoise: [r.n(), r.n(), r.n(), r.n(), r.n(), r.n(), r.n(), r.n(), r.n()], dexaNoise: [r.n(), r.n(), r.n()], timeOffset: weighTime > "12:00" || weighTime < "05:59" ? 0.4 + 0.4 * r.u() : 0 };
}

/** Morning scale reading & measurements for the current day (from current truth). */
export function readings(id, s) {
  const p = PERSONAS[id], t = s.today;
  const ev = t.ev || {};
  const extra = (ev.water || 0) + s.salt + glycogenOffset(p, s.day) + (p.nightShift ? t.timeOffset : 0);
  const trueWeight = s.fm + s.ffm;
  const scale = trueWeight + s.water + extra + 0.2 * t.noise;
  const out = { scale: r1(scale), trueWeight, water: s.water + extra };
  if (p.bia) {
    const bf = (100 * s.fm) / trueWeight + p.bia.bfSD * t.bfNoise - 1.5 * s.water;
    out.bia = { bodyFat: r1(bf), fatMass: r1((scale * bf) / 100), muscleMass: r1(0.52 * s.ffm + 0.8 * t.musNoise + 0.5 * s.water) };
  }
  if (p.dexa && p.dexa.includes(s.day)) {
    out.dexa = { bodyFat: r1((100 * s.fm) / trueWeight + 0.5 * t.dexaNoise[0]), fatMass: r1(s.fm + 0.3 * t.dexaNoise[1]), leanMass: r1(s.ffm - 2.6 + 0.4 * t.dexaNoise[2]) };
  }
  if (p.tape && s.day % p.tape.every === 0) {
    const sites = {};
    let i = 0;
    for (const [site, base] of Object.entries(p.tape.sites)) {
      const trueVal = site === "waist" ? base + 1.0 * (s.fm - s.fm0) : site === "hips" ? base + 0.6 * (s.fm - s.fm0) : site.startsWith("arm") || site === "chest" ? base + 0.4 * (s.ffm - (p.weight - s.fm0)) : base;
      const n = site === "waist" ? p.tape.readings : 1;
      sites[site] = Array.from({ length: n }, () => r1(trueVal + 0.6 * t.tapeNoise[i++ % 9]));
    }
    out.tape = sites;
  }
  return out;
}

/** Close the current day: apply its true intake to the truth, move to the next day. */
export function advance(id, s) {
  const p = PERSONAS[id];
  const t = s.today;
  const T = trueTdee(p, s);
  const rho = energyPerKg(s.fm);
  const dM = (t.trueIntake - T) / rho;
  const pp = hallP(s.fm);
  s.fm += (1 - pp) * dM;
  s.ffm += pp * dM;
  if (p.recomp) { s.fm += p.recomp.fmPerDay; s.ffm += p.recomp.ffmPerDay; }
  if (p.pregnancyGainPerDay) s.ffm += p.pregnancyGainPerDay;
  const r = rng(sk(id, `water:${s.day}`));
  const phi = 0.6;
  s.water = phi * s.water + p.waterSD * Math.sqrt(1 - phi * phi) * r.n();
  s.salt = s.salt * 0.5 + ((t.ev && t.ev.salt) || 0);
  s.truthLog.push({ day: t.day, date: t.date, trueTdee: r0(T), trueIntake: r0(t.trueIntake), loggedIntake: r0(t.loggedTotal), rho: r0(rho), fm: r1(s.fm), ffm: r1(s.ffm), trueWeightEnd: r1(s.fm + s.ffm), scaleMorning: t.scaleShown ?? null, plan: s.plan });
  s.day += 1;
  s.date = addDays(s.date, 1);
  s.today = makeDay(p, s);
  s.today.scaleShown = readings(id, s).scale;
  return s;
}

/** The text the persona sees for today. */
export function lifeLog(id, s) {
  const p = PERSONAS[id], t = s.today;
  const rd = readings(id, s);
  t.scaleShown = rd.scale;
  const L = [];
  L.push(`DAY ${t.day + 1} of ${p.weeks * 7} — ${DOW[dow(t.date)]} ${t.date} (your time zone: ${p.tz})`);
  if (t.weighs) {
    L.push(`${t.weighTime}  You step on the scale: ${rd.scale} kg${p.tz === "America/New_York" ? ` (${r1(rd.scale / 0.45359237)} lb)` : ""}.`);
    if (rd.bia) L.push(`        Your smart scale (BIA) also shows: body fat ${rd.bia.bodyFat}%, fat mass ${rd.bia.fatMass} kg, muscle mass ${rd.bia.muscleMass} kg.`);
  } else L.push("You don't weigh yourself today.");
  if (rd.dexa) L.push(`You get your DEXA scan results today: body fat ${rd.dexa.bodyFat}%, fat mass ${rd.dexa.fatMass} kg, lean mass ${rd.dexa.leanMass} kg.`);
  if (rd.tape) {
    const parts = Object.entries(rd.tape).map(([k, v]) => (v.length > 1 ? `${k} ${v.join(" / ")} cm (${v.length} tries)` : `${k} ${v[0]} cm${p.tz === "America/New_York" ? ` (${r1(v[0] / 2.54)} in)` : ""}`));
    L.push(`You measure with a tape: ${parts.join(", ")}.`);
  }
  L.push("What you eat today (your own estimates from labels/apps):");
  for (const m of t.meals) {
    const mac = [m.protein != null && `protein ${m.protein} g`, m.carbs != null && `carbs ${m.carbs} g`, m.fat != null && `fat ${m.fat} g`].filter(Boolean).join(", ");
    L.push(`  ${m.time}${m.nextDay ? " (after midnight)" : ""}  ${m.slot}: ${m.food} — ${m.kcal} kcal${mac ? `, ${mac}` : " (you don't know the macros)"}`);
  }
  if (t.ev && t.ev.note) L.push(`Life: ${t.ev.note}`);
  for (const n of p.notes(t.day)) L.push(`Life: ${n}`);
  if (p.weekendExtra && weekday(t.date, [0, 6])) L.push("Life: weekend — family outings, you eat more than usual and don't track it.");
  const h = t.habit;
  L.push(`Your habit today: ${h.mode === "none" ? "you don't log any food today." : h.mode === "dinner" ? `you only log dinner today${h.complete ? " and then tap whatever says the day is done, if you notice it" : ""}.` : `you log your meals${h.complete === false ? " but forget to mark the day as finished" : ""}.`}`);
  return L.join("\n");
}

/** The persona decides to eat `kcal` (true intake) from tomorrow; the reason is logged. */
export function setPlan(s, kcal, reason) {
  if (!(kcal > 500 && kcal < 8000)) throw new Error("plan must be a daily calorie amount between 500 and 8000");
  if (!reason || !String(reason).trim()) throw new Error('say why: plan <kcal> "<reason>"');
  s.plan = kcal;
  s.planHistory.push({ day: s.day + 1, date: addDays(s.date, 1), plan: kcal, reason: String(reason).slice(0, 300) });
  return s;
}

/** Old-format (v1) history for the returning user: 60 days before the start. */
export function v1History(id) {
  const p = PERSONAS[id];
  const days = p.history;
  const r = rng(sk(id, 'history'));
  let fm = (p.weight * p.bf) / 100 + 1.2, ffm = p.weight - (p.weight * p.bf) / 100 + 0.8, water = 0;
  const entries = [], food = [];
  for (let i = days; i >= 1; i--) {
    const date = addDays(p.start, -i);
    const T = p.tdee, I = 2350 * (1 + 0.1 * r.n());
    const dM = (I - T) / energyPerKg(fm), pp = hallP(fm);
    fm += (1 - pp) * dM; ffm += pp * dM;
    water = 0.6 * water + 0.48 * r.n();
    if (r.u() < 0.8) entries.push({ id: 1e12 + i, date, weight: r1(fm + ffm + water + 0.2 * r.n()) });
    if (r.u() < 0.85) food.push({ id: 2e12 + i, date, calories: r0(I * (1 + 0.08 * r.n())), protein: r0(140 + 20 * r.n()), carbs: r.u() < 0.6 ? r0(250 + 30 * r.n()) : null, fat: r.u() < 0.6 ? r0(75 + 10 * r.n()) : null });
  }
  return {
    bt_entries: JSON.stringify(entries),
    bt_food: JSON.stringify(food),
    bt_settings: JSON.stringify({ goalDir: "lose", rateKgWk: 0.5, proteinPerKg: 1.8, activityFactor: 1.45, height: 175, age: 25, sex: "male" }),
    bt_goals: JSON.stringify({ weight: 80, bodyFat: null }),
    bt_seen_welcome: "true",
  };
}
