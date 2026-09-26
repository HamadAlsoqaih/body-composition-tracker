#!/usr/bin/env node
// Persona CLI (test-only): talk to the app like a phone user.
//   node tests/personas/bt.mjs <id> <command> [args…]
//   node tests/personas/bt.mjs <id> run <file>     (one command per line, for daily routines)
import fs from "node:fs";
import http from "node:http";

const [id, cmd, ...args] = process.argv.slice(2);
const PORT = Number(process.env.PORT || 7700);

function call(cmd, args) {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, method: "POST", path: "/" }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve({ ok: false, out: b }); } });
    });
    req.on("error", (e) => resolve({ ok: false, out: `ERROR: daemon not reachable (${e.message})` }));
    req.end(JSON.stringify({ id, cmd, args }));
  });
}

// split a line like: fill "Calories" "650"
const split = (line) => (line.match(/"([^"]*)"|'([^']*)'|(\S+)/g) || []).map((t) => t.replace(/^["']|["']$/g, ""));

if (!id || !cmd) {
  console.log("usage: bt.mjs <id> <look|read|find|tap|tapoutside|fill|check|select|upload|key|scroll|time|day|plan|nextday|run> [args]");
  process.exit(1);
}
if (cmd === "run") {
  const lines = fs.readFileSync(args[0], "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  for (const line of lines) {
    const [c, ...a] = split(line);
    const r = await call(c, a);
    console.log(`> ${line}\n${r.out}`);
    if (!r.ok && !process.env.KEEP_GOING) process.exit(2);
  }
} else {
  const r = await call(cmd, args);
  console.log(r.out);
  if (!r.ok) process.exit(2);
}
