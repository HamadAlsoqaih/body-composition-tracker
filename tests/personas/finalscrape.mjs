// Orchestrator-only (test-only): one extra scrape of the app's visible values at the end of the
// last simulated day, for personas whose agent has finished. The nightly scrape runs inside
// `nextday`, so without this the final day (week 12) would have no row.
// Usage: node tests/personas/finalscrape.mjs [id ...]   (default: every completed persona)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import * as sim from "./sim.js";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const APP = process.env.APP_URL || "http://localhost:4173/";
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const TRUTH = path.join(ROOT, process.env.RUN_NAME || "run3", ".truth");
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function zonedEpoch(date, hhmm, tz) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    guess -= Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - Date.UTC(y, m - 1, d, hh, mm);
  }
  return guess;
}

const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "results", "_run.json"), "utf8"));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(reg.personas).filter((id) => reg.personas[id].status === "completed").sort();
const browser = await chromium.launch();
for (const id of ids) {
  const base = path.join(TRUTH, id);
  const metrics = path.join(base, "metrics.jsonl");
  if (!fs.existsSync(metrics)) { console.log(`${id}: no metrics, skipped`); continue; }
  const rows = fs.readFileSync(metrics, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  if (rows.some((r) => r.final)) { console.log(`${id}: final row already present`); continue; }
  const s = JSON.parse(fs.readFileSync(path.join(base, "state.json"), "utf8"));
  const persona = sim.PERSONAS[id];
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, colorScheme: "dark",
    timezoneId: persona.tz, locale: "en-US", userAgent: IPHONE_UA, storageState: path.join(base, "storage.json"),
  });
  // End of the last simulated day (23:30 local), so that day's logging is in.
  await ctx.clock.install({ time: zonedEpoch(s.date, "23:30", persona.tz) });
  const p2 = await ctx.newPage();
  await p2.goto(APP);
  await p2.waitForTimeout(500);
  // Same visible-value read as the nightly scrape in daemon.mjs.
  const data = await p2.evaluate(async () => {
    const txt = (el) => (el ? el.innerText.replace(/\s+/g, " ").trim() : null);
    const out = { popup: txt(document.querySelector(".welcomecard h2")) };
    const nav = [...document.querySelectorAll(".tabswitch button")];
    nav.find((b) => b.textContent.trim() === "Nutrition")?.click();
    await new Promise((r) => setTimeout(r, 150));
    out.stats = [...document.querySelectorAll(".stat")].map(txt);
    out.recommendation = txt(document.querySelector(".reccard .rectext"));
    out.updated = txt(document.querySelector(".reccard .subtle"));
    out.insights = [...document.querySelectorAll(".insight")].map(txt);
    out.banners = [...document.querySelectorAll(".banner")].map(txt);
    out.macros = [txt(document.querySelector(".protcard")), ...[...document.querySelectorAll(".macro")].map(txt)];
    nav.find((b) => b.textContent.trim() === "Body")?.click();
    await new Promise((r) => setTimeout(r, 150));
    out.composition = txt(document.querySelector(".analysiscard"));
    out.trend = txt([...document.querySelectorAll(".subtle")].find((e) => e.textContent.includes("Trend weight")));
    return out;
  });
  const truth = { trueTdee: Math.round(sim.trueTdee(persona, s)), fm: s.fm, ffm: s.ffm, weight: s.fm + s.ffm, day: s.day, date: s.date, plan: s.plan };
  fs.appendFileSync(metrics, JSON.stringify({ truth, app: data, final: true }) + "\n");
  console.log(`${id}: final row for ${s.date} (day ${s.day + 1}) — ${data.stats?.[0] ?? "no stats"}`);
  await ctx.close();
}
await browser.close();
