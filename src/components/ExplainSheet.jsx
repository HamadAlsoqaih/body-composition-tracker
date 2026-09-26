import React from "react";
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Sheet } from "./ui.jsx";
import { fmt, fmtInt, fmtPlusMinus, weightToDisplay } from "../lib/units.js";
import { ACTIVITY_LEVELS } from "../lib/energy.js";
import { TUNE_PHI, TUNE_WATER_SD } from "../lib/kalman.js";

const SRC = { dexa: "DEXA (trend-smoothed)", bia: "BIA scale (mean of last 3)", calipers: "calipers (mean of last 3)", "bia/calipers": "BIA/calipers (mean of last 3)", deurenberg: "Deurenberg estimate from BMI (an estimate)", "fallback 7700": "no fat-mass estimate — fixed 7,700 kcal/kg fallback" };

function Block({ n, title, children }) {
  return (
    <div className="detblock">
      <div className="detlabel">{n} · {title}</div>
      <div className="detbody">{children}</div>
    </div>
  );
}

/** Every number here comes from the same computeModel() output the app shows. */
export default function ExplainSheet({ m, units, onClose }) {
  const W = (kg, d = 1) => (kg == null ? "—" : `${fmt(weightToDisplay(kg, units.weight), d)} ${units.weight}`);
  if (!m.kalman) {
    return (
      <Sheet title="How this was calculated" onClose={onClose}>
        <p className="detbody">{m.reason}</p>
      </Sheet>
    );
  }
  const k = m.kalman;
  const t = m.targets;
  const cl = m.cleaning;
  const ignored = cl.points.filter((p) => p.outlier);
  const mean = cl.points.filter((p) => p.method === "mean").length;
  const earliest = cl.points.filter((p) => p.method === "earliest").length;
  const act = ACTIVITY_LEVELS.find((a) => a.factor === m.prior.multiplier);
  const startGly = k.glycogen.find((g) => g.reason === "start");
  const shifts = k.glycogen.filter((g) => g.reason === "intake-shift");
  const reg = m.regression;

  return (
    <Sheet title="How this was calculated" onClose={onClose} wide>
      <Block n="1" title="Data range">
        Estimate runs from <b>{k.start}</b> (first usable weigh-in) to <b>{k.end}</b> — {k.days} day{k.days === 1 ? "" : "s"}. The displayed numbers are from the weekly update on <b>{m.snapshot.date}</b> (day {m.snapshot.index + 1}); the next update is <b>{m.snapshot.nextCheckin}</b>.
      </Block>

      <Block n="2" title="Weigh-ins">
        <b>{cl.used}</b> daily weight{cl.used === 1 ? "" : "s"} used, <b>{cl.ignored}</b> ignored by the rolling-median check
        {cl.kalmanIgnored.length > 0 && <>, and <b>{cl.kalmanIgnored.length}</b> more set aside by the filter ({cl.kalmanIgnored.join(", ")}) because they were more than 4 standard deviations from its prediction</>}.
        <br />A day's weight is ignored if it is more than <span className="mono">max(1.5 kg, 3.5 × 1.4826 × MAD) = {fmt(cl.threshold, 2)} kg</span> from the centred 7-day median (MAD = {cl.mad == null ? "—" : fmt(cl.mad, 3)} kg).
        {ignored.length > 0 && (
          <ul style={{ margin: "6px 0 0 18px" }}>
            {ignored.map((p) => <li key={p.date}>{p.date}: {W(p.weight)} was {fmt(p.dev, 2)} kg from the median — likely an entry error or unusual water swing.</li>)}
          </ul>
        )}
        {(mean > 0 || earliest > 0) && <><br />Days with several weigh-ins: {earliest} used the earliest reading, {mean} (older entries without a time) used the mean.</>}
      </Block>

      <Block n="3" title="Food logging">
        <b>{k.completeDays}</b> of {k.days} day{k.days === 1 ? " is" : "s are"} marked complete ({fmt((100 * k.completeDays) / k.days, 0)}%). Last 7 days: {m.week.completeDays}/7 complete.
        Unlogged or incomplete days are unknown, not zero: the filter assumes the average of your complete days in the previous 14 days with a wide ±300 kcal (or wider) allowance. Complete days get a ±10% (min 50 kcal) label-error allowance.
      </Block>

      <Block n="4" title="Energy per kg of weight change">
        Hall 2008 with the Forbes relation (recomputed weekly; current week from {m.energy.date}):
        <br /><span className="mono">FM = {m.energy.fatMass == null ? "—" : `${fmt(m.energy.fatMass, 1)} kg`} ({fmt(m.energy.bfPercent, 1)}% of {W(m.energy.weightKg)})</span>
        <br /><span className="mono">p = 10.4 ÷ (10.4 + FM) = {m.energy.p == null ? "—" : fmt(m.energy.p, 3)}</span>
        <br /><span className="mono">p × 1816 + (1 − p) × 9440 = {fmtInt(m.energy.energyPerKg)} kcal/kg</span>
        <br />Fat-mass source: {SRC[m.energy.source] || m.energy.source}.
      </Block>

      <Block n="5" title="Starting estimate (formula)">
        {m.prior.method === "katch" ? (
          <>Katch-McArdle (body fat known): <span className="mono">370 + 21.6 × {fmt(m.prior.leanMass, 1)} kg lean = {fmtInt(m.prior.bmr)} kcal BMR</span></>
        ) : (
          <>Mifflin-St Jeor ({m.prior.inputs.sex} formula): <span className="mono">10×{fmt(m.prior.inputs.weightKg, 1)} + 6.25×{fmt(m.prior.inputs.heightCm, 1)} − 5×{m.prior.inputs.age} {m.prior.inputs.sex === "male" ? "+ 5" : "− 161"} = {fmtInt(m.prior.bmr)} kcal BMR</span></>
        )}
        <br /><span className="mono">× {m.prior.multiplier} ({act?.label || "activity"}) = {fmtInt(m.prior.tdee)} ± {fmtInt(m.prior.sigma)} kcal/day</span>
        <br />The ± (σ_f = 12% of the formula value) is an assumption about how far formulas are typically off for an individual. Today's formula value would be {fmtInt(m.formulaNow?.tdee)} kcal/day.
      </Block>

      <Block n="6" title="Water / glycogen at the start">
        {startGly
          ? <>Applied: you answered that you had <b>not</b> been eating at this intake for 2+ weeks, so days 1–7 allow extra movement of ±0.5 kg/day in tissue level. Early water/glycogen shifts are absorbed as a level change instead of being read as a maintenance change.</>
          : <>Not applied: you answered that you had already been eating at roughly this intake for 2+ weeks.</>}
        {shifts.length > 0 && <><br />Intake shifts (7-day average changed by &gt; 400 kcal) also got the 7-day allowance: {shifts.map((s) => `${s.date} (${s.diff > 0 ? "+" : ""}${Math.round(s.diff)} kcal)`).join(", ")}.</>}
      </Block>

      <Block n="7" title="Maintenance (Kalman filter)">
        A day-by-day model of tissue mass, water and maintenance, updated with every weigh-in and food day.
        <br /><span className="mono">Maintenance = {fmtPlusMinus(k.tdee.tdee, k.tdee.half95)} kcal/day (95% range, SD {fmtInt(k.tdee.sd)})</span>
        <br />Data share: <b>{fmt(k.tdee.dataShare * 100, 0)}%</b> = 1 − (remaining variance ÷ formula variance) — how much of this estimate comes from your data rather than the formula. Label: <b>{k.tdee.label}</b> (Measured at ≥ 50%).
        <br />Water model: {k.tuning
          ? <>tuned on your first {k.tuning.anchor + 1} days (re-tuned every 30 days) by comparing {TUNE_PHI.length * TUNE_WATER_SD.length} settings by likelihood. Best fit: day-to-day carry-over φ = {k.tuning.phi}, water SD = {k.tuning.waterSD} kg. {k.tuningMode === "average" && <>The estimate averages all settings by their likelihood (weighted φ ≈ {fmt(k.params.phi, 2)}, SD ≈ {fmt(k.params.waterSD, 2)} kg), so uncertainty about water noise widens the range.</>}</>
          : <>defaults φ = {k.params.phi}, water SD = {k.params.waterSD} kg (tuning starts after 42 days with ≥ 30 weigh-ins).</>}
        {k.rate14 && <><br />Tissue change over the last {k.rate14.days} days (smoothed): <span className="mono">{W(k.rate14.rate * 7, 2)}/week (95%: {W(k.rate14.lo * 7, 2)} to {W(k.rate14.hi * 7, 2)})</span></>}
      </Block>

      <Block n="8" title="Cross-check (regression)">
        {!reg.ok ? <>Not available: {reg.reason}.</> : reg.tdee == null ? <>Slope {W(reg.slope * 7, 2)}/week; {reg.reason}.</> : (
          <>
            Straight-line fit of daily weight over {reg.start} → {reg.end} ({reg.n} weigh-ins): slope <span className="mono">{fmt(reg.slope * 1000, 1)} ± {fmt(reg.se * 1000, 1)} g/day</span>. The ± is widened for day-to-day correlation (ρ = {fmt(reg.rho, 2)}, {reg.rhoSource}).
            <br /><span className="mono">{fmtInt(reg.meanIntake)} kcal (mean of {reg.intakeDays} complete days) − ({fmt(reg.slope, 4)} × {fmtInt(reg.energyPerKg)}) = {fmtPlusMinus(reg.tdee, 1.96 * reg.tdeeSD)} kcal/day</span>
            <br />{m.agreement.agrees
              ? <span className="oktxt">Agrees with the filter (difference {fmtInt(Math.abs(m.agreement.diff))} ≤ {fmtInt(m.agreement.limit)} kcal).</span>
              : <span className="flagtxt">Differs from the filter by {fmtInt(Math.abs(m.agreement.diff))} kcal (limit {fmtInt(m.agreement.limit)}). Usually this means a recent change in intake, logging, or water; the filter's estimate is used.</span>}
          </>
        )}
      </Block>

      <Block n="9" title="Target">
        {!t ? m.guard.messages.map((g) => g.text).join(" ") : (
          <>
            Goal: <b>{t.dir}</b>{t.requestedDir !== t.dir && <> (you chose {t.requestedDir}; changed for safety)</>}{t.dir !== "maintain" && <> at <b>{t.ratePct}%</b> of body weight per week</>}.
            <br /><span className="mono">{t.ratePct}% × {W(m.trendWeight)} trend × {fmtInt(m.energy.energyPerKg)} kcal/kg ÷ 7 = {fmtInt(Math.abs(t.delta))} kcal/day</span>
            <br /><span className="mono">{fmtInt(k.tdee.tdee)} {t.delta < 0 ? "−" : "+"} {fmtInt(Math.abs(t.delta))} = {fmtInt(t.mathTarget)} kcal/day</span>
            <br />Minimum suggested: {fmtInt(t.floor.floor)} kcal/day (the larger of BMR {fmtInt(t.bmr?.bmr)} and {m.person.sex === "female" ? "1,200" : "1,500"}).{t.floor.capped ? " The target was raised to this minimum." : ""}
            {t.status && <><br />On track means your target rate ({W(t.rateKgDay * 7, 2)}/week) falls inside the 95% range of your measured rate. {t.status.onTrack ? "It does." : `It doesn't; closing the gap needs about ${fmtInt(Math.abs(t.status.adjustKcal))} kcal/day ${t.status.adjustKcal < 0 ? "less" : "more"}.`}</>}
          </>
        )}
      </Block>

      {t && (
        <Block n="10" title="Protein, fat and carbs">
          Reference weight <b>{W(t.ref.refWeight)}</b>: {t.ref.reason}.
          <br /><span className="mono">Protein = {t.proteinPerKg} g/kg × {W(t.ref.refWeight)} = {fmtInt(t.macros.protein)} g</span>
          <br /><span className="mono">Fat ≥ max(20% × {fmtInt(t.target)} ÷ 9, 0.5 × {W(t.ref.refWeight)}) = max({fmtInt(t.macros.fatFromKcal)}, {fmtInt(t.macros.fatFromWeight)}) = {fmtInt(t.macros.fat)} g</span>
          <br /><span className="mono">Carbs = ({fmtInt(t.target)} − {fmtInt(t.macros.protein)}×4 − {fmtInt(t.macros.fat)}×9) ÷ 4 = {fmtInt(t.macros.carbs)} g</span>
          {t.lowCarbNote && <><br />{t.lowCarbNote}</>}
        </Block>
      )}

      <div className="detblock">
        <div className="detlabel">Maintenance history (smoothed, 95% band)</div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer>
            <ComposedChart data={k.history} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#1c2230" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--dim)", fontSize: 11 }} tickFormatter={(d) => d.slice(5)} minTickGap={24} />
              <YAxis tick={{ fill: "var(--dim)", fontSize: 11 }} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "#141922", border: "1px solid #26303f", borderRadius: 12, color: "#fff" }} formatter={(v) => (Array.isArray(v) ? `${fmtInt(v[0])}–${fmtInt(v[1])}` : fmtInt(v))} />
              <Area dataKey={(d) => [d.lo, d.hi]} name="95% band" stroke="none" fill="#5aa9e6" fillOpacity={0.15} isAnimationActive={false} />
              <Line dataKey="smoothed" name="maintenance" stroke="#5aa9e6" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="detnote">
        Limits: accuracy depends on consistent logging and frequent weigh-ins. If you consistently under-log, the measured maintenance comes out lower by the same amount — the recommendations still work, because they're relative to your own logging. BIA body-fat and muscle readings are noisy. The app can't tell fat from muscle using calories alone.
      </div>
    </Sheet>
  );
}
