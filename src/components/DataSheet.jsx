import React, { useMemo, useState } from "react";
import { Sheet, download, shareOrDownload } from "./ui.jsx";
import { buildBackup, validateBackup, mergeStates, weightsCSV, measurementsCSV, foodCSV, countsOf, CORRUPT_PREFIX } from "../lib/storage.js";
import { buildDailyExport, dailyExportSummary, dailyExportFilename } from "../lib/export.js";
import { addDays } from "../lib/dates.js";

const DAILY_RANGES = [
  { key: "all", label: "All data" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "custom", label: "Custom" },
];

/** Readable day-by-day export for analysis (not a backup; Import won't accept it). */
function DailyExport({ state, today }) {
  const [mode, setMode] = useState("all");
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [includeEntries, setIncludeEntries] = useState(false);

  const range = useMemo(() => {
    if (mode === "all") return {};
    if (mode === "custom") {
      if (!from || !to) return { error: "Choose a start and end date." };
      if (from > to) return { error: "The start date must be on or before the end date." };
      return { from, to };
    }
    return { from: addDays(today, -(Number(mode) - 1)), to: today };
  }, [mode, from, to, today]);

  const preview = useMemo(() => {
    if (range.error) return null;
    try {
      return dailyExportSummary(buildDailyExport(state, { from: range.from, to: range.to }));
    } catch {
      return null;
    }
  }, [state, range]);

  const empty = !preview || preview.days === 0;

  const doExport = () => {
    if (empty) return;
    const exp = buildDailyExport(state, { from: range.from, to: range.to, includeEntries });
    shareOrDownload(dailyExportFilename(exp), JSON.stringify(exp, null, 2));
  };

  return (
    <>
      <div className="detlabel" style={{ marginTop: 16 }}>Daily data export</div>
      <p className="subtle" style={{ marginBottom: 8 }}>One entry per day with data, in kg, cm, kcal and g — for spreadsheets or analysis. This isn't a backup and can't be imported.</p>
      <div className="chips">
        {DAILY_RANGES.map((r) => (
          <button key={r.key} className={`chip${mode === r.key ? " on" : ""}`} onClick={() => setMode(r.key)}>{r.label}</button>
        ))}
      </div>
      {mode === "custom" && (
        <div className="tapegrid">
          <label className="fld"><span>From</span><input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="fld"><span>To</span><input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      )}
      <label className="toggle">
        <span>Include individual food entries</span>
        <input type="checkbox" checked={includeEntries} onChange={(e) => setIncludeEntries(e.target.checked)} />
      </label>
      {range.error ? (
        <div className="banner warn">{range.error}</div>
      ) : empty ? (
        <p className="subtle">No data in this range.</p>
      ) : (
        <p className="subtle">
          {preview.from} → {preview.to} · {preview.days} day{preview.days === 1 ? "" : "s"} with data · {preview.weighInDays} weigh-in day{preview.weighInDays === 1 ? "" : "s"} · {preview.foodDays} food day{preview.foodDays === 1 ? "" : "s"} · {preview.tapeDays} tape day{preview.tapeDays === 1 ? "" : "s"}
        </p>
      )}
      <button className="btnsm primary" style={{ marginTop: 8 }} disabled={empty || !!range.error} onClick={doExport}>Export daily data (JSON)</button>
    </>
  );
}

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
    const next = mode === "replace" ? { ...preview.state, meta: { ...preview.state.meta, persistRequested: state.meta.persistRequested, whatsNewSeen: state.meta.whatsNewSeen } } : mergeStates(state, preview.state);
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

      <DailyExport state={state} today={today} />

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
