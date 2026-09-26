// Persona study browser daemon (test-only). One Chromium, one context per persona.
// Each persona context: iPhone-sized 375×812, touch, dark scheme, persona time zone,
// fake clock (context.clock) driven by the simulated calendar.
// Storage and clock are saved to disk after every command so a restart loses nothing.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import * as sim from "./sim.js";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const APP = process.env.APP_URL || "http://localhost:4173/";
const PORT = Number(process.env.PORT || 7700);
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, "out");
const TRUTH = path.join(ROOT, ".truth");
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const browser = await chromium.launch();
const P = new Map(); // id → { ctx, page, dialogs, downloads, busy }

const dir = (base, id) => { const d = path.join(base, id); fs.mkdirSync(d, { recursive: true }); return d; };
const statePath = (id) => path.join(dir(TRUTH, id), "state.json");
const loadSim = (id) => (fs.existsSync(statePath(id)) ? JSON.parse(fs.readFileSync(statePath(id), "utf8")) : null);
const saveSim = (id, s) => fs.writeFileSync(statePath(id), JSON.stringify(s));
const log = (id, line) => fs.appendFileSync(path.join(dir(OUT, id), "actions.log"), `${new Date().toISOString()} ${line}\n`);

/** Epoch ms for a wall-clock time in an IANA zone (DST-aware). */
function zonedEpoch(date, hhmm, tz) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    guess -= asUTC - Date.UTC(y, m - 1, d, hh, mm);
  }
  return guess;
}

async function ensure(id) {
  if (P.has(id)) return P.get(id);
  const persona = sim.PERSONAS[id];
  if (!persona) throw new Error(`unknown persona ${id}`);
  let s = loadSim(id);
  const fresh = !s;
  if (fresh) { s = sim.initState(id); s.clock = { date: s.date, time: "06:30" }; saveSim(id, s); }
  const storageFile = path.join(dir(TRUTH, id), "storage.json");
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    colorScheme: "dark", timezoneId: persona.tz, locale: "en-US", userAgent: IPHONE_UA, acceptDownloads: true,
    storageState: fs.existsSync(storageFile) ? storageFile : undefined,
  });
  await ctx.clock.install({ time: zonedEpoch(s.clock.date, s.clock.time, persona.tz) });
  if (fresh && persona.history) {
    const seed = sim.v1History(id);
    await ctx.addInitScript((seed) => {
      if (!localStorage.getItem("__persona_seeded")) {
        for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
        localStorage.setItem("__persona_seeded", "1");
      }
    }, seed);
  }
  const page = await ctx.newPage();
  const entry = { ctx, page, dialogs: [], downloads: [], storageFile, busy: Promise.resolve() };
  page.on("dialog", async (d) => { entry.dialogs.push(`${d.type()}: ${d.message()}`); await d.accept(); });
  page.on("download", async (dl) => {
    const f = path.join(dir(OUT, id), "downloads", dl.suggestedFilename());
    fs.mkdirSync(path.dirname(f), { recursive: true });
    await dl.saveAs(f);
    entry.downloads.push(f);
  });
  page.on("pageerror", (e) => log(id, `PAGEERROR ${e.message}`));
  await page.goto(APP);
  await page.waitForTimeout(400);
  P.set(id, entry);
  return entry;
}

async function persist(id) {
  const e = P.get(id);
  await e.ctx.storageState({ path: e.storageFile });
}

// ---------- screen reading ----------
async function topLayer(page) {
  const layers = page.locator(".welcomecard, .sheetinner");
  const n = await layers.count();
  return n ? layers.nth(n - 1) : page.locator(".app");
}

async function notices(page) {
  return page.evaluate(() => {
    const t = (s) => [...document.querySelectorAll(s)].map((e) => e.innerText.trim().replace(/\s+/g, " ")).filter(Boolean);
    return {
      popup: t(".welcomecard h2"),
      sheet: t(".sheetinner h2"),
      banners: t(".banner"),
      insights: t(".insight"),
      recommendation: t(".reccard .rectext"),
    };
  });
}

async function look(page, id) {
  const layer = await topLayer(page);
  let snap = await layer.ariaSnapshot().catch(() => "");
  const lines = snap.split("\n");
  if (lines.length > 160) snap = lines.slice(0, 160).join("\n") + `\n… (${lines.length - 160} more lines — scroll or use 'find')`;
  const shot = path.join(dir(OUT, id), "screens", `${Date.now()}.png`);
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });
  return `${snap}\n[screenshot: ${shot}]`;
}

