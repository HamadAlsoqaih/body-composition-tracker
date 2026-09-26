# BodyTracker

A private, mobile-first web app for tracking weight, body composition and nutrition. All data is stored locally on your device (`localStorage`) — no account, no server, nothing leaves your phone.

**Estimates only, not medical advice.** Calorie targets are for adults.

## Features

- **Body composition** — weight, body fat %, fat mass, muscle (or DEXA lean) mass, and ten tape measurements. Composition entries record their source (BIA scale, DEXA or calipers) and tape entries are marked as tape; weight-only entries have no source. Waist accepts 2–3 readings per entry, which are averaged.
- **Progress rings and trend charts** — change vs your first or last value, goal rings for weight and body fat, charts with 1M / 3M / 6M / 1Y / All. The weight chart shows the smoothed trend and greys out ignored weigh-ins (which you can un-ignore).
- **Maintenance calories (TDEE) with an honest range** — e.g. `2,950 ± 180 kcal/day`, labelled *Measured* or *Estimated* depending on how much comes from your own data.
- **Targets** — calories, protein, fat and carbs for a lose / maintain / gain goal set as % of body weight per week, with an "on track" check and a goal ETA range.
- **Food log** — several entries per day, edit/delete, a per-day "complete" flag, and optional water-event tags (high salt, refeed, creatine start, hard training, menstrual cycle, illness, travel).
- **Explain the math** — every number the app shows, with the exact inputs used.
- **Backup** — full JSON backup, CSV export (weights, food, measurements), validated JSON import with a preview and replace/merge.

## Run locally

```bash
npm install
npm run dev      # development server
npm test         # unit + accuracy tests (Vitest)
npm run build    # production build into dist/
```

`npm test` runs the whole suite with `TZ=Asia/Riyadh`, then re-runs the date tests with `TZ=America/New_York`. The time zone is set with `cross-env`, so the script works in PowerShell/CMD as well as Unix shells. The GitHub Pages workflow runs `npm test` before every build, so a failing test blocks the deploy.

## Deploy to GitHub Pages

The included workflow (`.github/workflows/deploy.yml`) builds and deploys on every push to `main`. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. `vite.config.js` uses `base: "./"`, so it works under any repo name.

Manual alternative: `npm run deploy` (publishes `dist/` to a `gh-pages` branch).

## Code layout

All calculations are pure functions in `src/lib/`; components only render and call them.

| File | Contents |
|---|---|
| `dates.js` | Local calendar dates (never UTC), exact windows, DST-safe day counts |
| `units.js` | kg/lb and cm/in conversion, formatting. Data is stored in kg, cm, kcal, g |
| `foodlog.js` | Multi-entry food log, complete days, macro averages, macro sanity check, water tags |
| `trend.js` | Daily weight series, outlier flagging, EMA trend line, regression cross-check |
| `energy.js` | Hall/Forbes energy per kg, BMR formulas, activity levels, body-fat source priority |
| `kalman.js` | The TDEE Kalman filter, RTS smoother, water-noise tuning |
| `targets.js` | Calorie target, protein/fat/carbs, on-track check, goal ETA |
| `guardrails.js` | Safety rules |
| `composition.js` | First-3 vs last-3 composition analysis, US Navy estimate |
| `storage.js` | Safe storage, schema migration, backup/import/CSV |
| `analysis.js` | Orchestrator: builds the one model object the UI and "Explain the math" both read |
| `progress.js` | Ring/delta display helpers |

## Methods

### Weight data
- **One value per day.** With several weigh-ins on a date, the earliest (by timestamp) is used; older entries without a time are averaged.
- **Outliers.** A day is ignored if it deviates from the centred 7-day rolling median by more than `max(1.5 kg, 3.5 × 1.4826 × MAD)`, where MAD is the median absolute deviation of all those deviations. The Kalman filter additionally ignores any weigh-in more than 4 standard deviations from its own prediction.
- **Display trend.** Exponential moving average, α = 0.1 per day; across a gap of d days α = 1 − 0.9^d.

### Energy per kg of weight change (replaces the fixed 7,700 kcal/kg)
Hall (2008) with the Forbes relation:

```
p = 10.4 / (10.4 + FM)                    fraction of a weight change that is lean tissue (FM = fat mass, kg)
energyPerKg = p × 1816 + (1 − p) × 9440   kcal per kg
```

