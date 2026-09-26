import React, { useState } from "react";
import { Sheet, Field, NumInput } from "./ui.jsx";
import { makeFoodEntry, entriesForDate, dailyTotals, isDayComplete, dayTags, WATER_TAGS, macroMismatch } from "../lib/foodlog.js";
import { fmt } from "../lib/units.js";

const blank = { label: "", kcal: "", protein: "", carbs: "", fat: "" };

/** One day's food: add / edit / delete entries, mark complete, water tags. */
export default function DaySheet({ date: initialDate, today, state, actions, onClose }) {
  const [date, setDate] = useState(initialDate || today);
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);
  const items = entriesForDate(state.food, date);
  const total = dailyTotals(items).get(date);
  const complete = isDayComplete(state.days, date);
  const tags = dayTags(state.days, date);
  const mm = total ? macroMismatch(total) : null;
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    const r = makeFoodEntry({ ...draft, date, id: editing ?? undefined });
    if (r.error) {
      setErr(r.error);
      return;
    }
    if (editing != null) actions.updateFood(editing, r.entry);
    else actions.addFood(r.entry);
    setDraft(blank);
    setEditing(null);
    setErr(null);
  };

  const edit = (f) => {
    setEditing(f.id);
    setDraft({ label: f.label ?? "", kcal: f.kcal, protein: f.protein ?? "", carbs: f.carbs ?? "", fat: f.fat ?? "" });
  };

  return (
    <Sheet title="Food log" onClose={onClose}>
      <Field label="Date">
        <input type="date" value={date} max={today} onChange={(e) => { setDate(e.target.value || today); setEditing(null); setDraft(blank); }} />
      </Field>

      {items.length > 0 ? (
        <>
          {items.map((f) => (
            <div key={f.id} className="entryrow">
              <div className="grow">
                <div><b>{fmt(f.kcal, 0)} kcal</b> {f.label && <span className="lbl">· {f.label}</span>}</div>
                <div className="lbl">
                  {[f.protein != null && `${fmt(f.protein, 0)}P`, f.carbs != null && `${fmt(f.carbs, 0)}C`, f.fat != null && `${fmt(f.fat, 0)}F`].filter(Boolean).join(" ") || "no macros"}
                </div>
              </div>
              <button className="btnsm" onClick={() => edit(f)}>Edit</button>
              <button className="btnsm danger" onClick={() => { if (confirm("Delete this entry?")) actions.deleteFood(f.id); }}>Delete</button>
            </div>
          ))}
          <div className="subtle" style={{ margin: "6px 2px 12px" }}>
            Day total: <b>{fmt(total.kcal, 0)} kcal</b>
            {total.protein != null && ` · ${fmt(total.protein, 0)} g protein`}
            {total.carbs != null && ` · ${fmt(total.carbs, 0)} g carbs`}
            {total.fat != null && ` · ${fmt(total.fat, 0)} g fat`}
            {mm?.flagged && <div className="flagtxt">Macros add up to ~{fmt(mm.macroKcal, 0)} kcal ({fmt(mm.gapPct * 100, 0)}% from the logged calories). One of the numbers may be off.</div>}
          </div>
        </>
      ) : (
        <p className="subtle" style={{ marginBottom: 12 }}>Nothing logged for this day yet. Unlogged days count as unknown, not as zero.</p>
      )}

      <label className="toggle">
        <span>
          Day complete
          <br />
          <small className="subtle">Everything eaten this day is logged. Only complete days count toward your intake.</small>
        </span>
        <input type="checkbox" checked={complete} disabled={!items.length} onChange={(e) => actions.setDayComplete(date, e.target.checked)} />
      </label>

      <div className="detlabel">{editing != null ? "Edit entry" : "Add entry"}</div>
      <Field label="Label (optional)"><input type="text" maxLength={60} value={draft.label} onChange={(e) => set("label")(e.target.value)} placeholder="e.g. Lunch" /></Field>
      <div className="tapegrid">
        <Field label="Calories" unit="kcal" required><NumInput value={draft.kcal} onChange={set("kcal")} /></Field>
        <Field label="Protein" unit="g"><NumInput value={draft.protein} onChange={set("protein")} /></Field>
        <Field label="Carbs" unit="g"><NumInput value={draft.carbs} onChange={set("carbs")} /></Field>
        <Field label="Fat" unit="g"><NumInput value={draft.fat} onChange={set("fat")} /></Field>
      </div>
      <p className="hint">Enter a meal or a whole-day total — entries on the same day add up. Log a genuine zero-calorie day as a 0 kcal entry.</p>
      {err && <div className="banner warn">{err}</div>}
      <div className="brow" style={{ display: "flex", gap: 8 }}>
        <button className="save" onClick={save}>{editing != null ? "Save changes" : "Add entry"}</button>
        {editing != null && <button className="save" style={{ background: "#26303f", color: "#fff" }} onClick={() => { setEditing(null); setDraft(blank); }}>Cancel</button>}
      </div>

      <div className="detlabel" style={{ marginTop: 18 }}>Water events (optional)</div>
      <p className="subtle">Tag days that can shift water weight. The estimate allows extra water movement on tagged days and the 2 days after.</p>
      <div className="chips">
        {WATER_TAGS.map((t) => (
          <button key={t.key} className={`chip${tags.includes(t.key) ? " on" : ""}`} onClick={() => actions.toggleTag(date, t.key)}>{t.label}</button>
        ))}
      </div>
    </Sheet>
  );
}
