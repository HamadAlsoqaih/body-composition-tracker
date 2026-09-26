# Changelog

## 2.0.0

A rebuild of the estimation engine, with bug fixes and safety guardrails. Existing data is migrated automatically.

### 0 · Architecture
- All calculation logic moved out of `App.jsx` into pure, tested functions in `src/lib/` (`dates`, `units`, `storage`, `foodlog`, `trend`, `energy`, `kalman`, `targets`, `composition`, `guardrails`, plus the `analysis` orchestrator and `progress` display helpers).
- UI split into components under `src/components/`; state and persistence live in `src/useAppState.js`.
- Data is stored in kg, cm, kcal and g; kg/lb and cm/in are display/input options.
- Added Vitest (`npm test`): 156 tests, covering every `src/lib` export, plus seeded accuracy simulations.
- No new runtime dependencies; the 3×3 matrix math is hand-written.

### 1 · Dates
- **Fixed:** dates were built with `toISOString()` (UTC), so entries made just after midnight in UTC+ time zones were saved to the previous day. All calendar dates now use the local date.
- **Fixed:** the "last 7 days" filter included 8 days. All windows are now exact (`lastNDays`).
- Day counts compare at local noon, so they're correct across DST changes.

### 2 · Food log
- **Fixed:** saving food for a date deleted the existing entry for that date. Days now hold several entries (with optional labels) that sum to the day's total, and each entry can be edited or deleted.
- **Fixed:** unlogged days were effectively treated as 0 kcal in averages. There's now a per-day "day complete" flag (plus a "Mark yesterday complete?" prompt), and only complete days count as known intake.
- **Fixed:** average protein used `protein || 0`, which biased it low. Each macro is now averaged only over complete days where it was logged.
- The macro/calorie sanity check (> 15% gap) now runs per day, and only when all three macros are logged.

### 3 · Weight data cleaning and trend
- One value per day: the earliest weigh-in (weigh-ins now store a timestamp), or the mean for older entries without a time.
- Outlier detection (rolling 7-day median + MAD) plus a 4-σ innovation check inside the filter. Ignored weigh-ins are greyed out on the chart and can be un-ignored.
- Weight chart now shows an EMA trend line (α = 0.1/day, gap-aware).
- A 28-day regression cross-check with an autocorrelation-corrected standard error is shown in "Explain the math".

### 4 · Energy per kg and formula estimate
- **Fixed:** replaced the fixed 7,700 kcal/kg with Hall (2008)/Forbes energy per kg from fat mass (DEXA → BIA/calipers → Deurenberg estimate), recomputed weekly.
- BMR uses Katch-McArdle when body fat is measured, otherwise Mifflin-St Jeor. The sex field is now labelled "Sex used for the calculation (male/female formula)".
- Activity is chosen from a 5-level questionnaire with examples; optional daily steps only suggest a level.
- **Fixed:** removed the hidden defaults (height 175, age 25, activity 1.45). Onboarding collects the profile, units, optional BF% and its source, the "already eating at this intake for 2+ weeks?" question, and the weekly update day. Existing users are asked once to confirm their migrated values.
- The formula TDEE carries a ±12% (σ_f) uncertainty, labelled as an assumption.

### 5 · Maintenance estimate (Kalman filter)
- **Fixed:** maintenance was estimated from the first and last weigh-ins of the last ~16 days, which swings with water weight and ignores unlogged days. It's now a 3-state Kalman filter (tissue, water, TDEE) that runs every day, handles unlogged days, glycogen shifts, water-event tags and outliers, and reports `TDEE ± 95% range`, a data share, and a Measured/Estimated label.
- Per-user tuning of the water noise after 42 days / 30 weigh-ins, repeated monthly (likelihood-weighted over the grid by default — see README).
- An RTS smoother drives the maintenance history chart and the 14-day tissue-change rate with its 95% interval.
- Displayed maintenance and targets refresh once a week on the chosen day.

### 6 · Targets and recommendations
- Goal rate is set as % of body weight per week (lose 0.25–1.0%, gain 0.1–0.5%), with warnings outside those ranges; targets use energy per kg instead of 7,700.
- **Fixed:** recommendations reacted to the difference between two noisy weigh-ins. "On track" now means the target rate lies inside the 95% interval of the measured rate, and nothing is judged before 14 days of data.
- **Fixed:** the goal ETA divided by a noisy two-point trend. It now uses the target rate (percentage-based, so it slows as weight drops) and is shown as a range.
- Protein defaults to 1.8 g/kg when losing and 1.6 g/kg otherwise (adjustable 1.2–2.4), on a reference weight (lean-mass-based at high body fat, BMI-25 weight when BMI > 30).
- **Fixed:** the fat floor of 0.8 g/kg of total weight is replaced by max(20% of calories, 0.5 g/kg reference weight). Carbs fill the rest, with a low-carb note under 50 g.

### 7 · Safety guardrails
- Under 18: no calorie targets (tracking still works).
- Pregnant/breastfeeding toggle: maintenance only, with a note to follow medical advice.
- BMI < 18.5: loss goals disabled, and goal weights below BMI 18.5 are rejected with an explanation.
- Calorie floor of max(BMR, 1,200 female formula / 1,500 male formula), capped and explained.
- Warning after two consecutive weekly updates showing loss above 1.5% of body weight per week.
- Neutral wording throughout (enforced by a test); footer: "Estimates only, not medical advice."

### 8 · Body composition analysis
- Entries record their source (BIA scale, DEXA, calipers, tape).
- **Fixed:** the analysis and the muscle-loss insight compared the single first and last entries (noise-dominated, and could mix sources). They now compare the mean of the first 3 vs the last 3 readings from the same source, at least 21 days apart, in the selected range.
- Minimum detectable changes per method; smaller changes are reported as "no measurable change yet". Waist is the primary fat signal (2–3 readings averaged), and BIA muscle is always marked low confidence.
- Optional US Navy tape body-fat estimate, validated inputs, labelled as an estimate.
- **Fixed:** rings for a metric showed "—" when the most recent entry didn't include that metric (e.g. waist after a weigh-in). Each metric now uses its own latest value.

### 9 · Data safety
- `schemaVersion` 2 with migration from the original storage keys. Old food rows become one complete entry per day, and a raw copy of the old data is kept.
- Export a full JSON backup and CSVs (weights, food, measurements). Import validates the file, previews counts, and asks before replacing or merging.
- Persistent storage is requested on first load, a backup reminder appears every 30 days, and iOS users get a Home Screen tip.
- All storage access is wrapped. Corrupt data is preserved and offered for download, and an error screen allows a raw-data download.
- Entries can now be deleted from the body tab.

### 10 · Explain the math
- Rebuilt to show the exact values used: data range, weigh-ins used/ignored and why, completeness, energy per kg with FM/p/source, formula type and inputs with σ_f, glycogen handling, Kalman TDEE ± range with data share and water parameters, the regression cross-check and whether it agrees, the target calculation, and the protein/fat reference weight.

### 11 · Tests
- Seeded simulator and accuracy scenarios A–H, plus unit and edge tests for dates (two time zones and DST), the food log, formulas, the Kalman filter (covariance health over 365 days, unlogged days, tags, glycogen rules), targets, guardrails, composition, migration and import validation. Measured results are in the README.