Fat mass = trend weight × BF%. BF% comes from (in order): DEXA readings (trend-smoothed); the mean of the last 3 BIA/caliper readings; otherwise the Deurenberg estimate `BF% = 1.20 × BMI + 0.23 × age − 10.8 × S − 5.4` (S = 1 for the male formula, 0 for the female formula), flagged as an estimate. Readings older than 180 days are not used. The value is recomputed weekly. 7,700 kcal/kg is used only if no fat-mass estimate is possible.

### Starting (formula) estimate
- BMR: **Katch-McArdle** `370 + 21.6 × lean mass` when a measured BF% is available; otherwise **Mifflin-St Jeor** `10W + 6.25H − 5A + 5` (male formula) / `− 161` (female formula).
- TDEE = BMR × activity multiplier (1.2 / 1.375 / 1.55 / 1.725 / 1.9). Average daily steps only *suggest* a level.
- Uncertainty σ_f = 12% of the formula TDEE. This is an assumption, not a measured value.
- Nothing is filled in silently: without height, age, sex-for-formula and activity there is no calorie estimate.

### Maintenance: Kalman filter
State `[M, W, T]`: tissue mass, water deviation, TDEE. Each day:

```
M_t = M_{t−1} + (I − T_{t−1}) / ρ      (+ intake noise σ_I/ρ)
W_t = φ W_{t−1} + η_W,  η_W ~ N(0, σ_W²),  σ_W = waterSD·√(1 − φ²)
T_t = T_{t−1} + η_T,    η_T ~ N(0, 15²)
weigh-in y = M + W + v,  v ~ N(0, 0.2²)
```

- **Intake.** Complete day: logged kcal with σ_I = max(50, 10%). Unlogged or incomplete day: the mean of complete days in the last 14 days with σ_I = max(300, their SD). If there are no complete days in that window, intake is assumed to track TDEE and the tissue–TDEE link is removed for that day, so weight change can't be misread as a TDEE change.
- **Glycogen/water shifts.** Extra tissue-level noise (0.5 kg/day SD) for 7 days after day 1, unless you said you've already been eating at your current intake for 2+ weeks, and after any later intake shift (7-day mean changes by more than 400 kcal).
- **Water-event tags** double σ_W on the tagged day and the 2 days after.
- **Initialization.** M = first usable weight (variance 0.6²), W = 0 with variance equal to the water SD² in use (the tuned value when tuning applies, 0.6² by default), T = formula TDEE (variance σ_f²).
- **Numerics.** Joseph-form covariance update, forced symmetry, non-negative variances. A Rauch–Tung–Striebel smoother is used for the history chart and the 14-day tissue-change rate.
- **Per-user tuning.** After ≥ 42 days with ≥ 30 weigh-ins (then every 30 days), 20 combinations of φ ∈ {0.3, 0.5, 0.7, 0.85} and water SD ∈ {0.3, 0.45, 0.6, 0.8, 1.0} kg are scored by innovation log-likelihood. By default the final estimate **averages all 20 by their likelihood weights** instead of using only the best one, so uncertainty about the water noise shows up in the ± range (see *Deviations* below).
- **Outputs.** TDEE ± 1.96 SD (rounded to 10); data share = 1 − posterior variance / σ_f² ("Measured" at ≥ 50%); 14-day tissue change rate with a 95% interval. Displayed numbers refresh once a week on your chosen day; the filter reruns on every change.
- **Cross-check.** An OLS fit of the last 28 days of weight, with its standard error widened by `√((1+ρ)/(1−ρ))` for lag-1 autocorrelation (ρ clamped to [0, 0.9], 0.5 if there are fewer than 10 consecutive-day pairs). "Explain the math" flags when it and the filter differ by more than `1.96·√(σ_k² + σ_r²)`.

