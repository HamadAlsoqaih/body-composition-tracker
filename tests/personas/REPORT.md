# BodyTracker — persona simulation study (run3)

21 simulated people (personas) used the app for 12 weeks each (p24: 4 weeks), only through the phone screen. The simulator (`sim.js`) holds each person's true body, true maintenance (TDEE) and true intake. The app never sees those values, and neither does the persona agent.

Each night the orchestrator read the numbers visible on the app's screen and compared them with that ground truth. Nothing in the app was changed.

| | |
|---|---|
| Run | `run3`, 2026-09-26, started 20:29 UTC. The last persona finished at 22:41 UTC, so the persona phase took **2 h 13 min**. Analysis and this report followed. |
| Personas | 26 defined. **21 completed**, **0 failed**, **0 restarts**, **5 skipped by choice** (see [Skipped](#skipped-by-choice)). |
| Max parallelism | **10** in the first wave. After that 6–7, set by CPU headroom (see [Decisions](#decisions-made-during-the-run)). |
| Simulated usage | 1,708 person-days and 6,291 food entries (counted from each persona's final backup). |
| Data | Per persona: `results/<id>.json` (seed, plan history, weekly comparison, journal, final reply). Also `results/_analysis.json` (all weekly rows and the summary) and `results/_run.json` (registry and decision log). |
| Screenshots | `report-assets/<persona>-<id>.jpg`. These are copies of the screenshots cited below; the originals are in the git-ignored `run3/out/<id>/screens/`. |

How to read the accuracy numbers:
- **True TDEE** is the simulator's real maintenance on the date of the app's last weekly update.
- **Logging units** is true TDEE × (1 + that persona's logging bias). The app only sees logged calories, so for a persona who under- or over-reports, this is the best number it could possibly reach. Only p01 (−20%) and p04 (+15%) have a bias. Everyone else logs true calories apart from random label error.
- **Correct target** is (true TDEE + the goal rate × weight × energy per kg ÷ 7) in logging units. A target counts as correct if it is within max(150 kcal, 7%) of that.

---

## 1. Summary table

| Persona | Goal | Weeks | Final TDEE error (app − truth) | Truth inside the app's ± range? (final · weeks inside) | Target correct? (final · weeks OK) | Guardrails correct? | Would keep using |
|---|---|---|---|---|---|---|---|
| p01 Khalid, 118 kg, logs dinner only | lose | 12 | **−1,631** (−1,071 in his logging units) | **No** · 2/12 (4/12 in logging units) | **No** · 0/11 | Partly: the target held at the floor, but maintenance fell below BMR with no warning | maybe |
| p02 Sara, cycle, wedding | lose 0.6%/wk | 12 | +94 | Yes · 12/12 | Yes · 8/11 | n/a | maybe |
| p03 Omar, recomp, BIA + tape | lose 0.5% (no recomp option) | 12 | +57 | Yes · 10/12 | Yes · 9/11 | n/a | maybe |
| p04 Faisal, hard-gainer, over-logs +15% | gain 0.5% | 12 | +167 (−285 in his logging units) | Yes · 10/12 (2/12 in logging units) | **No** · 0/11 | n/a | maybe |
| p05 Lina, night owl, lb/in | gain 0.25% | 12 | −15 | Yes · 12/12 | Yes · 10/11 | n/a | maybe |
| p06 Hamad, BIA, careful logger | lose 0.5 → 0.35% | 12 | +95 | Yes · 12/12 | Yes · 8/11 | n/a | yes |
| p07 Noura, never logs weekends | lose 0.5% | 12 | −214 | **No** · 11/12 | Yes · 11/11 (held at the floor) | n/a | maybe |
| p08 Yousef, creatine, salty Thursdays | lose 0.5% | 12 | −8 | Yes · 11/12 | Yes · 3/11 | Partly: floor held; days of 1,343 kcal got no warning | maybe |
| p09 Abdullah, 3-week stall then whoosh | lose 0.5% | 12 | +98 | Yes · 10/12 | Yes · 7/11 | Yes: never went below the floor, never pushed a crash cut at 0.5% | yes |
| p10 Reem, 10-day illness gap | lose 0.5% | 12 | +156 | Yes · 9/12 | Yes · 8/11 | n/a | yes |
| p11 Mohammed, Ramadan suhoor 03:30 | maintain | 12 | −57 | Yes · 12/12 | Yes · 10/11 | n/a | yes |
| p12 Huda, aggressive dieter | lose "as fast as possible" (2%) | 12 | +104 | Yes · 12/12 | n/a: the correct maths (767) is below the floor, and the app held 1,250 | **No**: no rate cap (1000%/wk saved); "eat less" at 921 and 672 kcal; "On track" at 514 kcal/day | maybe |
| p13 Ali, 16 years old | lose | 12 | +65 | Yes · 12/12 | n/a (adults only) | **Partly**: target hidden but maintenance shown; fast-loss warning late and without a number; 3% body-fat goal accepted | maybe |
| p14 Maha, pregnant (2nd trimester) | maintain (Lose locked) | 12 | −352 * | No · 3/12 * | No · 0/11 * | **No**: told to eat 230–610 kcal/day less for 6 weeks in pregnancy mode | maybe |
| p15 Rana, BMI 17.9, wants 46 kg | lose → blocked, maintain | 12 | −20 | Yes · 12/12 | Yes · 11/11 | Partly: loss goal and underweight goal weights correctly refused; silent as her BMI fell to about 16 | maybe |
| p16 Tariq, typos | lose 0.5% | 12 | +30 | Yes · 12/12 | Yes · 10/11 | Partly: the weight typo was caught; the 950-kcal day and the duplicate meal were not | yes |
| p17 Dana, DEXA ×3 | lose 0.5 → 0.25% | 12 | +32 | Yes · 12/12 | Yes · 11/11 | n/a | maybe |
| p18 Sami, bathroom scale + tape | lose 0.5% | 12 | +81 | Yes · 12/12 | Yes · 10/11 | n/a | yes |
| p21 Nasser, 170 kg beginner | lose 0.5% | 12 | +185 | Yes · 11/12 | **No** · 1/11 | Yes: floor held; the "below minimum" note was accurate | yes |
| p24 returning user (v1 data) | lose 0.6% | 4 | −56 | Yes · 4/4 | Yes · 3/3 | n/a | yes |
| p26 Jana, logs half the days | lose 0.5% | 12 | +33 | Yes · 12/12 | Yes · 10/11 | n/a | maybe |

\* **p14 is not comparable.** The simulator adds pregnancy gain as lean mass with no energy cost, so "true TDEE" there is not what the app is trying to measure. p14 is left out of the statistics in section 2. Its behaviour findings (section 3, C2) do not depend on this.

**Would keep using:** 8 yes (p06, p09, p10, p11, p16, p18, p21, p24), 13 maybe, 0 no. Almost every "maybe" was a variant of "yes as a diary, no as a coach".

---

## 2. Accuracy

The maintenance shown on the app's Nutrition card was compared with the truth at the end of weeks 4, 8 and 12. The headline uses logging units and excludes p14.

| | n | Median absolute error | 90th-percentile absolute error | Truth inside the app's 95% range |
|---|---|---|---|---|
| **Week 4** | 20 | **91 kcal** | **510 kcal** | **90%** (18/20) |
| **Week 8** | 19 | **85 kcal** | **281 kcal** | **84%** (16/19) |
| **Week 12** | 19 | **81 kcal** | **214 kcal** | **89%** (17/19) |

Other ways of cutting the same data:
- **Against true TDEE (not logging units):**
  - Week 4: median 90, 90th percentile 521, coverage 90%.
  - Week 8: median 82, 90th percentile 265, coverage 89%.
  - Week 12: median 81, 90th percentile 185, coverage 89%.
- **Including p14** (logging units):
  - Week 4: median 91, 90th percentile 510, coverage 86%.
  - Week 8: median 92, 90th percentile 415, coverage 80%.
  - Week 12: median 94, 90th percentile 285, coverage 85%.

What these numbers say:
- **Typical accuracy is good.** When people log complete days, the median error is under 100 kcal from week 4 onward.
- **The range claims 95% but reached 84–90%.** The misses are not random. They are the scenarios where the model's assumptions break:
  - p01: incomplete days marked complete.
  - p04: over-logging plus the model staying close to the formula.
  - p07: weekends never logged.
  - p09: a water stall at week 4 (−575).
  - p10: an illness gap at week 8 (+281).
- **The tail is where the damage is.** The 90th-percentile error is 510 kcal at week 4, which is large enough to wipe out a 0.5%/week deficit. p01 alone is 1,071 kcal off at week 12 in his own logging units, labelled **"Measured, 90% from your data"**.
- **Small sample.** With about 20 personas, the 90th percentile is roughly the third-worst persona. Treat it as a scenario indicator, not a population estimate.
- **The label reads confident while the estimate is wrong.** "Measured" first appeared on day 22–43 (median day 29). It stayed "Measured" through the failing scenarios (p01, p04 and p07 at every check from their first "Measured"; p10 after the gap).

---

## 3. Bugs, by priority

Each bug lists the personas it hit, how to reproduce it, expected vs actual behaviour, and the evidence. Screenshots are in `tests/personas/report-assets/`.

### Critical

**C1 — "Eat less" and "On track" shown to someone eating far below the app's own floor; no cap on the loss rate** (p12)
- **Repro:**
  1. Go to Nutrition ⚙ → Lose → Weekly rate, type 1000, Save.
  2. Alternatively, set 2%/wk and log about 900 kcal/day, then down to about 500, for 8 weeks.
- **Expected:**
  - The rate is capped or refused.
  - When recent intake is below the minimum the app suggests (the larger of BMR and 1,200), it never says "eat less".
  - Very low intake is flagged.
- **Actual:**
  - 1000%/wk saved. The card said "The math gives -679221 kcal/day".
  - Week 6: "Eating about 270 kcal/day less than recently would close the gap" (average intake 921).
  - Week 7: "about 220 less" (average 672).
  - Week 8: headline "**On track**" at an average of 514 kcal/day, with −1.4 kg/week.
  - The only pushback was a small orange card ("above 1.5%… consider eating more / doctor") that repeated unchanged for 10 weeks.
- **Evidence:** `p12-1790457617067.jpg` (1000%/wk), `p12-1790458858735.jpg` (eat 270 less), `p12-1790459072153.jpg` (eat 220 less), `p12-1790459269456.jpg` (On track + floor note).

**C2 — Pregnancy mode tells a pregnant user to eat less** (p14)
- **Repro:**
  1. Tick "Pregnant or breastfeeding" in the profile.
  2. Log normally while gaining about 0.3–0.5 kg/week.
- **Expected:** no deficit advice, no "+0 kg/week" target, and no learning a lower "maintenance" from pregnancy weight gain.
- **Actual:**
  - Weeks 4–9: "doesn't include your target of +0 kg/week. **Eating about 610 → 230 kcal/day less** than recently would close the gap". This sat directly above the note "deficit targets are turned off".
  - The "Measured" maintenance fell from 2,110 to 1,890, below the app's own formula value (1,971).
  - "Explain the math" shows "Goal: maintain … 0 kg/week" and nothing about pregnancy.
- **Evidence:** `p14-1790459081769.jpg`, `p14-1790458755110.jpg`, `p14-1790460439238.jpg`.

**C3 — Incomplete days marked "complete" are trusted blindly, and maintenance collapses below BMR with a "Measured 90%" label** (p01)
- **Repro:** for a 118 kg sedentary male, log only dinner (450–690 kcal) most days, tick Day complete or answer "Mark yesterday complete? Yes", and weigh 3×/week.
- **Expected:**
  - A complete day far below BMR (or far below the current estimate) triggers "is this everything?" and is left out of the estimate unless confirmed.
  - Maintenance below BMR gets a warning.
  - A lose target is never above maintenance.
- **Actual:**
  - Maintenance went 2,580 → 1,170 ± 190 "MEASURED 90%". The truth was 2,801, or 2,241 in his own logging units.
  - The app's own BMR was 2,076.
  - The target of 2,080 sat above maintenance with goal "lose", and it said "On track".
  - Week 9 said "eat ~250 more than recently" with 0 complete days.
- **Evidence:** `p01-1790455525518.jpg` (1,170 Measured 90%, 522 kcal "complete"), `p01-1790455119080.jpg` (below BMR), `p01-1790454951192.jpg` (target > maintenance), `p01-1790455396195.jpg` (advice with 0 complete days).

### High

**H1 — The recommendation's "eat N more/less than recently" contradicts its own "Suggested intake"** (p04, p09, p16, p17, p21, p01)
- **Cause:** N is computed from the gap in weight-change rate, not from the difference between suggested and recent intake. `p04-1790458048989.jpg` shows this: target 3,011, then "closing the gap needs about 617 kcal/day more".
- **Examples:**

  | Persona | Advice | Suggested | Recent average |
  |---|---|---|---|
  | p04, day 29 | "~620 more" | 3,010 | 3,445 |
  | p21, day 15 | "+1,140" | 3,110 | 2,897 |
  | p16, week 11 | "460 less" | 2,260 | 2,167 |
  | p09, day 15 | "650 more" | 1,860 | 1,916 |
  | p17, day 15 | "920 more" | 1,920 | 1,693 |

- **Expected:** one number that agrees with the suggested intake.
- **Actual:** the two point in opposite directions. p04 nearly cut back mid-bulk, and p09 read "eat 960 less" (at 1%/wk) as a reason to crash-diet.
- **Evidence:** `p04-1790458048989.jpg`, `p21-1790460453936.jpg`, `p16-1790457069377.jpg`, `p09-1790455225717.jpg`, `p09-1790455520312.jpg`, `p17-1790460215072.jpg`.

**H2 — "On track" whenever the target touches the 95% band, even when the central estimate is far off or going the wrong way** (16 of 21 personas complained)
- **Repro:** any goal where the rate range is wide. For example, p04 on a gain goal at −0.17 kg/wk.
- **Expected:** "On track" only when the central rate is near the target, otherwise "too early to tell" or "behind".
- **Actual:**
  - p04: "On track" at −0.17 and −0.02 kg/wk on a gain goal.
  - p05: "On track" in 10 of 11 weeks at rates from −0.39 to +1.02 lb/wk against +0.30.
  - p02: "On track" at −0.27 vs −0.45 kg/wk.
  - p26: "On track" while regaining.
  - p01: "On track" with the target above maintenance.
- **Evidence:** `p04-1790457986340.jpg`, `p05-1790457070808.jpg`, `p09-1790455535287.jpg`.

**H3 — Water shifts are read as tissue: tags don't help, and early glycogen drops inflate maintenance** (p08, p21, p02, p09)
- **p08, creatine** (tagged "Creatine start" on day 15; the scale rose 1.9 kg of water):
  - Maintenance went 2,940 → 2,630 → 2,430 → 2,240 and the target hit the 1,860 floor. The week-5 advice was "eat ~380 less".
  - Tags cover only the tagged day plus 2 days and are never mentioned in the math.
  - Truth over the same period was 2,673 → 2,621.
  - Target correct in only 3 of 11 weeks.
- **p21, 170 kg:**
  - A 3 kg early glycogen/water drop was read as fat loss. Maintenance was +521 kcal at week 4 and +185 at week 12, and the target was correct in 1 of 11 weeks.
  - He lost 0.58 kg/week of tissue against a 0.85 kg/week goal while the app said "On track". Most of the extra scale drop was water.
- **p02:** the menstrual tag covers 3 days, while her bloating lasts about a week. The app never linked a jump to her cycle.
- **Expected:** tagged events widen the noise for an appropriate window (creatine 2–4 weeks, cycle about 7 days), and a large early drop is not credited as fat.
- **Evidence:** `p08-1790458125175.jpg`, `p08-1790458523117.jpg`, `p08-1790458351762.jpg` (chart).

**H4 — Unlogged days are assumed to be "average", so gaps and weekend patterns bias maintenance; the range doesn't widen and the label turns "Measured" on no data** (p10, p07)
- **p10, 10-day illness gap (days 29–38, eating very little):**
  - During the gap the range widened only slightly: ±290 at the 11-01 update, ±300 at 11-08, with data share 58% → 55%. The label stayed "Measured".
  - After she returned, the fill-in of "average" intake for the gap made maintenance jump 1,860 → 1,980 → 2,160 (truth about 1,880), and the app said "losing too fast, eat +290" for two weeks.
  - The persona believed the label flipped to Measured on an empty week. The scraped rows show it flipped at the 11-01 update, which was built from the logged weeks before the gap; she just didn't see it until she came back.
- **p07, weekends never logged:**
  - Maintenance slid 2,050 → 1,740 (truth 1,954, outside the range at week 12). The target was pinned at the floor for 7 weeks and loss ran at half the goal.
  - No message ever mentioned the weekend pattern, although every Monday weigh-in was the week's highest.
- **Expected:** a gap widens the uncertainty clearly and returns the label to "Estimated"; the gap's intake is treated as unknown rather than average; and a weekday/weekend pattern is detected and pointed out.
- **Evidence:** `p10-1790459161413.jpg`, `p10-1790459001742.jpg`, `p07-1790458881731.jpg`.

**H5 — Food logged after midnight lands on the next calendar day, and the date can't be fixed by editing** (p05; p11 is the counter-case)
- **Repro:** at 00:40, tap + Food. The date defaults to tomorrow. The "Mark yesterday complete?" banner shows at the same moment. Then try to change an entry's date via Edit.
- **Actual:**
  - p05 hit this on 35 of 35 late snacks. She fixed 29 by changing the date first. 5 were missed, and each of those evenings had already been closed as complete without the snack.
  - Edit has no date field, and changing Date while editing silently cancels the edit.
  - p11 logged suhoor at 03:30 and the next date was what he *wanted*.
- **Expected:** a configurable day-boundary hour (for example 04:00) or an explicit "which day?" choice, and editable dates. The banner should not invite closing a day before the boundary.
- **Evidence:** `p05-1790454700240.jpg`, `p05-1790454687906.jpg`.

**H6 — The under-18 safeguard is easy to get around** (p13)
- **Actual:**
  - The target is hidden ("adults only") but maintenance is shown weekly, so Ali ate maintenance − 1,000 and lost 9.6 kg in 12 weeks.
  - He lost 1.19 kg/week (about 1.6%) at week 6 with no warning. The fast-loss warning only came at the next update, and it gave no number.
  - Body ⚙ accepted a **3% body-fat goal** for a 16-year-old. Target weight uses the adult BMI 18.5 cut-off.
  - Adult formulas (Mifflin, Deurenberg) are used with no note.
- **Expected:** for minors, hide the calorie arithmetic, set age-appropriate goal limits, and show the fast-loss warning immediately with plain guidance.
- **Evidence:** `p13-1790459511906.jpg`, `p13-1790458133368.jpg`, `p13-1790458021003.jpg`.

**H7 — An over-logging gainer never gets a correct target; the app ignores its own cross-check** (p04)
- **Actual:**
  - Week 12 maintenance was 3,180 against 3,465 in his logging units. The data share was stuck at 57–69%.
  - The target was wrong in all 11 weeks and he gained 0.8 kg in 12 weeks (goal 0.5%/wk ≈ 3.7 kg).
  - On day 29 "Explain the math" said the regression gave 3,330 ± 200, which "differs from the filter by 519 kcal (limit 398)", and then used the filter anyway.
- **Expected:** when the cross-check fails, blend it in or widen the range, and say so on the main card.
- **Evidence:** `p04-1790458048989.jpg`.

**H8 — One meal without macros wipes that day's protein, carbs and fat everywhere** (18 of 21 personas)
- **Repro:** log 3 meals with macros and 1 with calories only.
- **Expected:** partial totals marked "partial".
- **Actual:**
  - The day total shows only kcal.
  - The day is dropped from the protein average (so "on N logged day(s)" jumps around).
  - The daily export drops that macro for that day (for example 34 of 84 days in p03's export had no protein).
- **Evidence:** `p09-1790454864427.jpg`, `p04-1790457187876.jpg`, `p13-1790458251819.jpg`.

**H9 — Body-composition analysis ignores or misreads the best data** (p03, p06, p17)
- **"No waist data"** with 5 waist entries, for 10 weeks, in both p03 and p06. The card even shows a US Navy tape estimate: `p03-1790455749298.jpg`, `p06-1790456975911.jpg`.
- **DEXA not counted (p17):**
  - 3 DEXA scans, yet "needs 3 readings at each end; have 0".
  - The math uses the profile's 29.5% instead of the DEXA fat mass (19.8 kg shown vs 19.2 entered).
  - Evidence: `p17-1790459689389.jpg`, `p17-1790459844479.jpg`.
- **Impossible "high confidence" (p06):** fat −8.1 kg, muscle −0.4, weight only −4.1, labelled "Confidence: high — Losing fat". There is no check that fat + lean change adds up to the weight change. Evidence: `p06-1790457778609.jpg`.
- **"Losing fat" while BIA fat rose past its own noise limit (p03):** `p03-1790456545676.jpg`.
- **Protein target flips 133 → 116 → 133 g** because noisy BIA crosses 25% (p03): `p03-1790455313942.jpg`.

**H10 — An underweight user who keeps losing gets only a neutral line** (p15)
- **Actual:**
  - Loss goals and goal weights below 50.4 kg were correctly refused. The wording reads "please choose 50.4 kg or more" to someone weighing 48.6 kg; `p12-1790459980946.jpg` shows the same message.
  - Rana then used the displayed maintenance to diet on her own, falling from BMI 17.9 to about 16.2 (44.1 kg at the lowest). The main screen only ever said "eat about N kcal/day more".
  - The Body-fat ring showed "0% → 18%" with no reading ever entered (`p15-1790459620686.jpg`).
- **Expected:** continued loss below BMI 18.5 (or below 17) raises a clear, escalating notice on the main card.

### Medium

**M1 — Implausible entries are accepted silently** (p16). A whole-day entry of 950 kcal (a typo for 2,950), ticked complete, got no warning. It skewed the 14-day average (2,007 instead of about 2,340) and the week-4 update. An exact duplicate lunch 2 minutes apart was also accepted. The weight typo (9.6 kg) *was* caught. Evidence: `p16-1790455378932.jpg`.

**M2 — "Weekly" numbers change on the update day itself, and the update runs at the first open after midnight** (p05, p06, p07, p11, p13, p16, p26)
- p07, 11-09: "On track" in the morning, then "eat ~260 less" in the evening, with the same "last update" date.
- p11: the update ran at 03:30 suhoor (2,550 ± 260), then changed after the morning weigh-in (2,580 ± 240).
- p16: numbers changed on Sunday evening, and again on Tuesday.
- p26: the rate range moved as soon as she tapped "Yes, it's complete".
- The settings text says numbers refresh once a week "so they don't jump around".
- Cause (from reading `src/lib/analysis.js:130`): on the update day the snapshot index is today, so the "weekly" snapshot is the live estimate and moves with every entry that day, and the update happens at the first open after midnight.
- Evidence: `p07-1790458055090.jpg` → `p07-1790458106624.jpg`, `p11-1790455706752.jpg`.

**M3 — The profile's "Current weight" is silently saved as a weigh-in** (p02, p03, p05, p06, p11, p16, p17, p26). This creates duplicate day-1 weigh-ins, inflates "N daily weights used", and shows up in exports with an empty source. Evidence: `p11-1790454658285.jpg`, `p02-1790454793485.jpg`, `p05-1790454960680.jpg`.

**M4 — Setup never asks for a goal.**
- The target starts as "maintain". Lose/Gain is behind the ⚙ on Nutrition, and target weight is behind a *different* ⚙ on Body.
- 11 personas mentioned this in their reports. The others found the ⚙ quickly or had maintain goals.
- p02 found the target weight only on day 84, by reading her backup file.

**M5 — The week-1 counter is frozen.** "On-track check needs 14 days of data (day 1 so far)" shows on days 2–7 (17 personas). Evidence: `p07-1790457394587.jpg`, `p14-1790458355259.jpg`, `p18-1790460255517.jpg`.

**M6 — "Explain the math" inconsistencies** (p02, p03, p06, p08, p12, p13, p14)
- The regression window starts before the first data point ("2026-09-28 → 2026-10-25" for data starting 10-04).
- A regression with the opposite sign to the filter is called "agrees" (p03 day 8: −41.7 g/day vs +0.22 kg/wk).
- Day 7 says "7 daily weights used" next to "needs ≥ 7 weigh-ins".
- p12 week 1 shows a second maintenance of 3,080 ± 910.
- Evidence: `p02-1790455506758.jpg`, `p13-1790458775781.jpg`, `p08-1790457700662.jpg`.

**M7 — Segmented buttons inside `<label>` get the wrong accessible name, and tapping the label text selects the first option.** Found by the orchestrator while building the harness, not by a persona.
- The seg buttons sit inside `<label class="fld">`, so a screen reader announces "Lose" as "Goal Maintain Gain", and tapping the word "Goal" selects the first option.
- The same pattern is used for Sex, Units, "already eating the same 2+ weeks" (answers Yes) and "Measured with".
- Repro: Nutrition ⚙, tap the text "Goal". With a screen reader, focus the "Lose" button.

**M8 — The weight chart spaces points by entry, not by date.** An 11-day gap looks like one step, and a flu drop looks like a one-day cliff. The last x-axis label is clipped (p10, p15). Evidence: `p10-1790459032686.jpg`, `p10-1790460253336.jpg`, `p15-1790461807357.jpg`.

**M9 — Outlier handling is invisible** (p02, p16)
- p02 entered 72.4 on a period day. The Weight ring kept showing yesterday's 75.3 with "1 weigh-in ignored".
- p16 had three real weigh-ins set aside as >4 SD, visible only deep in "Explain the math".
- Evidence: `p02-1790456396210.jpg`.

**M10 — Export problems**
- The lb setting is ignored: exports are in kg, with values like 55.111472955 (p05).
- The Measurements CSV has `104.26666666666667` (p18).
- CSV/backup times are UTC (06:50 local shows as 03:50Z) while the daily export uses local time (8 personas).
- "For spreadsheets" offers only JSON (8 personas).

**M11 — Backup wording and metadata**
- "It's been 30+ days since your last backup" appears when there has never been one (5 personas).
- The banner's "Back up now" only opens the data page (p10, p24).
- A backup's own `meta.lastBackupAt` holds the *previous* backup date, or null (p01, p11, p16, p24).
- Evidence: `p10-1790458982944.jpg`.

**M12 — The data share and the Estimated/Measured label go backwards while the user logs every day** (p08, p09, p10, p24). p09 went 66% Measured → 50% Estimated → 59% Measured. Evidence: `p09-1790456207278.jpg`.

**M13 — The headline target and the sentence under it disagree** (1,460 vs "1463"; 2,720 vs "2717"; 1,730 vs "1734") (p07, p12, p18, p21). Evidence: `p18-1790460255517.jpg`.

**M14 — Home-card deltas use single raw readings.**
- The weight ▲/▼ is compared with the first weigh-in, so it showed ▲ on a day the scale went down (p08).
- BIA arrows swing from one reading to the next ("Fat Mass ▲6.9 kg"), contradicting the careful 3-vs-3 breakdown (p03, p06, p18).

**M15 — Tabs keep their scroll position**, which hides the "Mark yesterday complete?" banner and the recommendation (p02, p24, p26). Evidence: `p26-1790455240298.jpg`.

**M16 — Migration note mismatch** (p24). The note says activity 1.45, but 1.375 is chosen silently.

### Low

- **L1 — Spacing typos:** "36 day s", "25 daily weight s", "( male formula)", "not granted by the browser ." (7 personas). Evidence: `p07-1790458075073.jpg`, `p15-1790459739507.jpg`.
- **L2 — Escape doesn't close sheets** (p24).
- **L3 — Profile form layout:** Height and Age share one label line (p26), and "Pregnant or breastfeeding" still shows after choosing Male (p18).
- **L4 — Food log buttons:** "Add entry" is both the heading and the button, and "Save changes" is below the fold when editing (p04, p14, p16).
- **L5 — Measurements:** the waist chart's y-axis labels are unevenly spaced, and the breakdown's −2.9 cm doesn't match its own shown 103.6 → 100.6 (p18).
- **L6 — Day lists:** "Last 14 days" lists dates before install as "not logged", and "x of last 7 days complete" counts today before it's logged (p02, p04, p06, p11, p12).

---

## 4. UX confusion, by screen

Counts are the number of the 21 completed personas whose final report or journal mentions the issue. I counted with keyword searches over `run3/out/<id>/final.md` and `journal.md`, then checked by reading. Treat them as ±1–2.

**Body (home) screen**
- 17: tapping the big "Weight" tile opens the trend chart; adding a weigh-in is the small "+ Weight". (p01, p03–p06, p09, p10, p12–p18, p21, p24, p26)
- 20: the Body-composition card says "Not enough data yet" for weeks or for the whole run, and is the biggest box on the screen. It doesn't say what it needs.
- 4+: the ▲/▼ deltas compare with the first reading, and BIA arrows show single-reading swings (see M14).
- 3: the Body Fat, Fat Mass and Muscle rings stay "—", or show "0% → 18%", when the user has no body-fat scale (p02, p15, p18).

**Nutrition card**
- 20: the macro-mismatch note ("macros add up to ~X kcal (N% apart)") appears on most days, stays for up to a week, can't be dismissed, and doesn't say which entry is wrong.
- 17: "(day 1 so far)" stays frozen through week 1 (M5).
- 16: "On track" felt meaningless or too generous (H2).
- 11: no goal question at setup; Lose/Gain is hidden behind ⚙ (M4).
- 4: no "kcal left / over today" figure (p02, p08, p21, p24).
- 6: the "weekly" numbers changed on the same day (M2).
- Several: the protein "reference weight" (for example "× 64 kg" for an 84 kg user, "× 90.3 kg" for 170 kg) is only explained in the math page.

**Food log**
- 18: macros vanish from the day total when one meal lacks them (H8).
- 4: dates before install are shown as "not logged" (L6).
- 3: "Add entry" heading vs button; "Save changes" below the fold (L4).
- 1, but systematic: after-midnight date and no way to move an entry to another day (H5).

**Explain the math**
- 12: too technical ("Kalman", "Hall 2008", "MAD", "φ") and too long, with no plain summary at the top.
- 6: the regression window starts before the first data point, or the cross-check wording contradicts itself (M6).
- 7: "day s" / "weight s" typos (L1).

**Your data / exports**
- 15: "Persistent storage: not granted by the browser" is never explained.
- 8: the "for spreadsheets" export is JSON.
- 8: time zones are inconsistent (UTC vs local).
- 5: the "30+ days since your last backup" banner appears with no previous backup.

**Setup / profile**
- 8: the profile weight became a duplicate weigh-in (M3).
- p24: the migration note says activity 1.45 but 1.375 was chosen.
- p18: the Pregnancy box is shown to men; the Height/Age boxes have no hint inside.

**Navigation**
- 3: tabs reopen at the old scroll position (M15).
- 1: Escape doesn't close sheets.

---

## 5. Persona reviews (in their own words)

Condensed from each persona's `final.md` (the full text is in `results/<id>.json → agentReply`).

- **p01 Khalid:** "Weighing in is quick, and I liked seeing '▼ 8 kg'. But I only write my dinner, and the app took that as my whole day. Then it told me my maintenance is 1,170 and to eat MORE to lose weight, with a target higher than my maintenance." *Maybe, only as a weight diary.*
- **p02 Sara:** "Logging was quick, and the calm Sunday updates got me through three cycles of 1–2 kg jumps. But I never saw what the Menstrual tag did, my goal weight was hidden behind the other ⚙, and it kept calling me on track when I was clearly behind my wedding pace." *Maybe.*
- **p03 Omar:** "The math page and the 'first 3 vs last 3 ± noise' breakdown are the only reason I didn't panic about my jumpy BIA scale. But the dashboard shows every scale swing like it's real, the app has no idea what a recomp is, and it tells me every day I'm 45 g short on protein without helping." *Maybe.*
- **p04 Faisal:** "It finally showed me why I 'eat so much' but don't gain: my maintenance is about 3,200, not 2,300. But 'On track' shows even when I'm losing, and the week-5 advice said eat more while giving a smaller number than I already ate. I almost cut back in the middle of a bulk." *Maybe, leaning yes.*
- **p05 Lina:** "Logging is fast and I liked watching the ± shrink from 480 to 210. But I had to fix the date on every one of 35 midnight snacks, and the banner at 00:40 made the misses worse. 'On track' stopped meaning anything to me." *Maybe.*
- **p06 Hamad:** "For calories it's excellent: it found my real maintenance in about 5 weeks and was honest about the ± range. The body-composition part trusts my noisy BIA too much: it ignored my waist for 10 weeks, then called an impossible −8 kg of fat 'high confidence'." *Yes.*
- **p07 Noura:** "Logging is quick and 'On track' is all I have time to read. But three months at ~1,450 on weekdays got me only 2 kg. It kept lowering my maintenance and never told me I don't log weekends and gain every Monday." *Maybe.*
- **p08 Yousef:** "The trend line and the High-salt tag kept me calm on bad Thursdays. But I told it I started creatine and it still cut my calories to its minimum for weeks. I'd not blindly trust the weekly calorie number when my water weight moves." *Maybe.*
- **p09 Abdullah:** "The trend line and the app refusing to go below my BMR are what stopped me crash-dieting when I was stuck at 100 kg for three weeks. What I hated was 'eat 650 more' then 'eat 960 less' while the suggested number said something else. It never just says 'a flat week is normal, don't cut.'" *Yes.*
- **p10 Reem:** "My data survived the 10 days away and I lost 4.5 kg. But when I came back after being sick the app acted like nothing happened: it assumed I'd eaten normally, called its estimate 'Measured', and told me to eat more for two weeks." *Yes.*
- **p11 Mohammed:** "Through Ramadan every 3:30 am suhoor landed on the fasting day I meant, with no setting needed. When I drifted down it told me clearly to eat about 220 kcal more, and that fixed it. The weekly number is made at suhoor time and then changes, and the macro warnings nag." *Yes.*
- **p12 Huda:** "It let me set 2% a week, even 1000%, and never stopped me. It saw I was eating 500 kcal a day and said 'On track', and twice in big letters told me to eat even less. Good diary, bad coach for someone like me." *Maybe.*
- **p13 Ali:** "The 'adults only' thing is basically for show. It hides one number and still gives me my maintenance, so I ate about 1,000 under and dropped almost 10 kg. It warned me late and wouldn't say how much to eat." *Maybe.*
- **p14 Maha:** "I liked that the pregnancy box stopped me picking 'Lose'. But after that it acted like I'm not pregnant, and for six weeks it told me to eat 250–610 kcal less, right under a note saying deficits are off. I felt guilty every Sunday." *Maybe, as a diary for my doctor.*
- **p15 Rana:** "It refused 46, 48 and even 50 kg, so I used its maintenance number to diet on my own anyway. It felt preachy on day 1 and then strangely quiet when I actually dropped to 44 kg." *Maybe.*
- **p16 Tariq:** "6 kg down in 12 weeks and a minute per meal to log. It caught my 9.6 kg typo instantly, but let a 950-kcal 'complete' day and a doubled lunch slide. I'd double-check my own entries because the app won't." *Yes.*
- **p17 Dana:** "The estimate went from a formula guess to 'Measured 2,160 ± 170', and I could check every number. But I pay for DEXA scans to know if I'm keeping muscle, and the app never gave a verdict from my three scans." *Maybe: yes for calories, no for body composition.*
- **p18 Sami:** "The three-box waist entry is exactly how I measure, and 'Losing fat' with my waist going from 104 to 100 kept me going. But the app talks like an engineer, the target kept moving, and my waist result sits below three empty body-fat circles." *Yes.*
- **p21 Nasser:** "I lost 12.7 kg on the scale, alhamdulillah. But the app talks like a scientist. In week 2 it told me to eat 1,140 more and scared me, and it never says ups and downs are normal." *Yes.*
- **p24 returning user:** "The update was painless. I couldn't close the popup by accident, my old data was all there, and it caught that I'd never set my real height and age. After that, 'On track' felt too easy on me." *Yes.*
- **p26 Jana:** "I lost about 3 kg while only logging half my days, so it kind of worked. But it said 'On track' every single week, even when I was going back up, so I stopped trusting it." *Maybe.*

---

## 6. Recommended fixes, ordered by impact (not implemented)

1. **Safety floor everywhere.** (C1, H6, H10)
   - Never show "eat less" when recent intake is below the minimum the app suggests.
   - Flag average intake below the floor on the main card.
   - Cap the rate field (for example max 1%/wk, or 1.5% with explicit confirmation) and reject nonsense values.
   - Promote the >1.5%/wk warning into the headline.
   - For under-18s and BMI < 18.5 with continued loss, show a clear escalating notice.
2. **Pregnancy mode** (C2): turn off rate-based recommendations entirely, don't learn maintenance from weight gain while the box is ticked, and remove the "+0 kg/week" target.
3. **Plausibility gate for "complete" days** (C3, M1): a day far below BMR or the current estimate (or far above it), or an exact duplicate entry, asks "is this everything?". Unconfirmed outliers are kept out of the filter. Warn when maintenance < BMR, and never show a lose target above maintenance.
4. **One number in the recommendation** (H1): compute "N more/less" as suggested − recent average intake, or drop "than recently".
5. **Stricter "On track"** (H2): require the central rate to be near the target (for example within ±35% of it) and the band not to be mostly on the wrong side. Otherwise say "too early to tell" or "behind".
6. **Unknown days stay unknown** (H4): inflate the variance for gaps so the range widens, keep "Estimated" while a week has no data, and detect weekday/weekend logging patterns and say so.
7. **Water handling** (H3): tags should inflate noise for a realistic window (creatine 2–4 weeks, cycle about 7 days) and appear in the math. Use an early-deficit glycogen prior so the first-week drop isn't credited as fat.
8. **Cross-check disagreement** (H7): when the regression disagrees beyond its limit, widen or blend and show that on the card instead of silently using the filter.
9. **Partial macros** (H8): sum what's there, mark "partial", and keep those days in averages and exports.
10. **Day boundary** (H5): a configurable "day starts at" hour (default about 04:00), a date field in Edit, and no "Mark yesterday complete?" before the boundary.
11. **Body composition** (H9): count waist and DEXA readings correctly, use DEXA fat mass in the model, check that fat + lean ≈ weight change before claiming confidence, and smooth the protein reference.
12. **Stable weekly snapshot** (M2): compute once per update day after the first weigh-in (or at end of day) and freeze it.
13. **Setup** (M3, M4): add a goal step (lose/maintain/gain, rate, optional target weight), and don't save the profile weight as a weigh-in without saying so.
14. **Accessibility** (M7): move seg buttons out of `<label>` and use a `fieldset`/`legend` or `role="radiogroup"` with `aria-labelledby`.
15. **Charts and exports** (M8–M11): a date-based x-axis, exports in the user's units and local time, rounded values, a real CSV for "for spreadsheets", correct `lastBackupAt`, and banner wording for "never backed up".
16. **Copy** (M5, L1, section 4): a plain-language summary at the top of "Explain the math", a live week-1 counter, fixed spacing typos, and an explanation or hiding of "persistent storage".

---

## 7. Persona-specific checks

| Check | Result |
|---|---|
| **#4 over-logging self-consistency** (p04, +15%) | **Fails.** The app should converge to maintenance in his logging units (3,465). It ended at 3,180 ± 310, closer to his true 3,013, with a data share stuck at 57–69%. Following the logged target, his true intake stayed near maintenance, and he gained 0.8 kg in 12 weeks against a goal of about 3.7. The app's own regression (3,330) was flagged as disagreeing and ignored (H7). |
| **#5 / #11 / #23 after midnight** | **p05:** 00:40 snacks default to the next date 35/35 times. 5 initially landed on the wrong day, each after that evening had already been closed as complete; she fixed them the next morning by deleting and re-adding (H5). **p11:** 03:30 suhoor went to the next date as intended, 28/28; the only mismatch was the Eid-night suhoor. **p23 (night shift) was skipped** (see below). |
| **#8 / #9 / #21 water events, whooshes, early drops; panic cuts?** | **p08:** the creatine tag didn't stop maintenance falling to the floor, and week 5 said "eat ~380 less", a water-driven cut (H3). Thursday salt jumps were absorbed by the trend and the tag, and the persona stayed calm. **p09:** during the 3-week stall the app never went below the BMR floor and said "On track" at 0.5%/wk; only after the persona raised the rate to 1% did it say "eat 960 less". The whoosh on day 32 caused no overreaction. **p21:** the early 3 kg drop made the app say "eat 1,140 more" (overestimate), the opposite of a panic cut. **Verdict:** no panic cut below the floor was ever advised, but water-driven "eat less" advice did appear (p08, and p09 at 1%/wk). |
| **#10 / #26 gaps: does the range widen?** | **Barely.** Across p10's 10-day gap the ± went from 290 to 300 and the data share from 58% to 55%. After she returned, maintenance was biased high by about 280 kcal for two weeks (H4). p26, who logged half her days, got ranges that narrowed normally; the final estimate was accurate (+33), but "On track" showed even while regaining. |
| **#12–15 guardrails, neutral wording** | **Wording:** neutral and non-judgemental in all four ("Calorie targets are for adults. Please talk to a doctor or parent."; "Your BMI is below 18.5, so weight-loss targets are turned off…"; "Pregnant or breastfeeding: deficit targets are turned off…"; "above the suggested 0.25–1% range…"). p15 still found the day-1 refusals preachy. **Behaviour:** incorrect in 3 of 4 (C1, C2, H6), partly correct for p15 (H10). |
| **#16 typos** | 9.6 kg typo: caught on save ("That value looks out of range"), nothing saved. 950 kcal whole-day typo: **not caught**; it skewed the week-4 update by about 30 kcal until fixed on day 29. Duplicate lunch: **not caught**; found by the persona from the day total. Both fixes recalculated immediately. |
| **#24 migration, What's new** | **Migration:** all 45 weigh-ins and 49 food days survived and matched the day-1 backup exactly; old days were auto-marked complete. **What's new:** shown once on day 1 (`p24-1790454604966.jpg`). It was **not shown again** in any of p24's 28 nightly re-opens, and never shown to a new user: 0 of the 1,708 nightly re-opens across all 21 personas showed it. The only popup the scrape saw was p07's first-run welcome on day 1, a Sunday before she had set up the app. **Tap outside:** did not dismiss it. **Profile step:** appeared after the "Make a backup" detour and caught the v1 defaults (175 cm / 25 y); the note says 1.45 but 1.375 was chosen (M16). "Make a backup" opens the data panel rather than downloading. |
| **#17 DEXA** (p17) | **Fails.** 3 DEXA scans were entered, and the breakdown says "have 0" and "Not enough data yet" all 12 weeks. DEXA fat mass isn't used in the math. The persona's own DEXA read −2.3 kg lean / −1.1 kg fat (the simulator's truth: −1.2 kg lean / −2.2 kg fat; single-scan DEXA noise explains the gap). The app never offered a verdict either way. |
| **#18 tape only** (p18) | **Works, slowly.** "Losing fat (medium confidence)" first appeared in week 6 and stayed; waist went 104.3 → 100.3 cm (truth: fat −4.1 kg). It never reached "high". Rounding problems: the breakdown shows −2.9 cm for 103.6 → 100.6, and the CSV has long decimals. The waist result sits below three empty body-fat rings. |

---

## Skipped by choice

The user asked for these five not to be started (21:56 UTC). Each would have tested:

- **p19 Majed** (endurance cyclist, about 3,700 kcal, maintain): accuracy at a very high TDEE, and following `plan` advice exactly with no human noise.
- **p20 Laila** (56, postmenopausal, inactive): a mid-run goal switch from maintain to slow loss, low-TDEE floor behaviour, and plain-language needs for a jargon-averse user.
- **p22 Aisha** (reverse diet from 1,600 kcal): whether the app guides calories up safely, and how it treats glycogen/water regain as intake rises.
- **p23 Hassan** (night-shift nurse): meals from 17:00 to 05:00 that belong to the previous "day", and weigh-ins at random times of day; the day-boundary and weigh-time noise problem in its hardest form.
- **p25 Rami** (5–6 entries a day, edits and deletes, some without macros): food-log workflow friction, and whether edits and deletes recompute correctly.

---

## Run facts

| Persona | Seed | Agent start → finish (UTC) | Plan changes | Notes |
|---|---|---|---|---|
| p01 | 20261105 | 20:29 → 20:48 | 2 | |
| p02 | 20261206 | 20:29 → 21:18 | 12 | |
| p03 | 20261307 | 20:29 → 21:16 | 12 | |
| p04 | 20261408 | 21:11 → 21:51 | 8 | |
| p05 | 20261509 | 20:29 → 21:29 | 10 | |
| p06 | 20261610 | 20:29 → 21:24 | 10 | Day 9 missed: the persona's own script moved to the next day after a failed step |
| p07 | 20261711 | 21:13 → 21:45 | 2 | |
| p08 | 20261812 | 21:16 → 21:57 | 10 | |
| p09 | 20261913 | 20:29 → 21:18 | 7 | |
| p10 | 20262014 | 21:18 → 22:05 | 8 | |
| p11 | 20262115 | 20:29 → 21:10 | 5 | Starts 2027-01-11 so that Ramadan falls in the run |
| p12 | 20262216 | 21:19 → 22:01 | 3 | The simulator's 500 kcal plan floor turned an intended 450 into 520 (week 7) |
| p13 | 20262317 | 21:24 → 22:08 | 5 | |
| p14 | 20262418 | 21:29 → 22:08 | 2 | |
| p15 | 20262519 | 21:52 → 22:31 | 5 | |
| p16 | 20262620 | 20:29 → 21:13 | 5 | Day 15 missed: the persona's own script moved to the next day after a failed step |
| p17 | 20262721 | 21:53 → 22:35 | 7 | |
| p18 | 20262822 | 22:01 → 22:41 | 6 | |
| p19 | 20262923 | — | — | skipped by choice |
| p20 | 20263024 | — | — | skipped by choice |
| p21 | 20263125 | 21:57 → 22:38 | 6 | |
| p22 | 20263226 | — | — | skipped by choice |
| p23 | 20263327 | — | — | skipped by choice |
| p24 | 20263428 | 20:29 → 20:48 | 3 | 4-week run on top of 60 days of v1 history |
| p25 | 20263529 | — | — | skipped by choice |
| p26 | 20263630 | 20:29 → 20:57 | 12 | |

- **Seeds:** `20261004 + 101 × (persona index)`. Each persona uses one seed, split into independent streams by `hash(seed:tag)`.
- **Failed personas:** none.
- **Restarts:** none. The watchdog (a stuck persona is one with no action for 20 min) never fired.
- **Smoke test before the run** (p06, in a separate `run2` folder):
  - The clock advanced day by day.
  - The weekly update landed on the chosen weekday (Sunday) every week.
  - The scraped maintenance, ±, label and target parsed correctly each week.
  - A hand-checked week 3 matched: true TDEE 2,923 (hand calculation 2,924) and correct target 2,437 (the analysis agreed). The app's target of 2,200 was correctly judged "not OK".
- **Test suite:** `npm test` (16 files / 205 tests in Asia/Riyadh, plus 2 files / 35 tests in America/New_York) passes. `vitest.config.js` now excludes `tests/personas/**`. I checked this by placing a throwaway `*.test.js` there and confirming `vitest list` ignored it. `.github/workflows/deploy.yml` runs only `npm ci`, `npm test` and `npm run build`. Nothing in `src/`, `index.html`, `vite.config.js` or the built `dist/` references `tests/personas`.

## Decisions made during the run

1. **Visible text only.** Personas see only a screenshot plus visible text, with no DOM, roles, storage, network or console. An early harness draft exposed an accessibility snapshot; I replaced it with word-level visible-text extraction in reading order before the run.
2. **Tap resolution.** Taps match exact accessible name → exact visible text → whole-word role name → whole-word text. The earlier substring match tapped "Close" when a persona asked for "Lose". Fixing that exposed app bug M7.
3. **Fresh run folders.** The real run used a fresh `run3` folder (with `run2` for the smoke test), because deleting the earlier attempt's output was refused by this environment's permission check.
4. **Orchestrator scrape.** It opens the app in a second tab at the end of each simulated day, before advancing, and reads only on-screen values.
5. **Final-day scrape.** The nightly scrape runs inside `nextday`, so the last day had no row. `finalscrape.mjs` reads the same values once at 23:30 on the last day for each finished persona.
6. **Parallelism.**
   - Started with 10.
   - First gate: launch only while the 1-min load average < 3.2 (80% of 4 cores).
   - Switched to a CPU-idle gate (launch at ≥ 30% idle, later ≥ 25% after a completion) because the load average stayed at 6–7 even with about 30% CPU idle.
   - Running agents were never stopped for load.
7. **Missed days.** p06 and p16 each lost one day to their own helper scripts. The missed days were kept as realistic, and the brief gained one line (scripts must stop on a failed step and check the day before `nextday`) for personas launched from p13 on.
8. **p12 plan floor.** The simulator rejects plans under 500 kcal, so p12's intended 450 became 520. This is a harness limit and does not change the finding.
9. **Accuracy scoring.**
   - Headline in logging units.
   - p14 excluded from the statistics (its truth isn't comparable).
   - Target tolerance max(150 kcal, 7%).
   - "Target correct" is n/a where the app correctly refuses (p13 adults-only) or where the correct maths is below the safety floor (p12).
10. **Guardrail verdicts** were judged by hand from the persona transcripts, the scraped messages and the screenshots.
11. **Result files.** `finalize.mjs` originally counted days 0-based and overwrote finish times when re-run. I fixed both, re-finalized all personas after the final-day scrape, and restored each persona's original finish time from its first committed result file.
12. **Screenshots.** The report screenshots are JPEG at 0.6× scale (450×974). This cut them from 13 MB to about 4 MB; the full-size PNGs stay in the git-ignored `run3/out`.
13. **Skipped personas.** p19, p20, p22, p23 and p25 were skipped at the user's request. p21 and p18 were started as slots freed up.

## Limits of this simulation

- **The personas are language-model agents.** They read more carefully than most real users, and from day 8 they ran routine days through their own scripts, still tapping and typing through the app and reviewing the screens after each batch of up to 7 days. Their confusion counts are a lower bound for skimmers.
- **Not simulated:**
  - Native date/time pickers (dates were typed as YYYY-MM-DD).
  - "Add to Home Screen" and the OS share sheet.
  - Real iOS Safari: this was Chromium at 375×812 with an iPhone user agent, touch and dark scheme.
  - Storage eviction, the "Persistent storage" prompt, and notifications.
- **Truth model limits.** Intake noise and water are modelled statistically. Pregnancy is modelled as free lean-mass gain (see p14). DEXA, BIA and tape readings have simple Gaussian noise.
- **Small samples.** One seed per persona, and about 20 personas for the percentiles.

## Housekeeping

- **Stale file:** `tests/personas/analysis.json` is from an aborted first attempt and is superseded by `results/_analysis.json`.
- **Leftover folders:** `tests/personas/out/`, `tests/personas/.truth/` (first attempt) and `tests/personas/run2/` (smoke test) are still on disk. They are git-ignored.
- **Why they're still there:** deleting them was refused by this environment's permission check, so I left them. To clean up: `git rm tests/personas/analysis.json && rm -rf tests/personas/out tests/personas/.truth tests/personas/run2`.
- **Harness files (test-only, never imported by the app):**
  - `sim.js`, `daemon.mjs`, `bt.mjs`, `analyze.mjs`, `finalize.mjs`, `finalscrape.mjs`, `registry.mjs`, `watchdog.mjs`, `AGENT_BRIEF.md`.
  - To rerun:
    1. Build and serve the app: `npm run build && npx vite preview --port 4173`.
    2. Start the daemon: `RUN_NAME=<name> node tests/personas/daemon.mjs`.
    3. Drive personas with `node tests/personas/bt.mjs <id> <command>`.
