import React, { useState } from "react";
import { Sheet, Field, NumInput, Seg } from "./ui.jsx";
import { RATE_LIMITS, rateWarning, defaultProteinPerKg, PROTEIN_RANGE } from "../lib/targets.js";
import { effectiveGoal } from "../lib/guardrails.js";
import { parseNum } from "../lib/units.js";

export default function NutritionSettingsSheet({ settings, trendWeight, onSave, onClose, onOpenProfile }) {
  const [d, setD] = useState({ goalDir: settings.goalDir, ratePct: settings.ratePct ?? "", proteinPerKg: settings.proteinPerKg ?? "" });
  const guard = effectiveGoal({ age: settings.age, pregnant: settings.pregnant, weightKg: trendWeight, heightCm: settings.heightCm, dir: "lose" });
  const disabled = !guard.allowTargets ? ["lose", "maintain", "gain"] : guard.dir !== "lose" ? ["lose", ...(settings.pregnant ? ["gain"] : [])] : [];
  const L = RATE_LIMITS[d.goalDir];
  const rate = parseNum(d.ratePct) ?? L.def;
  const warn = rateWarning(d.goalDir, rate);
  const prot = parseNum(d.proteinPerKg);
  const protWarn = prot != null && (prot < PROTEIN_RANGE.min || prot > PROTEIN_RANGE.max) ? `Protein is limited to ${PROTEIN_RANGE.min}–${PROTEIN_RANGE.max} g/kg.` : null;

  const save = () => {
    onSave({
      goalDir: d.goalDir,
      ratePct: d.goalDir === "maintain" ? null : parseNum(d.ratePct),
      proteinPerKg: prot == null ? null : Math.min(PROTEIN_RANGE.max, Math.max(PROTEIN_RANGE.min, prot)),
    });
  };

  return (
    <Sheet title="Nutrition settings" onClose={onClose}>
      {guard.messages.map((m, i) => <div key={i} className="banner warn">{m.text}</div>)}
      <Field label="Goal">
        <Seg options={[{ key: "lose", label: "Lose" }, { key: "maintain", label: "Maintain" }, { key: "gain", label: "Gain" }]} value={d.goalDir} onChange={(g) => setD({ ...d, goalDir: g, ratePct: "" })} disabled={disabled} />
      </Field>
      {d.goalDir !== "maintain" && (
        <Field label="Weekly rate" unit="% of body weight" hint={`Suggested ${L.min}–${L.max}% (default ${L.def}%).`}>
          <NumInput value={d.ratePct} onChange={(v) => setD({ ...d, ratePct: v })} step="0.05" placeholder={String(L.def)} />
        </Field>
      )}
      {warn && <div className="banner warn">{warn}</div>}
      <Field label="Protein" unit="g per kg reference weight" hint={`Leave blank for the default (${defaultProteinPerKg(d.goalDir)} g/kg for this goal). Range ${PROTEIN_RANGE.min}–${PROTEIN_RANGE.max}.`}>
        <NumInput value={d.proteinPerKg} onChange={(v) => setD({ ...d, proteinPerKg: v })} step="0.1" placeholder={String(defaultProteinPerKg(d.goalDir))} />
      </Field>
      {protWarn && <div className="banner warn">{protWarn}</div>}
      <button className="save" onClick={save}>Save settings</button>
      <button className="save" style={{ background: "#26303f", color: "#fff" }} onClick={onOpenProfile}>Edit profile (height, age, activity…)</button>
    </Sheet>
  );
}