### Targets
- Target kcal = TDEE ∓ rate × trend weight × energyPerKg ÷ 7, with the rate as % of body weight per week (lose 0.25–1.0%, default 0.5%; gain 0.1–0.5%, default 0.25%). You get a warning outside those ranges.
- **On track** when the target rate lies inside the 95% interval of the measured 14-day rate; otherwise the app suggests the kcal/day change. No status is shown before 14 days of data.
- **Goal ETA**: `ln(goal/now) / ln(1 ∓ r)` weeks, because a %-based rate means kg/week shrinks as weight drops. The range assumes the achieved rate is within ±25% of the target (an assumption).
- **Protein**: 1.8 g/kg when losing, 1.6 g/kg otherwise (adjustable 1.2–2.4) × reference weight. The reference weight is lean mass ÷ 0.85 (male formula) or ÷ 0.75 (female formula) when measured BF% is above 25% / 32%; otherwise the weight at BMI 25 when BMI > 30; otherwise trend weight.
- **Fat** ≥ max(20% of target kcal ÷ 9, 0.5 g/kg reference weight). **Carbs** = the remaining calories ÷ 4, with a note if that's under 50 g.

### Safety guardrails
- Under 18: no calorie targets (tracking still works).
- Pregnant or breastfeeding: maintenance only.
- BMI < 18.5: loss goals are disabled, and goal weights below BMI 18.5 are rejected.
- Never recommends below max(BMR, 1,200 kcal female formula / 1,500 kcal male formula).
- Warns when estimated loss exceeds 1.5% of body weight per week at two consecutive weekly updates.

### Body composition
- Compares the mean of the first 3 with the mean of the last 3 readings in the selected range, **same source only**, with the two groups' mean dates at least 21 days apart; otherwise it reports "Not enough data yet".
- Minimum detectable change: BIA fat mass 1.5 kg, muscle 1.5 kg, BF 2 points; DEXA fat 1.0 kg, lean 1.0 kg; calipers BF 2 points; waist 1.0 cm. Anything smaller is reported as "no measurable change yet".
- Waist is the primary fat signal. BIA muscle changes are always marked low confidence (BIA muscle includes water).
- Optional US Navy tape estimate (cm), shown as an estimate only:
  male `495 / (1.0324 − 0.19077·log10(waist − neck) + 0.15456·log10(height)) − 450`,
  female `495 / (1.29579 − 0.35004·log10(waist + hip − neck) + 0.22100·log10(height)) − 450`.

### Data safety
- Schema version 3, with automatic migration of the original data (`bt_entries`, `bt_food`, `bt_settings`, `bt_goals`). Old one-per-day food rows become one entry on that day, marked complete, and a raw copy of the old data is kept in `bt_v1_backup`. Version 3 removes the "bia" source that version 2 put on weight-only entries (the pre-migration copy is kept in `bt_v2_backup`). Old settings may contain the former hidden defaults (height 175, age 25, activity 1.45), so migrated users are asked once to confirm their profile.
- Every storage read and write is wrapped. Unreadable data is kept aside (`bt_corrupt_*`) and offered for download from the data screen, and an error screen lets you download raw data if rendering ever fails.
- `navigator.storage.persist()` is requested on first load. A backup reminder appears every 30 days. iOS users are told to add the app to the Home Screen, because Safari can delete site data after 7 days without use.

## Accuracy tests

`tests/accuracy.test.js` simulates people day by day (seeded, deterministic). True tissue change is (intake − TDEE) / true energyPerKg, water is AR(1), and weigh-ins = tissue + water + N(0, 0.2²). Each run's formula prior is drawn as true TDEE × (1 + 0.12·z), matching the assumed σ_f. The tests call the raw estimator, not the weekly display. Measured results (1,000 runs unless noted):

| Scenario | Requirement | Likelihood-averaged tuning (default) | Best-fit-only tuning |
|---|---|---|---|
| A: TDEE 2,800, intake 2,300 ± 150, 42 days | ≥ 95% within ±275 | 0.973 | 0.966 |
| B: water SD 0.8, φ 0.7 | 95% interval covers truth ≥ 90% | **0.938** | 0.893 (fails) |
| C: 20% unlogged + 2 typos | typos flagged; ≥ 95% within ±350 | flagged 100%; 0.991 | 100%; 0.988 |
| D: 1.5 kg glycogen drop, answer "no" | ≥ 95% within ±275 | 0.969 | 0.965 |
| D2: already dieting, answer "yes" | ≥ 95% within ±275; day-21 share ≥ D | 0.986; 0 exceptions | 0.979; 0 exceptions |
| E: data share (median run, 500 runs) | < 0.3 at day 7; ≥ 0.7 at day 42 | 0.019; 0.806 | 0.019; 0.840 |
| F: lean user, 90 days (200 runs) | error < 100 with Hall/Forbes; > 150 with 7,700 | 34.9; 237.3 | 35.7; 238.5 |
| G: TDEE drifting 2,800 → 2,650 | ≥ 95% within ±250 at day 90 | 1.000 | 1.000 |
| H: regression agrees with Kalman | ≥ 90% | 0.990 | 0.984 |

