// Orchestrator analysis (test-only): compares what the app showed each night
// (scraped from its UI) with the hidden ground truth. Never shown to persona agents.
import fs from "node:fs";
import path from "node:path";
import * as sim from "./sim.js";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const TRUTH = path.join(ROOT, ".truth");
const num = (s) => (s == null ? null : Number(String(s).replace(/,/g, "")));

function parseApp(app) {
  const st = app.stats || [];
  const m = /^([\d,]+) ± ([\d,]+) maintenance kcal\/day\s*(MEASURED|ESTIMATED)?\s*(\d+)?% from your data/i.exec(st[0] || "");
  const t = /^([\d,]+) target kcal\/day\s*(.*)$/i.exec(st[1] || "");
  const r = /([−-]?[\d.]+) (kg|lb)\/week.*95%: ([−-]?[\d.]+) (?:kg|lb) to ([−-]?[\d.]+)/i.exec(st[3] || "");
  const upd = /last update (\d{4}-\d{2}-\d{2})/.exec(app.updated || "");
  const goal = /(lose|maintain|gain)(?: · ([\d.]+)%\/wk)?/.exec(t ? t[2] : "");
  return {
    tdee: m ? num(m[1]) : null, half: m ? num(m[2]) : null, label: m ? (m[3] || "").toLowerCase() : null, share: m ? num(m[4]) : null,
    target: t ? num(t[1]) : null, targetText: t ? t[2].trim() : st[1] || null, dir: goal ? goal[1] : null, ratePct: goal && goal[2] ? Number(goal[2]) : goal && goal[1] === "maintain" ? 0 : null,
    snapshot: upd ? upd[1] : null, rec: app.recommendation, insights: app.insights || [], banners: app.banners || [], composition: app.composition,
    rateUnit: r ? r[2] : null,
  };
}

function replayTruth(id) {
  // truth per date from the persona's saved state (truthLog)
  const s = JSON.parse(fs.readFileSync(path.join(TRUTH, id, "state.json"), "utf8"));
  const byDate = new Map(s.truthLog.map((d) => [d.date, d]));
  return { s, byDate };
}

const pct = (xs, q) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1) + 0.5))]; };

export function analyze(id) {
  const p = sim.PERSONAS[id];
  const f = path.join(TRUTH, id, "metrics.jsonl");
  if (!fs.existsSync(f)) return null;
  const rows = fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const { s, byDate } = replayTruth(id);
  const weeks = [];
  const seenMsgs = new Map();
  let firstMeasured = null;
  for (const row of rows) {
    const a = parseApp(row.app);
    for (const msg of [...a.insights, ...a.banners]) {
      const key = msg.replace(/\d[\d,.]*/g, "#").slice(0, 110);
      if (!seenMsgs.has(key)) seenMsgs.set(key, { first: row.truth.day + 1, text: msg.slice(0, 240), count: 0 });
      seenMsgs.get(key).count++;
    }
    if (a.label === "measured" && firstMeasured == null) firstMeasured = row.truth.day + 1;
    if ((row.truth.day + 1) % 7 !== 0) continue;
    const week = (row.truth.day + 1) / 7;
    const snapTruth = (a.snapshot && byDate.get(a.snapshot)) || byDate.get(row.truth.date);
    const trueT = snapTruth ? snapTruth.trueTdee : row.truth.trueTdee;
    const biasT = trueT * (1 + p.bias);
    let correctTarget = null;
    if (a.dir && trueT) {
      const rate = a.dir === "maintain" ? 0 : (a.ratePct || 0) / 100;
      const sign = a.dir === "lose" ? -1 : a.dir === "gain" ? 1 : 0;
      const w = row.truth.weight;
      const rho = sim.energyPerKg(row.truth.fm);
      correctTarget = (trueT + (sign * rate * w * rho) / 7) * (1 + p.bias);
    }
    weeks.push({
      week, day: row.truth.day + 1, snapshot: a.snapshot, trueTdee: trueT, biasTdee: Math.round(biasT),
      appTdee: a.tdee, half: a.half, label: a.label, share: a.share,
      err: a.tdee != null ? a.tdee - trueT : null, errBias: a.tdee != null ? a.tdee - biasT : null,
      inside: a.tdee != null ? Math.abs(a.tdee - trueT) <= a.half : null, insideBias: a.tdee != null ? Math.abs(a.tdee - biasT) <= a.half : null,
      target: a.target, targetText: a.targetText, correctTarget: correctTarget && Math.round(correctTarget),
      targetOk: a.target != null && correctTarget != null ? Math.abs(a.target - correctTarget) <= Math.max(150, 0.07 * correctTarget) : null,
      rec: a.rec, composition: a.composition, trueWeight: +row.truth.weight.toFixed(1), fm: +row.truth.fm.toFixed(1), ffm: +row.truth.ffm.toFixed(1),
    });
  }
  const last = rows.at(-1);
  const start = s.truthLog[0];
  return {
    id, name: p.name, weeks, firstMeasured, messages: [...seenMsgs.values()],
    storage: last?.app?.storage, finalComposition: last?.app?.composition,
    trueChange: start && last ? { weight: +(last.truth.weight - p.weight).toFixed(1), fm: +(last.truth.fm - (p.weight * p.bf) / 100).toFixed(1), ffm: +(last.truth.ffm - (p.weight - (p.weight * p.bf) / 100)).toFixed(1) } : null,
    daysSimulated: rows.length,
  };
}

export function summary(results) {
  const at = (w, key) => results.map((r) => r.weeks.find((x) => x.week === w)).filter((x) => x && x[key] != null);
  const out = {};
  for (const w of [4, 8, 12]) {
    const e = at(w, "err").map((x) => Math.abs(x.err));
    const eb = at(w, "errBias").map((x) => Math.abs(x.errBias));
    const cov = at(w, "inside");
    const covB = at(w, "insideBias");
    out[`week${w}`] = {
      n: e.length, medianAbsErr: pct(e, 0.5), p90AbsErr: pct(e, 0.9), medianAbsErrLoggingUnits: pct(eb, 0.5), p90AbsErrLoggingUnits: pct(eb, 0.9),
      coverage: cov.length ? +(cov.filter((x) => x.inside).length / cov.length).toFixed(2) : null,
      coverageLoggingUnits: covB.length ? +(covB.filter((x) => x.insideBias).length / covB.length).toFixed(2) : null,
    };
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith("analyze.mjs")) {
  const ids = fs.existsSync(TRUTH) ? fs.readdirSync(TRUTH).filter((d) => sim.PERSONAS[d]).sort() : [];
  const results = ids.map(analyze).filter(Boolean);
  const out = { summary: summary(results), personas: results };
  fs.writeFileSync(path.join(ROOT, "analysis.json"), JSON.stringify(out, null, 2));
  for (const r of results) {
    const w = r.weeks.at(-1);
    console.log(`${r.id} ${r.name.padEnd(15)} days=${r.daysSimulated} ${w ? `wk${w.week} app=${w.appTdee}±${w.half} ${w.label} true=${w.trueTdee} (logging units ${w.biasTdee}) err=${w.err} inside=${w.inside} target=${w.target} correct≈${w.correctTarget} ok=${w.targetOk}` : "no full week yet"}`);
  }
  console.log(JSON.stringify(out.summary, null, 1));
}