// find a tappable thing by its visible name, inside the top layer
async function target(page, name, nth = 0, roles = ["button", "checkbox", "link", "tab", "radio"]) {
  const layer = await topLayer(page);
  const tries = [];
  for (const exact of [true, false]) for (const role of roles) tries.push(layer.getByRole(role, { name, exact }));
  tries.push(layer.getByText(name, { exact: true }), layer.getByText(name));
  for (const loc of tries) {
    const vis = loc.filter({ visible: true });
    if ((await vis.count()) > nth) return vis.nth(nth);
  }
  return null;
}

async function field(page, label, nth = 0) {
  const layer = await topLayer(page);
  for (const loc of [layer.getByLabel(label, { exact: true }), layer.getByLabel(label), layer.getByPlaceholder(label)]) {
    const vis = loc.filter({ visible: true });
    if ((await vis.count()) > nth) return vis.nth(nth);
  }
  // hidden-by-scroll fields are still fillable
  for (const loc of [layer.getByLabel(label), layer.getByPlaceholder(label)]) if ((await loc.count()) > nth) return loc.nth(nth);
  return null;
}

async function visibleButtons(page) {
  const layer = await topLayer(page);
  return (await layer.getByRole("button").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40);
}

// ---------- commands ----------
async function run(id, cmd, args) {
  const e = await ensure(id);
  const { page } = e;
  const s = loadSim(id);
  const persona = sim.PERSONAS[id];
  let out = "";
  e.dialogs = [];
  e.downloads = [];
  const before = JSON.stringify(await notices(page).catch(() => ({})));
  switch (cmd) {
    case "look":
      out = await look(page, id);
      break;
    case "tap": {
      const t = await target(page, args[0], Number(args[1] || 0));
      if (!t) throw new Error(`Nothing called "${args[0]}" to tap. Buttons on screen: ${JSON.stringify(await visibleButtons(page))}`);
      await t.scrollIntoViewIfNeeded().catch(() => {});
      await t.tap();
      out = `tapped "${args[0]}"`;
      break;
    }
    case "tapoutside":
      await page.touchscreen.tap(8, 8);
      out = "tapped the dark area outside the window";
      break;
    case "fill": {
      const f = await field(page, args[0], Number(args[2] || 0));
      if (!f) throw new Error(`No field labelled "${args[0]}". Buttons on screen: ${JSON.stringify(await visibleButtons(page))}`);
      await f.scrollIntoViewIfNeeded().catch(() => {});
      await f.fill(String(args[1]));
      out = `typed "${args[1]}" into "${args[0]}"`;
      break;
    }
    case "check": {
      const f = (await field(page, args[0])) || (await target(page, args[0], 0, ["checkbox"]));
      if (!f) throw new Error(`No switch/checkbox labelled "${args[0]}"`);
      await f.scrollIntoViewIfNeeded().catch(() => {});
      await f.tap();
      out = `toggled "${args[0]}"`;
      break;
    }
    case "select": {
      const f = await field(page, args[0]);
      if (!f) throw new Error(`No dropdown labelled "${args[0]}"`);
      await f.selectOption({ label: args[1] });
      out = `chose "${args[1]}" in "${args[0]}"`;
      break;
    }
    case "upload": {
      const layer = await topLayer(page);
      await layer.locator('input[type="file"]').first().setInputFiles(args[0]);
      out = `picked file ${args[0]}`;
      break;
    }
    case "key":
      await page.keyboard.press(args[0]);
      out = `pressed ${args[0]}`;
      break;
    case "scroll": {
      const where = args[0] || "down";
      await page.evaluate((where) => {
        const layers = document.querySelectorAll(".welcomecard, .sheetinner");
        const el = layers.length ? layers[layers.length - 1] : document.scrollingElement;
        const h = el === document.scrollingElement ? innerHeight : el.clientHeight;
        if (where === "top") el.scrollTop = 0;
        else if (where === "bottom") el.scrollTop = el.scrollHeight;
        else el.scrollTop += (where === "up" ? -0.8 : 0.8) * h;
      }, where);
      out = `scrolled ${where}`;
      break;
    }
    case "find": {
      const layer = await topLayer(page);
      const txt = await layer.innerText();
      const hits = txt.split("\n").filter((l) => l.toLowerCase().includes(String(args[0]).toLowerCase()));
      out = hits.length ? hits.join("\n") : `"${args[0]}" is not on this screen`;
      break;
    }
    case "read": {
      const layer = await topLayer(page);
      out = (await layer.innerText()).replace(/\n{3,}/g, "\n\n");
      break;
    }
    case "time": {
      // time HH:MM [next] — the clock moves forward to that time today (or after midnight)
      const date = args[1] === "next" ? sim.addDays(s.date, 1) : s.date;
      const t = zonedEpoch(date, args[0], persona.tz);
      const now = await page.evaluate(() => Date.now());
      if (t > now) await e.ctx.clock.setSystemTime(t);
      await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
      s.clock = { date, time: args[0] };
      saveSim(id, s);
      out = `It is now ${date} ${args[0]} (${persona.tz}).`;
      break;
    }
    case "day":
      out = sim.lifeLog(id, s);
      saveSim(id, s);
      break;
    case "plan": {
      sim.setPlan(s, Number(args[0]));
      saveSim(id, s);
      out = `From tomorrow you'll aim to eat about ${args[0]} kcal a day (by your own counting).`;
      break;
    }
    case "nextday": {
      await scrape(id, s);
      sim.advance(id, s);
      const wake = persona.nightShift ? "15:30" : "06:30";
      s.clock = { date: s.date, time: wake };
      await e.ctx.clock.setSystemTime(zonedEpoch(s.date, wake, persona.tz));
      await page.reload();
      await page.waitForTimeout(400);
      saveSim(id, s);
      out = `— A new day. You open the app. —\n${sim.lifeLog(id, s)}`;
      saveSim(id, s);
      break;
    }
    case "screens":
      out = await look(page, id);
      break;
    default:
      throw new Error(`unknown command ${cmd}. Commands: look, read, find, tap, tapoutside, fill, check, select, upload, key, scroll, time, day, plan, nextday`);
  }
  await page.waitForTimeout(200);
  const after = await notices(page).catch(() => ({}));
  const extra = [];
  if (e.dialogs.length) extra.push(`[the app asked] ${e.dialogs.join(" | ")} → you tapped OK`);
  if (e.downloads.length) extra.push(`[downloaded file] ${e.downloads.join(", ")}`);
  if (JSON.stringify(after) !== before && cmd !== "look") {
    const parts = [];
    if (after.popup?.length) parts.push(`popup: ${after.popup.join(" | ")}`);
    if (after.sheet?.length) parts.push(`open panel: ${after.sheet.join(" | ")}`);
    if (after.banners?.length) parts.push(`banners: ${after.banners.map((b) => b.slice(0, 160)).join(" || ")}`);
    if (after.recommendation?.length) parts.push(`recommendation: ${after.recommendation.join(" ").slice(0, 300)}`);
    if (after.insights?.length) parts.push(`notes: ${after.insights.map((b) => b.slice(0, 160)).join(" || ")}`);
    if (parts.length) extra.push(`[on screen now] ${parts.join("\n  ")}`);
  }
  log(id, `${cmd} ${JSON.stringify(args)}`);
  await persist(id);
  return [out, ...extra].join("\n");
}

