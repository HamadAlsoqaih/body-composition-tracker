import React, { useMemo, useState } from "react";
import { css } from "./styles.js";
import { useAppState, useToday } from "./useAppState.js";
import { computeModel, recommendation } from "./lib/analysis.js";
import { analyzeComposition } from "./lib/composition.js";
import { needsBackupReminder, isIOSBrowser } from "./lib/storage.js";
import { lastNDays } from "./lib/dates.js";
import { dailyTotals, isDayComplete, dayTags } from "./lib/foodlog.js";
import { metricSeries, deltaInfo, goalProgress } from "./lib/progress.js";
import { MSG } from "./lib/guardrails.js";
import { fmt, fmtInt, fmtPlusMinus, weightToDisplay, lengthToDisplay } from "./lib/units.js";
import { Ring, Insight } from "./components/ui.jsx";
import ProfileSheet from "./components/ProfileSheet.jsx";
import DaySheet from "./components/DaySheet.jsx";
import ExplainSheet from "./components/ExplainSheet.jsx";
import EntrySheet, { TAPE } from "./components/EntrySheet.jsx";
import GoalsSheet from "./components/GoalsSheet.jsx";
import NutritionSettingsSheet from "./components/NutritionSettingsSheet.jsx";
import ChartSheet from "./components/ChartSheet.jsx";
import BodyAnalysisSheet from "./components/BodyAnalysisSheet.jsx";
import DataSheet from "./components/DataSheet.jsx";

const COMPOSITION = [
  { key: "weight", label: "Weight", kind: "mass", goodDir: "down" },
  { key: "bodyFat", label: "Body Fat", kind: "pct", unit: "%", goodDir: "down" },
  { key: "fatMass", label: "Fat Mass", kind: "mass", goodDir: "down" },
  { key: "muscleMass", label: "Muscle Mass", kind: "mass", goodDir: "up" },
];
const TAPE_METRICS = TAPE.map((t) => ({ ...t, kind: "length", goodDir: "neutral" }));
const ALL = [...COMPOSITION, ...TAPE_METRICS];
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const GOAL_COLOR = "#3ddc84";
const OVERSHOOT_COLOR = "#22d3ee";
const NOGOAL_COLOR = "#5aa9e6";

function colorFor(m, d) {
  if (d == null || d === 0) return "#5b6472";
  if (m.goodDir === "neutral") return "#5aa9e6";
  return (m.goodDir === "down" ? d < 0 : d > 0) ? "#3ddc84" : "#ff5c72";
}

