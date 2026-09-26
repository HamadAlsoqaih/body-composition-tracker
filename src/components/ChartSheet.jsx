import React, { useMemo, useState } from "react";
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Sheet, RangeBar, RANGES } from "./ui.jsx";
import { monthsBefore } from "../lib/dates.js";
import { weightToDisplay, lengthToDisplay, fmt } from "../lib/units.js";
import { metricSeries } from "../lib/progress.js";

const tip = { background: "#141922", border: "1px solid #26303f", borderRadius: 12, color: "#fff" };

/**
 * Trend chart for one metric. Weight shows daily weigh-ins, the EMA trend
 * line and ignored weigh-ins greyed out (with an option to un-ignore).
 */
export default function ChartSheet({ metric, entries, model, units, today, includeDates, onToggleInclude, onClose }) {
  const [range, setRange] = useState("all");
  const cutoff = useMemo(() => {
    const months = RANGES.find((r) => r.key === range)?.months;
    return months ? monthsBefore(today, months) : null;
  }, [range, today]);
  const isWeight = metric.key === "weight";
  const conv = (v) => (v == null ? null : metric.kind === "mass" ? weightToDisplay(v, units.weight) : metric.kind === "length" ? lengthToDisplay(v, units.length) : v);
  const unit = metric.kind === "mass" ? units.weight : metric.kind === "length" ? units.length : metric.unit;

  const data = useMemo(() => {
    if (isWeight) {
      const trend = new Map(model.trend.map((t) => [t.date, t.trend]));
      return model.cleaning.points
        .filter((p) => !cutoff || p.date >= cutoff)
        .map((p) => ({ date: p.date, value: p.outlier ? null : conv(p.weight), ignored: p.outlier ? conv(p.weight) : null, trend: conv(trend.get(p.date)) }));
    }
    return metricSeries(entries, metric.key).filter((p) => !cutoff || p.date >= cutoff).map((p) => ({ date: p.date, value: conv(p.value) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, model, cutoff, metric.key, units]);

  const flagged = isWeight ? model.cleaning.points.filter((p) => p.flagged) : [];

  return (
    <Sheet title={`${metric.label} trend`} onClose={onClose}>
      <RangeBar value={range} onChange={setRange} />
      {data.length === 0 ? (
        <p className="subtle">No data in this range.</p>
      ) : (
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#1c2230" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "var(--dim)", fontSize: 11 }} tickFormatter={(d) => d.slice(5)} minTickGap={20} />
              <YAxis tick={{ fill: "var(--dim)", fontSize: 11 }} domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, 1)} />
              <Tooltip contentStyle={tip} formatter={(v, name) => [`${fmt(v, 1)} ${unit}`, name]} />
              <Line type="monotone" dataKey="value" name={metric.label} stroke={isWeight ? "#3a5f80" : "#5aa9e6"} strokeWidth={isWeight ? 1 : 2.5} dot={{ r: 2.5, fill: "#5aa9e6" }} connectNulls isAnimationActive={false} />
              {isWeight && <Line type="monotone" dataKey="trend" name="trend" stroke="#5aa9e6" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />}
              {isWeight && <Line dataKey="ignored" name="ignored" stroke="none" dot={{ r: 3.5, fill: "var(--faint)" }} isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {isWeight && (
        <>
          <p className="subtle" style={{ marginTop: 8 }}>Thick line: trend (exponential moving average, 10% per day). Grey dots: ignored — likely entry error or unusual water swing.</p>
          {flagged.length > 0 && (
            <div className="ignoredlist">
              <div className="detlabel">Flagged weigh-ins</div>
              {flagged.map((p) => (
                <div key={p.date} className="entryrow">
                  <div className="grow">
                    {p.date}: {fmt(conv(p.weight), 1)} {unit}
                    <div className="lbl">{fmt(Math.abs(conv(p.dev) - conv(0)), 1)} {unit} from the 7-day median</div>
                  </div>
                  <button className="btnsm" onClick={() => onToggleInclude(p.date)}>{includeDates.includes(p.date) ? "Ignore again" : "Use it"}</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
