import React, { useMemo, useState } from "react";
import { Sheet, RangeBar, RANGES, Insight } from "./ui.jsx";
import { analyzeComposition, sourceLabel, BIA_MUSCLE_NOTE } from "../lib/composition.js";
import { monthsBefore } from "../lib/dates.js";
import { weightToDisplay, lengthToDisplay, fmt, signed } from "../lib/units.js";

const LABEL = { waist: "Waist", fatMass: "Fat mass", muscleMass: "Muscle mass", bodyFat: "Body fat" };

export default function BodyAnalysisSheet({ entries, cleanWeights, navy, units, today, onClose }) {
  const [range, setRange] = useState("all");
  const a = useMemo(() => {
    const months = RANGES.find((r) => r.key === range)?.months;
    return analyzeComposition(entries, { from: months ? monthsBefore(today, months) : null, to: today, weightSeries: cleanWeights });
  }, [entries, cleanWeights, range, today]);

  const conv = (key, v) => (v == null ? null : key === "waist" ? lengthToDisplay(v, units.length) : key === "bodyFat" ? v : weightToDisplay(v, units.weight));
  const unitOf = (key) => (key === "waist" ? units.length : key === "bodyFat" ? "%" : units.weight);
  const rows = Object.values(a.metrics).filter((m) => m.ok);

  return (
    <Sheet title="Body composition" onClose={onClose} wide>
      <RangeBar value={range} onChange={setRange} />
      <div className="reccard" data-tone={a.tone === "good" ? "add" : a.tone === "warn" ? "cut" : "hold"} style={{ marginBottom: 12 }}>
        <div className="reclabel">{a.status === "insufficient" ? "Composition" : `Confidence: ${a.confidence}`}</div>
        <div className="rectext">{a.headline}</div>
      </div>
      <p className="detbody" style={{ marginBottom: 12 }}>{a.detail}</p>
      {a.change && <Insight tone="warn">{a.change}</Insight>}

      {rows.length > 0 && (
        <>
          <div className="detlabel" style={{ marginTop: 12 }}>First 3 vs last 3 readings (same source)</div>
          <table className="tbl">
            <thead>
              <tr><th>Metric</th><th>First 3</th><th>Last 3</th><th>Change</th><th>Noise</th></tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const u = unitOf(m.key);
                const d = conv(m.key, m.lastMean) - conv(m.key, m.firstMean);
                const lbl = m.source === "dexa" && m.key === "muscleMass" ? "Lean mass" : LABEL[m.key];
                return (
                  <tr key={`${m.source}.${m.key}`}>
                    <td>{lbl}<br /><small className="subtle">{sourceLabel(m.source)}{m.source === "bia" && m.key === "muscleMass" ? ` · ${BIA_MUSCLE_NOTE}` : ""}</small></td>
                    <td>{fmt(conv(m.key, m.firstMean), 1)}</td>
                    <td>{fmt(conv(m.key, m.lastMean), 1)}</td>
                    <td className={m.signal === 0 ? "" : "measure"}>{signed(d, u)}{m.signal === 0 && <><br /><small className="subtle">no measurable change yet</small></>}</td>
                    <td>±{fmt(conv(m.key, m.mdc) - conv(m.key, 0), 1)}</td>
                  </tr>
                );
              })}
              {a.weight.ok && (
                <tr>
                  <td>Weight<br /><small className="subtle">daily weigh-ins</small></td>
                  <td>{fmt(weightToDisplay(a.weight.firstMean, units.weight), 1)}</td>
                  <td>{fmt(weightToDisplay(a.weight.lastMean, units.weight), 1)}</td>
                  <td>{signed(weightToDisplay(a.weight.delta, units.weight), units.weight)}</td>
                  <td>—</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="subtle" style={{ marginTop: 6 }}>"Noise" is the smallest change this method can reliably detect. Smaller changes are reported as no measurable change.</p>
        </>
      )}

      {a.confNote && (
        <div className={`protcard ${a.confidence === "low" ? "low" : "ok"}`} style={{ marginTop: 14 }}>
          <div className="protrow"><span>Confidence</span><strong style={{ textTransform: "capitalize" }}>{a.confidence}</strong></div>
          <div className="protnote">{a.confNote}{a.muscleLowConfidence && a.muscleSig ? ` Muscle change is ${BIA_MUSCLE_NOTE}.` : ""}</div>
        </div>
      )}

      {navy && (
        <div className="notecard" style={{ marginTop: 12 }}>
          US Navy tape estimate: <b>{fmt(navy.bf, 1)}% body fat</b> (from {navy.date}). This is an estimate from circumference measurements, typically within a few percentage points; it's shown for reference and isn't used in the calculations.
        </div>
      )}

      <div className="detnote" style={{ marginTop: 12 }}>
        Each method is compared only with itself (BIA with BIA, DEXA with DEXA). Averages of 3 readings at each end, at least 21 days apart, reduce day-to-day noise. Waist is the main fat signal; scale and caliper readings are the cross-check.
      </div>
    </Sheet>
  );
}
