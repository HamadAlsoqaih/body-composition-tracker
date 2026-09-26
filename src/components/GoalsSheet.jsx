import React, { useState } from "react";
import { Sheet, Field, NumInput } from "./ui.jsx";
import { weightFromDisplay, weightToDisplay, parseNum, fmt } from "../lib/units.js";
import { validateGoalWeight } from "../lib/guardrails.js";

export default function GoalsSheet({ goals, units, heightCm, onSave, onClose }) {
  const [d, setD] = useState({ weight: goals.weight != null ? fmt(weightToDisplay(goals.weight, units.weight), 1) : "", bodyFat: goals.bodyFat ?? "" });
  const [err, setErr] = useState(null);
  const save = () => {
    const w = weightFromDisplay(d.weight, units.weight);
    const v = validateGoalWeight(w, heightCm);
    if (!v.ok) {
      if (v.minKg == null) setErr(v.message);
      else {
        const min = `${fmt(weightToDisplay(v.minKg, units.weight), 1)} ${units.weight}`;
        setErr(`That goal is below a BMI of 18.5 for your height (about ${min}), which is classed as underweight. Please choose ${min} or more.`);
      }
      return;
    }
    const bf = parseNum(d.bodyFat);
    if (bf != null && !(bf >= 3 && bf <= 60)) return setErr("Body-fat goal should be between 3% and 60%.");
    onSave({ weight: w, bodyFat: bf });
  };
  return (
    <Sheet title="Set goals" onClose={onClose}>
      <p className="hint" style={{ marginBottom: 16 }}>Rings fill as you move from your first entry toward the goal. Leave blank to remove a goal.</p>
      <Field label="Target weight" unit={units.weight}><NumInput value={d.weight} onChange={(v) => setD({ ...d, weight: v })} /></Field>
      <Field label="Target body fat" unit="%"><NumInput value={d.bodyFat} onChange={(v) => setD({ ...d, bodyFat: v })} /></Field>
      {!heightCm && <p className="hint">Add your height in the profile so goal weights can be checked against a healthy BMI.</p>}
      {err && <div className="banner warn">{err}</div>}
      <button className="save" onClick={save}>Save goals</button>
    </Sheet>
  );
}
