import React, { useEffect, useRef } from "react";
import { WHATS_NEW } from "../lib/whatsNew.js";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * One-time release notes for people who used an earlier version.
 * Accessible modal: focus stays inside, Escape or the ✕ button close it.
 * Tapping outside does nothing, so the notes can't be dismissed by accident;
 * only the buttons, ✕ and Escape mark them as seen.
 * profileNext: the profile confirmation comes next (shown as the final button).
 */
export default function WhatsNew({ profileNext, onDone, onBackup, content = WHATS_NEW }) {
  const ref = useRef(null);

  useEffect(() => {
    const before = document.activeElement;
    ref.current?.focus();
    return () => {
      if (before && typeof before.focus === "function" && document.contains(before)) before.focus();
    };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onDone();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...ref.current.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !ref.current.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="welcome wn-backdrop">
      <div
        ref={ref}
        className="welcomecard wn-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wn-title"
        aria-describedby="wn-intro"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <button className="x wn-close" onClick={onDone} aria-label="Close what's new">✕</button>
        <h2 className="wtitle" id="wn-title">{content.title}</h2>
        <p className="wlead" id="wn-intro">{content.intro}</p>

        <ul className="wfeatures wn-list">
          {content.items.map((it) => (
            <li key={it.title} className="wfeat"><b>{it.title}</b><span>{it.text}</span></li>
          ))}
        </ul>

        <div className="wn-box">
          <b>{content.expectation.title}</b>
          <p>{content.expectation.text}</p>
        </div>

        <div className="wn-box">
          <b>{content.backup.title}</b>
          <p>{content.backup.text}</p>
          <button className="wbtn wn-secondary" onClick={onBackup}>{content.backup.button}</button>
        </div>

        {profileNext && <p className="wn-next">{content.profileNext.text}</p>}
        <button className="wbtn" onClick={onDone}>{profileNext ? content.profileNext.button : content.doneButton}</button>
      </div>
    </div>
  );
}
