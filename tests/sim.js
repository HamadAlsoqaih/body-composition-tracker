// Deterministic simulator used by the accuracy tests.
// mulberry32 PRNG + Box–Muller normals.

export function rng(seed) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const normal = () => {
    if (spare != null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0, v = 0;
    while (u === 0) u = uniform();
    while (v === 0) v = uniform();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  return { uniform, normal };
}

import { hallForbesEnergyPerKg } from "../src/lib/energy.js";

/**
 * Simulate a person day by day.
 *  true tissue change/day = (intake − TDEE) / true energyPerKg
 *  water = AR(1) with marginal SD `waterSD`
 *  weigh-in = tissue + water (+ glycogen offset) + N(0, scaleSD²)
 * Options:
 *  tdee: number | (t) => number
 *  rho: number (fixed) | "hall" (updated daily from true fat mass)
 *  formulaError: prior = true TDEE × (1 + formulaError·z), z ~ N(0,1)
 */
export function simulate(opts) {
  const o = {
    days: 42, tdee: 2800, intakeMean: 2300, intakeSD: 150, rho: 7700, w0: 90, fm0: 25,
    phi: 0.6, waterSD: 0.6, scaleSD: 0.2, unloggedFrac: 0, typos: 0, typoKg: 5,
    glycogenDrop: 0, glycogenDays: 5, formulaError: 0.12, seed: 1, ...opts,
  };
  const r = rng(o.seed);
  const tdeeAt = typeof o.tdee === "function" ? o.tdee : () => o.tdee;
  const trueTdee = [], intakeTrue = [], intakeLogged = [], weights = [], tissue = [], fatMass = [], rhoTrue = [];
  let M = o.w0, FM = o.fm0;
  let W = o.waterSD * r.normal();
  const sw = o.waterSD * Math.sqrt(1 - o.phi * o.phi);
  for (let t = 0; t < o.days; t++) {
    if (t > 0) {
      const rho = o.rho === "hall" ? hallForbesEnergyPerKg(FM).energyPerKg : o.rho;
      const dM = (intakeTrue[t - 1] - trueTdee[t - 1]) / rho;
      if (o.rho === "hall") FM += (1 - hallForbesEnergyPerKg(FM).p) * dM;
      M += dM;
      W = o.phi * W + sw * r.normal();
    }
    rhoTrue.push(o.rho === "hall" ? hallForbesEnergyPerKg(FM).energyPerKg : o.rho);
    trueTdee.push(tdeeAt(t));
    const I = o.intakeMean + o.intakeSD * r.normal();
    intakeTrue.push(I);
    intakeLogged.push(r.uniform() < o.unloggedFrac && t > 0 ? null : I);
    const G = o.glycogenDrop ? -o.glycogenDrop * Math.min(t, o.glycogenDays) / o.glycogenDays : 0;
    tissue.push(M);
    fatMass.push(FM);
    weights.push(M + W + G + o.scaleSD * r.normal());
  }
  const typoDays = [];
  while (typoDays.length < o.typos) {
    const d = 1 + Math.floor(r.uniform() * (o.days - 2));
    if (!typoDays.includes(d)) typoDays.push(d);
  }
  for (const d of typoDays) weights[d] += o.typoKg;
  const T0 = trueTdee[0] * (1 + o.formulaError * r.normal());
  return { ...o, trueTdee, intakeTrue, intakeLogged, weights, tissue, fatMass, rhoTrue, typoDays, T0, sigmaF: 0.12 * T0 };
}
