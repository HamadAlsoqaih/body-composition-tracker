// Watchdog (orchestrator-only). Exits with one line when something needs attention:
//   STUCK <id> <minutes>   no progress for 20 minutes
//   DAEMON_DOWN            browser daemon not answering
//   HEARTBEAT <status>     every 25 minutes, so the orchestrator can rebalance
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { load } from "./registry.mjs";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const RUN = path.join(ROOT, process.env.RUN_NAME || "run3");
const STUCK_MIN = Number(process.env.STUCK_MIN || 20);
const started = Date.now();
const ping = () => new Promise((res) => { const q = http.request({ host: "127.0.0.1", port: 7700, method: "POST" }, (r) => { r.resume(); res(true); }); q.on("error", () => res(false)); q.setTimeout(20000, () => { q.destroy(); res(false); }); q.end("{}"); });

while (true) {
  const reg = load();
  const running = Object.entries(reg.personas).filter(([, p]) => p.status === "running");
  for (const [id, p] of running) {
    const f = path.join(RUN, "out", id, "actions.log");
    const last = Math.max(fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0, p.startedAt ? Date.parse(p.startedAt) : 0);
    const idle = (Date.now() - last) / 60000;
    if (idle > STUCK_MIN) { console.log(`STUCK ${id} ${Math.round(idle)}`); process.exit(3); }
  }
  if (!(await ping())) { console.log("DAEMON_DOWN"); process.exit(4); }
  if (Date.now() - started > 25 * 60000) { console.log(`HEARTBEAT running=${running.map(([id]) => id).join(",")}`); process.exit(0); }
  await new Promise((r) => setTimeout(r, 60000));
}
