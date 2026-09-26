import React from "react";

const KEYS = ["bt_entries", "bt_food", "bt_days", "bt_settings", "bt_goals", "bt_meta"];

/** Last-resort screen: never lose data because of a rendering bug. */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  downloadRaw = () => {
    const dump = {};
    for (const k of KEYS) {
      try {
        dump[k] = localStorage.getItem(k);
      } catch {
        dump[k] = null;
      }
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bodytracker-raw-data.json";
    a.click();
  };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, color: "#e8ecf2", fontFamily: "system-ui, sans-serif", maxWidth: 520, margin: "0 auto" }}>
        <h2>Something went wrong</h2>
        <p style={{ color: "#8a94a2", lineHeight: 1.5 }}>Your data is still saved on this device. You can download a raw copy before reloading.</p>
        <p style={{ color: "#6b7480", fontSize: 12 }}>{String(this.state.error?.message || this.state.error)}</p>
        <button onClick={this.downloadRaw} style={{ padding: "12px 16px", borderRadius: 12, border: 0, background: "#5aa9e6", color: "#06121e", marginRight: 8 }}>Download raw data</button>
        <button onClick={() => location.reload()} style={{ padding: "12px 16px", borderRadius: 12, border: 0, background: "#26303f", color: "#fff" }}>Reload</button>
      </div>
    );
  }
}