For E, 86.8% of individual runs (default mode) reach a data share ≥ 0.7 at day 42 (89.4% in best-fit-only mode), and 100% are below 0.3 at day 7. Run the second column with `npx cross-env TUNING_MODE=max vitest run tests/accuracy.test.js`.

The composition tests use BIA noise of 0.8 kg (fat and muscle mass) and 1.0 point (BF%), and 0.7 cm per waist reading. Over 12 weeks, 99.2% of pure-noise runs are reported as "no measurable change", and 98.4% of runs with a true 4 kg fat loss and −4 cm waist are classified as "losing fat".

## Deviations from the original specification

- **Water tuning uses likelihood-weighted averaging** over the 20-cell grid instead of only the maximum-likelihood cell. At 42 days the best cell is often a too-small water noise, which gives over-confident ranges (scenario B coverage 0.893). Averaging keeps the same grid, criterion and schedule, and brings coverage to 0.938. The best-fit cell is still shown in "Explain the math", and `tuningMode: "max"` is available.
- **No complete intake in the last 14 days:** instead of feeding "current T estimate" into the tissue equation, which would let weight change pull on TDEE with no intake data behind it, intake is assumed to track TDEE for that day (σ_I = 300).
- **Intake shifts** compare the 7 days starting at a day with the 7 days before it (each needs ≥ 3 complete days). A run of qualifying days counts as one shift, placed at the largest difference.
- **Body-fat readings** older than 180 days are not used for energy per kg or Katch-McArdle.
- **Composition "≥ 21 days apart"** is measured between the mean dates of the first-3 and last-3 groups, and the groups must not overlap (6+ readings).
- **Scenario E** is asserted on the median run (the requirement doesn't say per-run); per-run rates are reported above.
- **Regression cross-check** needs ≥ 7 weigh-ins and ≥ 7 complete food days in the 28-day window.

## Limits

- Accuracy depends on consistent logging and frequent weigh-ins. With sparse data the range stays wide and the label stays "Estimated".
- If you consistently under-log (or over-log), the measured maintenance shifts by the same amount. The recommendations stay valid relative to your own logging, as long as you log the same way.
- BIA body-fat and muscle readings are noisy; hydration alone moves them. DEXA and tape measurements are more reliable for tracking change.
- Water, food-label error and scale error set a floor on accuracy. The app always shows a range and never claims an exact number.
- Calories alone can't tell fat loss from muscle loss; that depends on training, protein and sleep.

## Sources

- Hall KD. What is the required energy deficit per unit weight loss? *Int J Obes* 2008;32(3):573–576. doi:10.1038/sj.ijo.0803720
- Forbes GB. Lean body mass–body fat interrelationships in humans. *Nutr Rev* 1987;45(8):225–231.
- Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation for resting energy expenditure in healthy individuals. *Am J Clin Nutr* 1990;51(2):241–247.
- Katch-McArdle equation (BMR = 370 + 21.6 × lean body mass), as published in McArdle WD, Katch FI, Katch VL. *Exercise Physiology: Energy, Nutrition, and Human Performance*. Lippincott Williams & Wilkins.
- Deurenberg P, Weststrate JA, Seidell JC. Body mass index as a measure of body fatness: age- and sex-specific prediction formulas. *Br J Nutr* 1991;65(2):105–114.
- Hodgdon JA, Beckett MB. Prediction of percent body fat for U.S. Navy men and women from body circumferences and height. Naval Health Research Center, Reports 84-11 and 84-29, 1984.
- Rauch HE, Tung F, Striebel CT. Maximum likelihood estimates of linear dynamic systems. *AIAA J* 1965;3(8):1445–1450.
- WebKit: "Full Third-Party Cookie Blocking and More" (2020) — the 7-day cap on script-writable storage in Safari.
