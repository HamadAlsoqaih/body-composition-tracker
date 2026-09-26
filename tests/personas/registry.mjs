// Run registry (orchestrator-only): status of every persona, so a stopped run can resume.
//   node tests/personas/registry.mjs show
//   node tests/personas/registry.mjs set <id> key=value [key=value…]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
export const REG = path.join(ROOT, "results", "_run.json");

export function load() {
  return fs.existsSync(REG) ? JSON.parse(fs.readFileSync(REG, "utf8")) : { startedAt: new Date().toISOString(), personas: {}, events: [] };
}
export function save(r) {
  fs.mkdirSync(path.dirname(REG), { recursive: true });
  fs.writeFileSync(REG, JSON.stringify(r, null, 2));
}

if (process.argv[1].endsWith("registry.mjs")) {
  const [cmd, id, ...kv] = process.argv.slice(2);
  const r = load();
  if (cmd === "set") {
    const p = (r.personas[id] ||= { status: "pending", attempts: 0 });
    for (const pair of kv) {
      const i = pair.indexOf("=");
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      p[k] = v === "now" ? new Date().toISOString() : /^\d+$/.test(v) ? Number(v) : v;
    }
    r.events.push({ at: new Date().toISOString(), id, set: kv });
    save(r);
  } else if (cmd === "note") {
    r.events.push({ at: new Date().toISOString(), note: [id, ...kv].join(" ") });
    save(r);
  }
  const counts = {};
  for (const p of Object.values(r.personas)) counts[p.status] = (counts[p.status] || 0) + 1;
  console.log(JSON.stringify(counts), Object.entries(r.personas).map(([k, v]) => `${k}:${v.status}${v.attempts ? `(${v.attempts})` : ""}`).join(" "));
}
