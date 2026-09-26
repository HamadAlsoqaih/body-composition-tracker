import React from "react";

export function Sheet({ title, onClose, children, wide = false }) {
  return (
    <div className="sheet" onClick={onClose}>
      <div className={`sheetinner${wide ? " wide" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheettop">
          <h2>{title}</h2>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, unit, required, hint, children }) {
  return (
    <label className="fld">
      <span>
        {label} {required && <em>*</em>} {unit && <small>{unit}</small>}
      </span>
      {children}
      {hint && <span className="fldhint">{hint}</span>}
    </label>
  );
}

export function NumInput({ value, onChange, step = "any", placeholder, ...rest }) {
  return (
    <input type="number" inputMode="decimal" step={step} placeholder={placeholder} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />
  );
}

export function Seg({ options, value, onChange, disabled = [] }) {
  return (
    <div className="segrow">
      {options.map((o) => {
        const key = typeof o === "string" ? o : o.key;
        const label = typeof o === "string" ? o : o.label;
        const off = disabled.includes(key);
        return (
          <button key={String(key)} type="button" disabled={off} className={value === key ? "seg on" : "seg"} onClick={() => !off && onChange(key)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Ring({ pct, color, size = 128, stroke = 9, children }) {
  const clamped = Math.max(0, Math.min(1, Math.abs(pct || 0)));
  const deg = clamped * 360;
  return (
    <div className="ringwrap" style={{ width: size, height: size }}>
      <div className="ringtrack" style={{ width: size, height: size, background: `conic-gradient(${color} ${deg}deg, #1c2230 ${deg}deg 360deg)` }}>
        <div className="ringhole" style={{ width: size - stroke * 2, height: size - stroke * 2 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Insight({ tone = "info", children }) {
  return (
    <div className={`insight ${tone}`}>
      <span className="idot" />
      <span>{children}</span>
    </div>
  );
}

export function download(filename, text, type = "application/json") {
  try {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

export const RANGES = [
  { key: "1m", label: "1M", months: 1 },
  { key: "3m", label: "3M", months: 3 },
  { key: "6m", label: "6M", months: 6 },
  { key: "1y", label: "1Y", months: 12 },
  { key: "all", label: "All", months: null },
];

export function RangeBar({ value, onChange }) {
  return (
    <div className="rangebar">
      {RANGES.map((r) => (
        <button key={r.key} className={value === r.key ? "on" : ""} onClick={() => onChange(r.key)}>{r.label}</button>
      ))}
    </div>
  );
}