export default function App() {
  const { state, actions, saveError, corrupt, persist } = useAppState();
  const today = useToday();
  const { settings, entries, goals } = state;
  const units = settings.units;

  const [tab, setTab] = useState("body");
  const [baseMode, setBaseMode] = useState("first");
  const [sheet, setSheet] = useState(() => (!settings.profilePrompted ? { type: "welcome" } : null));
  const open = (type, extra = {}) => setSheet({ type, ...extra });
  const close = () => setSheet(null);

  const model = useMemo(() => computeModel(state, today), [state, today]);
  const cleanWeights = useMemo(() => model.cleaning.points.filter((p) => !p.outlier), [model]);
  const composition = useMemo(() => analyzeComposition(entries, { to: today, weightSeries: cleanWeights }), [entries, cleanWeights, today]);
  const rec = recommendation(model, (kg) => `${kg >= 0 ? "+" : "−"}${fmt(Math.abs(weightToDisplay(kg, units.weight)), 2)} ${units.weight}`);

  const iosHint = typeof navigator !== "undefined" && isIOSBrowser(navigator.userAgent, navigator.standalone || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches), navigator.maxTouchPoints);
  const backupDue = needsBackupReminder(state, today);
  const profileIncomplete = model.missing.length > 0;

  const W = (kg, d = 1) => (kg == null ? "—" : fmt(weightToDisplay(kg, units.weight), d));
  const display = (m, v) => (v == null ? null : m.kind === "mass" ? weightToDisplay(v, units.weight) : m.kind === "length" ? lengthToDisplay(v, units.length) : v);
  const unitOf = (m) => (m.kind === "mass" ? units.weight : m.kind === "length" ? units.length : "%");

  const seriesFor = (key) => metricSeries(entries, key, cleanWeights);

  const ringFor = (m, info) => {
    if ((m.key === "weight" || m.key === "bodyFat") && goals[m.key] == null) return { pct: 1, color: NOGOAL_COLOR };
    if (m.key === "weight" || m.key === "bodyFat") {
      const s = seriesFor(m.key);
      const p = s.length ? goalProgress(s[0].value, s[s.length - 1].value, goals[m.key]) : 0;
      return p >= 1 ? { pct: 1, color: OVERSHOOT_COLOR, p } : { pct: Math.max(0, p), color: GOAL_COLOR, p };
    }
    return { pct: info.pct ?? 0, color: colorFor(m, info.delta) };
  };

  const saveProfile = ({ settings: s, newEntry }) => {
    actions.updateSettings(s);
    if (newEntry) actions.addEntry(newEntry);
    close();
  };

  const closeWelcomeOrProfile = () => {
    if (!settings.profilePrompted) actions.updateSettings({ profilePrompted: true });
    close();
  };

  const k = model.kalman;
  const t = model.targets;

  // last 14 days for the food list
  const totals = useMemo(() => dailyTotals(state.food), [state.food]);
  const recentDays = lastNDays(14, today).reverse();

  return (
    <div className="app">
      <style>{css}</style>

      {sheet?.type === "welcome" && (
        <div className="welcome" onClick={closeWelcomeOrProfile}>
          <div className="welcomecard" onClick={(e) => e.stopPropagation()}>
            <div className="wlogo">◐</div>
            <h2 className="wtitle">Welcome to BodyTracker</h2>
            <p className="wlead">A private tracker for weight, body composition and nutrition. Everything stays on your device — no account, no cloud.</p>
            <div className="wfeatures">
              <div className="wfeat"><b>Track your body</b><span>Weight, body fat, fat and muscle mass, and ten tape measurements.</span></div>
              <div className="wfeat"><b>Learn your maintenance</b><span>Your weigh-ins and food log are combined to estimate your maintenance calories, always with a ± range.</span></div>
              <div className="wfeat"><b>Honest about noise</b><span>Water, food labels and scales all add noise. The app shows how sure it is and never claims exact numbers.</span></div>
            </div>
            <p className="wnote">{MSG.disclaimer} Calorie targets are for adults.</p>
            <button className="wbtn" onClick={() => { actions.updateSettings({ profilePrompted: true }); open("profile"); }}>Set up my profile</button>
          </div>
        </div>
      )}

      <header className="top">
        <div>
          <div className="eyebrow">{tab === "body" ? "Body Composition" : "Nutrition"}</div>
          <h1>{tab === "body" ? "Progress" : "Intake"}</h1>
        </div>
        <div className="headright">
          {tab === "body" && (
            <div className="basetoggle">
              <button className={baseMode === "first" ? "on" : ""} onClick={() => setBaseMode("first")}>vs First</button>
              <button className={baseMode === "last" ? "on" : ""} onClick={() => setBaseMode("last")}>vs Last</button>
            </div>
          )}
          <button className="gear" onClick={() => open("data")} aria-label="Your data">⇩</button>
          <button className="gear" onClick={() => open(tab === "body" ? "goals" : "nsettings")} aria-label="Settings">⚙</button>
        </div>
      </header>

      {saveError && <div className="banner warn">{saveError}</div>}
      {corrupt.length > 0 && (
        <div className="banner warn">
          Some saved data couldn't be read. The app is working with what it could load; a copy was kept.
          <div className="brow"><button className="btnsm" onClick={() => open("data")}>Recovery options</button></div>
        </div>
      )}
      {backupDue && (
        <div className="banner">
          It's been 30+ days since your last backup. Your data lives only on this device.
          <div className="brow">
            <button className="btnsm primary" onClick={() => open("data")}>Back up now</button>
            <button className="btnsm" onClick={() => actions.dismissBackupReminder(today)}>Later</button>
          </div>
        </div>
      )}
      {iosHint && !state.meta.iosHintDismissed && (
        <div className="banner warn">
          On iPhone/iPad, Safari can clear data for sites you haven't opened in 7 days. Add BodyTracker to your Home Screen (Share → Add to Home Screen) to keep your data safe.
          <div className="brow"><button className="btnsm" onClick={() => actions.replaceState({ ...state, meta: { ...state.meta, iosHintDismissed: true } })}>Got it</button></div>
        </div>
      )}

      {tab === "body" && (entries.length === 0 ? (
        <div className="empty">No entries yet. Add your first weigh-in to start tracking.</div>
      ) : (
        <>
          <button className="analysiscard" data-tone={composition.tone} onClick={() => open("analysis")}>
            <div className="anrow">
              <div className="anlabel">Body composition</div>
              {composition.status !== "insufficient" && <div className={`anconf ${composition.confidence}`}>{composition.confidence} confidence</div>}
            </div>
            <div className="anhead">{composition.headline}</div>
            <div className="anhint">Tap for the full breakdown →</div>
          </button>

          <section className="grid">
            {COMPOSITION.map((m) => {
              const info = deltaInfo(seriesFor(m.key), baseMode);
              const ring = ringFor(m, info);
              const goalSet = (m.key === "weight" || m.key === "bodyFat") && goals[m.key] != null;
              const u = unitOf(m);
              const d = info.delta == null ? null : display(m, info.delta);
              return (
                <button key={m.key} className="card" onClick={() => open("chart", { metric: m })}>
                  <Ring pct={ring.pct} color={ring.color}>
                    <div className="ringinner">
                      <div className="val">{info.latest ? fmt(display(m, info.latest.value)) : "—"}</div>
                      <div className="u">{u}</div>
                    </div>
                  </Ring>
                  <div className="clabel">{m.label}</div>
                  {goalSet ? (
                    <div className="cdelta" style={{ color: ring.color }}>
                      {ring.p >= 1 ? "✓ goal " : `${Math.round(Math.max(0, ring.p || 0) * 100)}% → `}{fmt(display(m, goals[m.key]))}{u === "%" ? "%" : " " + u}
                    </div>
                  ) : (
                    <div className="cdelta" style={{ color: colorFor(m, info.delta) }}>
                      {d == null ? "—" : `${d > 0 ? "▲" : d < 0 ? "▼" : "•"} ${fmt(Math.abs(d))}${u === "%" ? "%" : " " + u}`}
                    </div>
                  )}
                </button>
              );
            })}
          </section>
          {model.trendWeight != null && (
            <p className="subtle" style={{ margin: "2px 4px 0" }}>
              Trend weight {W(model.trendWeight)} {units.weight}
              {model.cleaning.ignored > 0 && ` · ${model.cleaning.ignored} weigh-in${model.cleaning.ignored === 1 ? "" : "s"} ignored (tap Weight to review)`}
            </p>
          )}

          <div className="sectlabel">Tape measurements</div>
          <section className="grid tape">
            {TAPE_METRICS.map((m) => {
              const info = deltaInfo(seriesFor(m.key), baseMode);
              const col = colorFor(m, info.delta);
              const d = info.delta == null ? null : display(m, info.delta);
              return (
                <button key={m.key} className="card sm" onClick={() => open("chart", { metric: m })}>
                  <Ring pct={info.pct ?? 0} color={col} size={92} stroke={7}>
                    <div className="ringinner">
                      <div className="val sm">{info.latest ? fmt(display(m, info.latest.value)) : "—"}</div>
                      <div className="u">{units.length}</div>
                    </div>
                  </Ring>
                  <div className="clabel sm">{m.label}</div>
                  <div className="cdelta sm" style={{ color: col }}>{d == null ? "—" : `${d > 0 ? "▲" : d < 0 ? "▼" : "•"} ${fmt(Math.abs(d))}`}</div>
                </button>
              );
            })}
          </section>

          <div className="sectlabel">Recent entries</div>
          <div className="foodlist">
            {[...entries].sort((a, b) => b.date.localeCompare(a.date) || String(b.time || "").localeCompare(String(a.time || ""))).slice(0, 8).map((e) => (
              <div key={e.id} className="entryrow">
                <div className="grow">
                  <b>{e.date}</b> <span className="lbl">· {e.source === "tape" ? "tape" : e.source ? e.source.toUpperCase() : "weight"}</span>
                  <div className="lbl">
                    {e.weight != null && `${W(e.weight)} ${units.weight} `}
                    {e.bodyFat != null && `${fmt(e.bodyFat)}% `}
                    {e.source === "tape" && TAPE.filter((t) => e[t.key] != null).map((t) => `${t.label} ${fmt(lengthToDisplay(e[t.key], units.length))}`).join(", ")}
                  </div>
                </div>
                <button className="btnsm danger" onClick={() => { if (confirm("Delete this entry?")) actions.deleteEntry(e.id); }}>Delete</button>
              </div>
            ))}
          </div>
        </>
      ))}

      {tab === "nutrition" && (
        <>
          {model.yesterday && (
            <div className="banner">
              Mark yesterday ({model.yesterday}) complete? Only complete days count toward your intake.
              <div className="brow">
                <button className="btnsm primary" onClick={() => actions.setDayComplete(model.yesterday, true)}>Yes, it's complete</button>
                <button className="btnsm" onClick={() => actions.dismissDayPrompt(model.yesterday)}>Not complete</button>
                <button className="btnsm" onClick={() => open("day", { date: model.yesterday })}>Review</button>
              </div>
            </div>
          )}
          {profileIncomplete && (
            <div className="banner warn">
              Profile needed for calorie estimates: {model.missing.join(", ")}.
              <div className="brow"><button className="btnsm primary" onClick={() => open("profile")}>Complete profile</button></div>
            </div>
          )}

          <div className="reccard" data-tone={rec.tone}>
            <div className="reclabel">Recommendation</div>
            <div className="rectext">{rec.text}</div>
            {k && <div className="subtle" style={{ marginTop: 8 }}>Updated weekly on {WD[model.snapshot.weekday]} · last update {model.snapshot.date} · next {model.snapshot.nextCheckin}</div>}
            <button className="explainbtn" onClick={() => open("explain")}>Explain the math →</button>
          </div>

          {model.insights?.length > 0 && (
            <div className="insights">
              {model.insights.map((ins, i) => <Insight key={i} tone={ins.tone}>{ins.text}</Insight>)}
            </div>
          )}
          {composition.status === "cut-muscle-loss" && <Insight tone="warn">{composition.headline}. {composition.change}</Insight>}

          <section className="statgrid">
            <div className="stat">
              <div className="statnum" style={{ fontSize: 22 }}>{k ? fmtPlusMinus(k.tdee.tdee, k.tdee.half95) : "—"}</div>
              <div className="statlab">
                maintenance kcal/day
                {k && <span className={`pill ${k.tdee.label.toLowerCase()}`}>{k.tdee.label}</span>}
                <br /><small>{k ? `${fmt(k.tdee.dataShare * 100, 0)}% from your data · 95% range` : "needs profile + weigh-in"}</small>
              </div>
            </div>
            <div className="stat">
              <div className="statnum">{t ? fmtInt(Math.round(t.target / 10) * 10) : "—"}</div>
              <div className="statlab">target kcal/day<br /><small>{t ? `${t.dir}${t.dir !== "maintain" ? ` · ${t.ratePct}%/wk` : ""}${t.floor.capped ? " · at minimum" : ""}` : model.guard?.allowTargets === false ? "adults only" : "—"}</small></div>
            </div>
            <div className="stat">
              <div className="statnum">{model.week.avgKcal != null ? fmtInt(model.week.avgKcal) : "—"}</div>
              <div className="statlab">avg intake kcal/day<br /><small>{model.week.completeDays} of last 7 days complete</small></div>
            </div>
            <div className="stat">
              <div className="statnum" style={{ fontSize: 20 }}>{k?.rate14 ? `${k.rate14.rate > 0 ? "+" : ""}${W(k.rate14.rate * 7, 2)}` : "—"}</div>
              <div className="statlab">{units.weight}/week (14-day)<br /><small>{k?.rate14 ? `95%: ${W(k.rate14.lo * 7, 2)} to ${W(k.rate14.hi * 7, 2)}` : "needs data"}</small></div>
            </div>
          </section>

          {t && (
            <>
              <div className="protcard ok">
                <div className="protrow">
                  <span>Protein</span>
                  <strong>{model.week.avgProtein != null ? fmtInt(model.week.avgProtein) : "—"}g <small>/ {fmtInt(t.macros.protein)}g</small></strong>
                </div>
                <div className="protnote">{t.proteinPerKg} g/kg × {W(t.ref.refWeight)} {units.weight} reference weight{model.week.proteinDays ? ` · average of ${model.week.proteinDays} complete day(s) with protein logged` : ""}</div>
              </div>
              <div className="macrogrid">
                <div className="macro">
                  <div className="macronum">{model.week.avgCarbs != null ? fmtInt(model.week.avgCarbs) : "—"}<span>g</span></div>
                  <div className="macrolab">carbs <small>/ ~{fmtInt(t.macros.carbs)}g</small></div>
                </div>
                <div className="macro">
                  <div className="macronum">{model.week.avgFat != null ? fmtInt(model.week.avgFat) : "—"}<span>g</span></div>
                  <div className="macrolab">fat <small>/ ≥{fmtInt(t.macros.fat)}g</small></div>
                </div>
              </div>
            </>
          )}
          {k && k.tdee.label === "Estimated" && (
            <div className="notecard">Maintenance is still mostly the formula estimate ({fmt(k.tdee.dataShare * 100, 0)}% from your data). It becomes "Measured" once your weigh-ins and complete food days carry at least half the weight — typically 3–5 weeks of regular logging.</div>
          )}

          <div className="sectlabel">Last 14 days</div>
          <div className="foodlist">
            {recentDays.map((d) => {
              const tot = totals.get(d);
              const done = isDayComplete(state.days, d);
              const tags = dayTags(state.days, d);
              return (
                <button key={d} className="dayrow" onClick={() => open("day", { date: d })}>
                  <span className="fdate">{d === today ? "Today" : d.slice(5)}</span>
                  <span className="subtle" style={{ flex: 1 }}>{tot ? `${tot.n} entr${tot.n === 1 ? "y" : "ies"}` : "not logged"}{tags.length ? ` · ${tags.length} tag${tags.length > 1 ? "s" : ""}` : ""}</span>
                  <span className="fcal">{tot ? `${fmtInt(tot.kcal)} kcal` : ""}</span>
                  {tot && <span className={`dstat ${done ? "done" : "open"}`}>{done ? "complete" : "open"}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="footer">
        {MSG.disclaimer}
        <br />
        <button onClick={() => open("profile")}>Profile</button>·<button onClick={() => open("data")}>Backup &amp; import</button>
      </div>

      {sheet?.type === "profile" && <ProfileSheet state={state} today={today} latestWeight={model.latestWeight} legacy={settings.legacyReview} onSave={saveProfile} onClose={closeWelcomeOrProfile} />}
      {sheet?.type === "day" && <DaySheet date={sheet.date} today={today} state={state} actions={actions} onClose={close} />}
      {sheet?.type === "explain" && <ExplainSheet m={model} units={units} onClose={close} />}
      {sheet?.type === "comp" && <EntrySheet type="comp" today={today} units={units} onSave={(e) => { actions.addEntry(e); close(); }} onClose={close} />}
      {sheet?.type === "tape" && <EntrySheet type="tape" today={today} units={units} onSave={(e) => { actions.addEntry(e); close(); }} onClose={close} />}
      {sheet?.type === "goals" && <GoalsSheet goals={goals} units={units} heightCm={settings.heightCm} onSave={(g) => { actions.setGoals(g); close(); }} onClose={close} />}
      {sheet?.type === "nsettings" && <NutritionSettingsSheet settings={settings} trendWeight={model.trendWeight} onSave={(s) => { actions.updateSettings(s); close(); }} onClose={close} onOpenProfile={() => open("profile")} />}
      {sheet?.type === "chart" && <ChartSheet metric={sheet.metric} entries={entries} model={model} units={units} today={today} includeDates={settings.includeDates} onToggleInclude={actions.toggleInclude} onClose={close} />}
      {sheet?.type === "analysis" && <BodyAnalysisSheet entries={entries} cleanWeights={cleanWeights} navy={model.navy} units={units} today={today} onClose={close} />}
      {sheet?.type === "data" && (
        <DataSheet state={state} today={today} corrupt={corrupt} persist={persist} iosHint={iosHint} onReplace={actions.replaceState} onMarkBackup={actions.markBackup} onClearCorrupt={actions.clearCorrupt} onClose={close} />
      )}

      <nav className="bottombar">
        {tab === "body" ? (
          <div className="actions">
            <button className="primary" onClick={() => open("comp")}>+ Weight</button>
            <button onClick={() => open("tape")}>+ Tape</button>
          </div>
        ) : (
          <div className="actions">
            <button className="primary" onClick={() => open("day", { date: today })}>+ Food</button>
          </div>
        )}
        <div className="tabswitch">
          <button className={tab === "body" ? "on" : ""} onClick={() => setTab("body")}>Body</button>
          <button className={tab === "nutrition" ? "on" : ""} onClick={() => setTab("nutrition")}>Nutrition</button>
        </div>
      </nav>
    </div>
  );
}
