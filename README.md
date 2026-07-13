# BodyTracker

A private, mobile-first web app for tracking weight, body composition, and nutrition. All data is stored locally on your device (`localStorage`) — no account, no server, nothing leaves your phone.

## Features

- **Body composition** — log weight (required), body fat %, fat mass, muscle mass, plus ten tape measurements. Fat mass auto-fills from weight × body fat % when left blank.
- **Progress rings** — see change from your first entry or your last, with goal-progress rings for weight and body fat.
- **Trends** — tap any ring for a line chart with 1M / 3M / 6M / 1Y / All ranges.
- **Composition analysis** — once you have two entries, the app classifies whether you're losing fat, gaining muscle, recomping, or losing muscle, cross-checking your smart-scale numbers against your tape measurements and reporting a confidence level.
- **Nutrition** — log daily calories and protein. The app infers your real maintenance from your weight trend (far more accurate than a formula), compares it to your goal, and tells you whether to eat more or less, with a full "explain the math" breakdown.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL on your phone (same Wi-Fi) or desktop.

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow that builds and deploys automatically.

1. Push this project to a GitHub repository, on the `main` branch.
2. In the repo, go to **Settings → Pages**, and under **Build and deployment → Source**, choose **GitHub Actions**.
3. Every push to `main` builds and publishes the site. The URL appears in the Actions run and under Settings → Pages.

`vite.config.js` uses `base: "./"`, so it works under any repo name without further changes.

### Manual deploy (alternative)

```bash
npm run build      # outputs to dist/
npm run deploy     # publishes dist/ via gh-pages branch
```

## Notes on accuracy

Body-fat and muscle numbers from a BIA smart scale are noisy — hydration alone can move them 1–2%. The app treats them as directional, cross-references your waist and tape data, and flags low confidence when signals disagree. It does not predict fat-vs-muscle changes from calories, because that isn't something the data can honestly support.
