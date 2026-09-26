// Unit conversion and number formatting. Data is always stored in
// kg, cm, kcal and grams; these helpers convert only for display/input.

export const KG_PER_LB = 0.45359237; // exact, international avoirdupois pound
export const CM_PER_IN = 2.54; // exact

export const lbToKg = (lb) => lb * KG_PER_LB;
export const kgToLb = (kg) => kg / KG_PER_LB;
export const inToCm = (inch) => inch * CM_PER_IN;
export const cmToIn = (cm) => cm / CM_PER_IN;

export const DEFAULT_UNITS = { weight: "kg", length: "cm" };

/** kg → display unit value. */
export function weightToDisplay(kg, unit = "kg") {
  if (kg == null || !Number.isFinite(kg)) return null;
  return unit === "lb" ? kgToLb(kg) : kg;
}
/** display unit value → kg. */
export function weightFromDisplay(v, unit = "kg") {
  if (v == null || v === "" || !Number.isFinite(Number(v))) return null;
  return unit === "lb" ? lbToKg(Number(v)) : Number(v);
}
export function lengthToDisplay(cm, unit = "cm") {
  if (cm == null || !Number.isFinite(cm)) return null;
  return unit === "in" ? cmToIn(cm) : cm;
}
export function lengthFromDisplay(v, unit = "cm") {
  if (v == null || v === "" || !Number.isFinite(Number(v))) return null;
  return unit === "in" ? inToCm(Number(v)) : Number(v);
}

/** Parse a form input: "" / null / non-numeric → null. */
export function parseNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Fixed decimals with trailing ".0" removed; "—" for missing. */
export function fmt(n, d = 1) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(d).replace(/\.0+$/, "");
}

/** Signed change like "+0.3 kg" / "−1.2 kg". */
export function signed(n, unit, d = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${s}${fmt(Math.abs(n), d)}${unit === "%" ? "%" : unit ? " " + unit : ""}`;
}

/** Round to the nearest `step` (e.g. 10). */
export const roundTo = (n, step) => Math.round(n / step) * step;

/** Integer with thousands separators: 2950 → "2,950". */
export function fmtInt(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** "2,950 ± 180" with both parts rounded to the nearest 10. */
export function fmtPlusMinus(mean, half, step = 10) {
  if (mean == null || half == null) return "—";
  return `${fmtInt(roundTo(mean, step))} ± ${fmtInt(roundTo(half, step))}`;
}

/** Display helpers bound to a unit preference. */
export function fmtWeight(kg, unit = "kg", d = 1) {
  const v = weightToDisplay(kg, unit);
  return v == null ? "—" : `${fmt(v, d)} ${unit}`;
}
export function fmtLength(cm, unit = "cm", d = 1) {
  const v = lengthToDisplay(cm, unit);
  return v == null ? "—" : `${fmt(v, d)} ${unit}`;
}
