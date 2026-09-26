import React, { useState } from "react";
import { Sheet, Field, NumInput, Seg } from "./ui.jsx";
import { ACTIVITY_LEVELS, activityFromSteps } from "../lib/energy.js";
import { weightFromDisplay, weightToDisplay, lengthFromDisplay, lengthToDisplay, parseNum, fmt, KG_PER_LB } from "../lib/units.js";
import { newId } from "../lib/foodlog.js";
import { isDateString } from "../lib/dates.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const r1 = (v) => (v == null ? "" : String(Math.round(v * 10) / 10));

/**
 * Onboarding + profile editor. Collects everything the formula and filter
 * need; nothing is filled in silently.
 */
export default function ProfileSheet({ state, today, latestWeight, onSave, onClose, legacy }) {
  const s = state.settings;
  const [units, setUnits] = useState(s.units);
  const [d, setD] = useState({
    height: r1(lengthToDisplay(s.heightCm, s.units.length)),
    age: s.age ?? "",
    sex: s.sex,
    weight: latestWeight != null ? r1(weightToDisplay(latestWeight, s.units.weight)) : "",
    activity: s.activity,
    steps: s.steps ?? "",
    bfValue: s.bf?.value ?? "",
    bfSource: s.bf?.source ?? "bia",
    alreadyStable: s.alreadyStable,
    checkinWeekday: s.checkinWeekday ?? new Date().getDay(),
    pregnant: s.pregnant,
  });
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));

  // converting the unit toggles converts what's typed
  const switchWeight = (u) => {
    if (u === units.weight) return;
    const kg = weightFromDisplay(d.weight, units.weight);
    setD((x) => ({ ...x, weight: kg == null ? "" : r1(weightToDisplay(kg, u)) }));
    setUnits((x) => ({ ...x, weight: u }));
  };
  const switchLength = (u) => {
    if (u === units.length) return;
    const cm = lengthFromDisplay(d.height, units.length);
    setD((x) => ({ ...x, height: cm == null ? "" : r1(lengthToDisplay(cm, u)) }));
    setUnits((x) => ({ ...x, length: u }));
  };

  const suggested = activityFromSteps(parseNum(d.steps));

  const save = () => {
    const heightCm = lengthFromDisplay(d.height, units.length);
    const age = parseNum(d.age);
    const weightKg = weightFromDisplay(d.weight, units.weight);
    const bf = parseNum(d.bfValue);
    const problems = [];
    if (!(heightCm > 90 && heightCm < 250)) problems.push("height");
    if (!(age >= 5 && age < 120)) problems.push("age");
    if (d.sex !== "male" && d.sex !== "female") problems.push("sex used for the calculation");
    if (!(weightKg > 25 && weightKg < 400)) problems.push("current weight");
    if (!d.activity) problems.push("activity level");
    if (d.alreadyStable == null) problems.push("the current-intake question");
    if (bf != null && !(bf > 2 && bf < 70)) problems.push("body fat % (2–70)");
    if (problems.length) {
      setErr(`Please fill in: ${problems.join(", ")}.`);
      return;
    }
    const newEntry = latestWeight != null && Math.abs(weightKg - latestWeight) < 0.05 ? null : { id: newId(), date: today, time: new Date().toISOString(), weight: weightKg, source: "bia" };
    onSave({
      settings: {
        units,
        heightCm,
        age,
        sex: d.sex,
        activity: d.activity,
        steps: parseNum(d.steps),
        bf: bf != null && isDateString(today) ? { value: bf, source: d.bfSource, date: s.bf?.value === bf ? s.bf.date : today } : null,
        alreadyStable: d.alreadyStable,
        checkinWeekday: Number(d.checkinWeekday),
        pregnant: !!d.pregnant,
        onboarded: true,
        legacyReview: false,
        profilePrompted: true,
      },
      newEntry,
    });
  };

  return (
    <Sheet title={s.onboarded ? "Your profile" : "Set up your profile"} onClose={onClose} wide>
      {legacy && (
        <div className="banner warn">
          BodyTracker's estimates were upgraded. Earlier versions filled in height 175 cm, age 25 and activity 1.45 automatically if you never changed them — please check these values.
        </div>
      )}
      <p className="hint" style={{ marginBottom: 14 }}>These feed the starting estimate. Your own weigh-ins and food log take over as data comes in.</p>

      <div className="tapegrid">
        <Field label="Weight unit"><Seg options={["kg", "lb"]} value={units.weight} onChange={switchWeight} /></Field>
        <Field label="Length unit"><Seg options={["cm", "in"]} value={units.length} onChange={switchLength} /></Field>
      </div>
      <div className="tapegrid">
        <Field label="Height" unit={units.length} required><NumInput value={d.height} onChange={set("height")} /></Field>
        <Field label="Age" unit="years" required><NumInput value={d.age} onChange={set("age")} step="1" /></Field>
      </div>
      <Field label="Current weight" unit={units.weight} required hint={units.weight === "lb" ? `1 lb = ${KG_PER_LB} kg` : null}>
        <NumInput value={d.weight} onChange={set("weight")} />
      </Field>
      <Field label="Sex used for the calculation (male/female formula)" required>
        <Seg options={[{ key: "male", label: "Male formula" }, { key: "female", label: "Female formula" }]} value={d.sex} onChange={set("sex")} />
      </Field>

      <div className="fld"><span>Activity level <em>*</em></span></div>
      <div className="actlist">
        {ACTIVITY_LEVELS.map((a) => (
          <button key={a.key} type="button" className={`activity${d.activity === a.key ? " on" : ""}`} onClick={() => set("activity")(a.key)}>
            <span className="fac">× {a.factor}</span>
            <b>{a.label}</b>
            <small>{a.example}</small>
          </button>
        ))}
      </div>
      <Field label="Average daily steps (optional)" hint={suggested ? `Suggests: ${ACTIVITY_LEVELS.find((a) => a.key === suggested).label}. Steps only suggest a level — your choice above is what's used.` : "Only used to suggest a level."}>
        <NumInput value={d.steps} onChange={set("steps")} step="100" />
      </Field>
      {suggested && suggested !== d.activity && (
        <button className="btnsm" style={{ marginBottom: 12 }} onClick={() => set("activity")(suggested)}>Use suggested level</button>
      )}

      <div className="tapegrid">
        <Field label="Body fat (optional)" unit="%"><NumInput value={d.bfValue} onChange={set("bfValue")} /></Field>
        <Field label="Measured by">
          <select value={d.bfSource} onChange={(e) => set("bfSource")(e.target.value)}>
            <option value="bia">BIA scale</option>
            <option value="dexa">DEXA</option>
            <option value="calipers">Calipers</option>
          </select>
        </Field>
      </div>

      <Field label="Have you already been eating at roughly your current intake for 2+ weeks?" required hint="If not, the first week's water and glycogen shifts are treated as a level change rather than as a change in your maintenance.">
        <Seg options={[{ key: true, label: "Yes" }, { key: false, label: "No / not sure" }]} value={d.alreadyStable} onChange={set("alreadyStable")} />
      </Field>

      <Field label="Weekly update day" hint="Your maintenance and targets refresh once a week on this day, so they don't jump around with daily water swings.">
        <select value={d.checkinWeekday} onChange={(e) => set("checkinWeekday")(e.target.value)}>
          {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
        </select>
      </Field>

      <label className="toggle">
        <span>Pregnant or breastfeeding</span>
        <input type="checkbox" checked={!!d.pregnant} onChange={(e) => set("pregnant")(e.target.checked)} />
      </label>

      {err && <div className="banner warn">{err}</div>}
      <button className="save" onClick={save}>Save profile</button>
      {latestWeight != null && <p className="hint" style={{ marginTop: 10 }}>Latest weigh-in: {fmt(weightToDisplay(latestWeight, s.units.weight))} {s.units.weight}. A new weigh-in is added only if you change the weight.</p>}
    </Sheet>
  );
}
