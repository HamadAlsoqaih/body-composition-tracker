import React, { useState } from "react";
import { Sheet, download } from "./ui.jsx";
import { buildBackup, validateBackup, mergeStates, weightsCSV, measurementsCSV, foodCSV, countsOf, CORRUPT_PREFIX } from "../lib/storage.js";

function Counts({ c }) {
  return (
    <div className="kv">
      <span>Weigh-ins</span><span>{c.weighIns}</span>
      <span>Measurement entries</span><span>{c.measurements}</span>
      <span>Food entries</span><span>{c.foodEntries}</span>
      <span>Complete days</span><span>{c.completeDays}</span>
    </div>
  );
}

/** Backup, CSV export, import (validate → preview → replace/merge) and recovery. */
export default function DataSheet({ state, today, corrupt, persist, iosHint, onReplace, onMarkBackup, onClearCorrupt, onClose }) {
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState(null);

  const exportJSON = () => {
    if (download(`bodytracker-backup-${today}.json`, JSON.stringify(buildBackup(state), null, 2))) onMarkBackup(today);
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return setMsg("That file is too large to be a BodyTracker backup.");
    const reader = new FileReader();
    reader.onload = () => {
      const v = validateBackup(String(reader.result), today);
      if (!v.ok) {
        setPreview(null);
        setMsg(`Import rejected: ${v.errors.join(" ")}`);
      } else {
        setMsg(null);
        setPreview(v);
      }
    };
    reader.onerror = () => setMsg("Couldn't read that file.");
    reader.readAsText(file);
  };

  const apply = (mode) => {
    if (!preview) return;
    const ok = confirm(mode === "replace" ? "Replace ALL current data with this backup? Export a backup of the current data first if you might need it." : "Merge this backup into your current data? Items already present are kept.");
    if (!ok) return;
    const next = mode === "replace" ? { ...preview.state, meta: { ...preview.state.meta, persistRequested: state.meta.persistRequested } } : mergeStates(state, preview.state);
    onReplace(next);
    setPreview(null);
    setMsg(mode === "replace" ? "Backup restored." : "Backup merged.");
  };

  return (
    <Sheet title="Your data" onClose={onClose}>
      <p className="subtle" style={{ marginBottom: 12 }}>Everything is stored only on this device. Export a backup regularly — clearing browser data deletes it.</p>
      {iosHint && <div className="banner warn">On iPhone/iPad, Safari can delete data for sites you haven't opened in 7 days. Add BodyTracker to your Home Screen (Share → Add to Home Screen) and keep backups.</div>}
      {persist && <p className="subtle">Persistent storage: {persist.supported ? (persist.persisted ? "granted" : "not granted by the browser") : "not supported by this browser"}.</p>}
      <Counts c={countsOf(state)} />
      <p className="subtle" style={{ marginTop: 6 }}>Last backup: {state.meta.lastBackupAt || "never"}</p>

      <div className="detlabel" style={{ marginTop: 16 }}>Export</div>
      <div className="brow" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button className="btnsm primary" onClick={exportJSON}>Full backup (JSON)</button>
        <button className="btnsm" onClick={() => download(`bodytracker-weights-${today}.csv`, weightsCSV(state.entries), "text/csv")}>Weights CSV</button>
        <button className="btnsm" onClick={() => download(`bodytracker-food-${today}.csv`, foodCSV(state.food, state.days), "text/csv")}>Food CSV</button>
        <button className="btnsm" onClick={() => download(`bodytracker-measurements-${today}.csv`, measurementsCSV(state.entries), "text/csv")}>Measurements CSV</button>
      </div>

      <div className="detlabel" style={{ marginTop: 16 }}>Import a backup</div>
      <input type="file" accept="application/json,.json" onChange={onFile} />
      {msg && <div className="banner" style={{ marginTop: 10 }}>{msg}</div>}
      {preview && (
        <div className="banner" style={{ marginTop: 10 }}>
          <b>Backup contents</b> (schema v{preview.version})
          <Counts c={preview.counts} />
          <div className="brow">
            <button className="btnsm primary" onClick={() => apply("merge")}>Merge</button>
            <button className="btnsm danger" onClick={() => apply("replace")}>Replace all</button>
            <button className="btnsm" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      {corrupt.length > 0 && (
        <>
          <div className="detlabel" style={{ marginTop: 16 }}>Recovery</div>
          {corrupt.map((c) => (
            <div key={c.key} className="banner warn">
              Saved data "{c.key}" couldn't be read, so the app started without it. A copy was kept as {CORRUPT_PREFIX}{c.key}.
              <div className="brow">
                <button className="btnsm" onClick={() => download(`${c.key}-unreadable.txt`, c.raw || "", "text/plain")}>Download raw copy</button>
                <button className="btnsm danger" onClick={() => { if (confirm("Delete the unreadable copy?")) onClearCorrupt(c.key); }}>Delete copy</button>
              </div>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}
