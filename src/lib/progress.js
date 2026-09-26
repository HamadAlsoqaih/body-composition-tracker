// Ring / delta helpers for the progress cards (display math only).

/** Per-metric series: each metric uses its own latest value, not the latest entry. */
export function metricSeries(entries, key, cleanWeights = null) {
  if (key === "weight" && cleanWeights) return cleanWeights.map((p) => ({ date: p.date, value: p.weight }));
  return entries
    .filter((e) => Number.isFinite(e[key]))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || "").localeCompare(String(b.time || "")))
    .map((e) => ({ date: e.date, value: e[key] }));
}

/** Latest value and the comparison base ("first" entry or the previous one). */
export function deltaInfo(series, mode = "first") {
  if (!series.length) return { latest: null, base: null, delta: null };
  const latest = series[series.length - 1];
  const base = mode === "first" ? series[0] : series[series.length - 2];
  if (!base || base === latest) return { latest, base: null, delta: null };
  return { latest, base, delta: latest.value - base.value, pct: base.value ? (latest.value - base.value) / base.value : 0 };
}

/** Progress 0…1+ from the first value toward a goal (can exceed 1 when overshooting). */
export function goalProgress(start, now, target) {
  if (![start, now, target].every(Number.isFinite)) return 0;
  if (start === target) return now === target ? 1 : 0;
  return (start - now) / (start - target);
}
