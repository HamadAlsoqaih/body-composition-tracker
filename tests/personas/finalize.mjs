// Save one persona's results the moment it finishes (orchestrator-only).
//   node tests/personas/finalize.mjs <id> <completed|failed> [replyFile] [error text]
import fs from "node:fs";
import path from "node:path";
import * as sim from "./sim.js";
import { analyze } from "./analyze.mjs";
import { load, save } from "./registry.mjs";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const RUN = path.join(ROOT, process.env.RUN_NAME || "run3");
const [id, status, replyFile, ...err] = process.argv.slice(2);
const read = (f) => (f && fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
const statePath = path.join(RUN, ".truth", id, "state.json");
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : null;
const reg = load();
const entry = (reg.personas[id] ||= { status: "pending", attempts: 0 });
entry.status = status;
entry.finishedAt = new Date().toISOString();
if (err.length) entry.error = err.join(" ");
save(reg);

const result = {
  id, name: sim.PERSONAS[id].name, seed: sim.SEEDS[id], status, error: entry.error || null,
  attempts: entry.attempts, startedAt: entry.startedAt || null, finishedAt: entry.finishedAt,
  daysSimulated: state ? state.day : 0, plannedDays: sim.PERSONAS[id].weeks * 7,
  planHistory: state ? state.planHistory : [],
  truthStart: state ? state.truthLog[0] : null, truthEnd: state ? state.truthLog.at(-1) : null,
  analysis: analyze(id),
  journal: read(path.join(RUN, "out", id, "journal.md")),
  agentReply: read(replyFile),
  downloads: fs.existsSync(path.join(RUN, "out", id, "downloads")) ? fs.readdirSync(path.join(RUN, "out", id, "downloads")) : [],
};
fs.mkdirSync(path.join(ROOT, "results"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "results", `${id}.json`), JSON.stringify(result, null, 2));
console.log(`saved results/${id}.json (${status}, ${result.daysSimulated}/${result.plannedDays} days)`);
