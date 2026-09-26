import React, { useState } from "react";
import { Sheet, Field, NumInput, Seg } from "./ui.jsx";
import { weightFromDisplay, lengthFromDisplay, parseNum } from "../lib/units.js";
import { averageReadings } from "../lib/composition.js";
import { newId } from "../lib/foodlog.js";

export const TAPE = [
  { key: "neck", label: "Neck" },
  { key: "chest", label: "Chest" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "armL", label: "Arm L" },
  { key: "armR", label: "Arm R" },
  { key: "thighL", label: "Thigh L" },
  { key: "thighR", label: "Thigh R" },
  { key: "calfL", label: "Calf L" },
  { key: "calfR", label: "Calf R" },
];

const pad = (n) => String(n).padStart(2, "0");
const nowHM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Weight & composition (BIA / DEXA / calipers) or tape measurements. */
export default function EntrySheet({ type, today, units, onSave, onClose }) {
  const [d, setD] = useState({ date: today, time: nowHM(), source: "bia", waist1: "", waist2: "", waist3: "" });
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));
  const wu = units.weight, lu = units.length;

  const save = () => {
    const e = { id: newId(), date: d.date || today };
    if (type === "comp") {
      const [hh, mm] = (d.time || "").split(":").map(Number);
      const [y, mo, da] = e.date.split("-").map(Number);
      if (Number.isFinite(hh) && Number.isFinite(mm)) e.time = new Date(y, mo - 1, da, hh, mm).toISOString();
      e.source = d.source;
      const w = weightFromDisplay(d.weight, wu);
      const bf = parseNum(d.bodyFat);
      const fm = weightFromDisplay(d.fatMass, wu);
      const mm2 = weightFromDisplay(d.muscleMass, wu);
      if (w != null) e.weight = w;
      if (bf != null) e.bodyFat = bf;
      if (fm != null) e.fatMass = fm;
      else if (w != null && bf != null) e.fatMass = +(w * (bf / 100)).toFixed(2);
      if (mm2 != null) e.muscleMass = mm2;
      if ([e.weight, e.bodyFat, e.fatMass, e.muscleMass].every((v) => v == null)) return setErr("Enter at least one value.");
      if ((e.weight != null && !(e.weight > 20 && e.weight < 400)) || (e.bodyFat != null && !(e.bodyFat > 2 && e.bodyFat < 75))) return setErr("That value looks out of range — please check it.");
    } else {
      e.source = "tape";
      for (const t of TAPE) {
        if (t.key === "waist") continue;
        const v = lengthFromDisplay(d[t.key], lu);
        if (v != null && v > 0) e[t.key] = v;
      }
      const readings = [d.waist1, d.waist2, d.waist3].map((v) => lengthFromDisplay(v, lu)).filter((v) => v != null && v > 0);
      if (readings.length) {
        e.waist = averageReadings(readings);
        e.waistReadings = readings;
      }
      if (!TAPE.some((t) => e[t.key] != null)) return setErr("Enter at least one measurement.");
    }
    onSave(e);
  };

  return (
    <Sheet title={type === "comp" ? "Weight & composition" : "Tape measurements"} onClose={onClose}>
      <div className="tapegrid">
        <Field label="Date"><input type="date" value={d.date} max={today} onChange={(e) => set("date")(e.target.value)} /></Field>
        {type === "comp" && <Field label="Time"><input type="time" value={d.time} onChange={(e) => set("time")(e.target.value)} /></Field>}
      </div>
      {type === "comp" ? (
        <>
          <Field label="Measured with">
            <Seg options={[{ key: "bia", label: "BIA scale" }, { key: "dexa", label: "DEXA" }, { key: "calipers", label: "Calipers" }]} value={d.source} onChange={set("source")} />
          </Field>
          <Field label="Weight" unit={wu}><NumInput value={d.weight} onChange={set("weight")} /></Field>
          <Field label="Body fat" unit="%"><NumInput value={d.bodyFat} onChange={set("bodyFat")} /></Field>
          {d.source !== "calipers" && (
            <>
              <Field label="Fat mass" unit={wu}><NumInput value={d.fatMass} onChange={set("fatMass")} placeholder="auto if blank" /></Field>
              <Field label={d.source === "dexa" ? "Lean mass" : "Muscle mass"} unit={wu}><NumInput value={d.muscleMass} onChange={set("muscleMass")} /></Field>
            </>
          )}
          <p className="hint">For weight, weigh at a consistent time (e.g. morning, after the bathroom). If you weigh more than once a day, the earliest weigh-in counts.</p>
        </>
      ) : (
        <>
          <div className="fld"><span>Waist <small>{lu} · 2–3 readings are averaged</small></span></div>
          <div className="tapegrid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            {["waist1", "waist2", "waist3"].map((k, i) => (
              <label key={k} className="fld"><NumInput value={d[k]} onChange={set(k)} placeholder={i === 0 ? "1st" : i === 1 ? "2nd" : "3rd"} /></label>
            ))}
          </div>
          <div className="tapegrid">
            {TAPE.filter((t) => t.key !== "waist").map((t) => (
              <Field key={t.key} label={t.label} unit={lu}><NumInput value={d[t.key]} onChange={set(t.key)} /></Field>
            ))}
          </div>
        </>
      )}
      {err && <div className="banner warn">{err}</div>}
      <button className="save" onClick={save}>Save entry</button>
    </Sheet>
  );
}