// ---------- orchestrator-only metrics (never shown to persona agents) ----------
async function scrape(id, s) {
  const e = P.get(id);
  const p2 = await e.ctx.newPage();
  try {
    await p2.goto(APP);
    await p2.waitForTimeout(500);
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
      out.storage = { entries: JSON.parse(localStorage.getItem("bt_entries") || "[]").length, food: JSON.parse(localStorage.getItem("bt_food") || "[]").length, meta: localStorage.getItem("bt_meta"), settings: localStorage.getItem("bt_settings") };
      return out;
    });
    const truth = { trueTdee: Math.round(sim.trueTdee(sim.PERSONAS[id], s)), fm: s.fm, ffm: s.ffm, weight: s.fm + s.ffm, day: s.day, date: s.date, plan: s.plan };
    fs.appendFileSync(path.join(dir(TRUTH, id), "metrics.jsonl"), JSON.stringify({ truth, app: data }) + "\n");
  } catch (err) {
    log(id, `SCRAPE ERROR ${err.message}`);
  } finally {
    await p2.close();
  }
}

// serialize commands per persona
const server = http.createServer(async (req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const { id, cmd, args = [] } = JSON.parse(body || "{}");
      const e = P.get(id);
      const prev = e ? e.busy : Promise.resolve();
      let result;
      const job = prev.then(async () => { result = await run(id, cmd, args); });
      if (P.get(id)) P.get(id).busy = job.catch(() => {});
      await job;
      res.end(JSON.stringify({ ok: true, out: result }));
    } catch (err) {
      res.end(JSON.stringify({ ok: false, out: `ERROR: ${err.message.split("\n")[0]}` }));
    }
  });
});
server.listen(PORT, () => console.log(`persona daemon on ${PORT}`));
