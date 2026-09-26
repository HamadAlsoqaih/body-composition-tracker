// @vitest-environment jsdom
// "What's new": who sees it, ordering with the profile step, the backup
// button, versioning and accessibility. Renders the real app in jsdom.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App.jsx";
import {
  WHATS_NEW, WHATS_NEW_VERSION, compareVersions, shouldShowWhatsNew, onboardingStep, initialWhatsNewSeen, profileStepPending,
} from "../src/lib/whatsNew.js";
import { emptyState } from "../src/lib/storage.js";
import { hasAvoidedWording } from "../src/lib/guardrails.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OLD_DATA = {
  bt_entries: JSON.stringify([{ id: 1, date: "2026-08-01", weight: 90 }, { id: 2, date: "2026-08-08", weight: 89.4 }]),
  bt_food: JSON.stringify([{ id: 3, date: "2026-08-01", calories: 2200, protein: 150 }]),
  bt_settings: JSON.stringify({ goalDir: "lose", rateKgWk: 0.5, proteinPerKg: 1.8, activityFactor: 1.45, height: 175, age: 25, sex: "male" }),
  bt_goals: JSON.stringify({ weight: null, bodyFat: null }),
  bt_seen_welcome: "true",
};
const EMPTY_KEYS = {
  bt_entries: "[]",
  bt_food: "[]",
  bt_goals: JSON.stringify({ weight: null, bodyFat: null }),
  bt_settings: JSON.stringify({ goalDir: "lose", rateKgWk: 0.5, proteinPerKg: 1.8, activityFactor: 1.45, height: 175, age: 25, sex: "male" }),
};

let root = null, container = null;
async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(React.createElement(App)));
}
async function unmount() {
  if (!root) return;
  await act(async () => root.unmount());
  container.remove();
  root = null;
}
const seed = (kv) => Object.entries(kv).forEach(([k, v]) => localStorage.setItem(k, v));
const dialogs = () => [...document.querySelectorAll('[role="dialog"]')];
const whatsNew = () => document.querySelector('[aria-labelledby="wn-title"]');
const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const click = async (el) => act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const key = async (el, k, shiftKey = false) => act(async () => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true })));
const text = () => document.body.textContent;

beforeEach(() => localStorage.clear());
afterEach(async () => unmount());

describe("who sees What's new", () => {
  it("shows for users with saved data from an earlier version", async () => {
    seed(OLD_DATA);
    await mount();
    expect(whatsNew()).not.toBeNull();
    expect(text()).toContain(WHATS_NEW.title);
  });

  it("never shows for new users (they get the welcome instead)", async () => {
    await mount();
    expect(whatsNew()).toBeNull();
    expect(text()).toContain("Welcome to BodyTracker");
  });

  it("never shows for old installs whose keys are empty", async () => {
    seed(EMPTY_KEYS);
    await mount();
    expect(whatsNew()).toBeNull();
  });

  it("never shows twice after it's dismissed", async () => {
    seed(OLD_DATA);
    await mount();
    await click(button(WHATS_NEW.profileNext.button));
    expect(whatsNew()).toBeNull();
    expect(JSON.parse(localStorage.getItem("bt_meta")).whatsNewSeen).toBe(WHATS_NEW_VERSION);
    await unmount();
    await mount();
    expect(whatsNew()).toBeNull();
  });

  it("still shows if the app is closed before it's dismissed", async () => {
    seed(OLD_DATA);
    await mount();
    expect(whatsNew()).not.toBeNull();
    await unmount(); // closed without dismissing
    await mount();
    expect(whatsNew()).not.toBeNull();
  });
});

describe("order with the profile step", () => {
  it("What's new first, then the profile step — never both at once", async () => {
    seed(OLD_DATA);
    await mount();
    expect(dialogs()).toHaveLength(1);
    expect(text()).not.toContain("Set up your profile");
    const buttons = [...whatsNew().querySelectorAll("button")];
    expect(buttons[buttons.length - 1].textContent).toBe("Next: confirm your profile"); // ends with the next step
    await click(button("Next: confirm your profile"));
    expect(whatsNew()).toBeNull();
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].getAttribute("aria-label")).toMatch(/profile/i);
  });

  it("the backup button opens the backup screen, then the profile step follows", async () => {
    seed(OLD_DATA);
    await mount();
    await click(button(WHATS_NEW.backup.button));
    expect(whatsNew()).toBeNull();
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].getAttribute("aria-label")).toBe("Your data");
    expect(button("Full backup (JSON)")).toBeTruthy();
    await click(dialogs()[0].querySelector('button[aria-label="Close"]'));
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].getAttribute("aria-label")).toMatch(/profile/i);
  });

  it("ends with 'Done' when no profile step is pending (future update)", async () => {
    const s = emptyState();
    seed({
      bt_entries: JSON.stringify([{ id: 1, date: "2026-08-01", weight: 90 }]),
      bt_settings: JSON.stringify({ ...s.settings, heightCm: 180, age: 30, sex: "male", activity: "light", alreadyStable: true, checkinWeekday: 0, onboarded: true, profilePrompted: true }),
      bt_meta: JSON.stringify({ schemaVersion: 3, whatsNewSeen: "2.0" }), // saw an older release
    });
    await mount();
    expect(whatsNew()).not.toBeNull();
    expect(button("Done")).toBeTruthy();
    expect(button("Next: confirm your profile")).toBeUndefined();
    await click(button("Done"));
    expect(dialogs()).toHaveLength(0);
  });
});

describe("accessibility", () => {
  it("is a labelled modal dialog with a close button, focused on open", async () => {
    seed(OLD_DATA);
    await mount();
    const d = whatsNew();
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(d.getAttribute("aria-labelledby")).textContent).toBe(WHATS_NEW.title);
    expect(d.querySelector('button[aria-label="Close what\'s new"]')).toBeTruthy();
    expect(document.activeElement).toBe(d);
  });

  it("traps focus: Tab wraps from last to first, Shift+Tab from first to last", async () => {
    seed(OLD_DATA);
    await mount();
    const items = [...whatsNew().querySelectorAll("button")];
    const first = items[0], last = items[items.length - 1];
    last.focus();
    await key(last, "Tab");
    expect(document.activeElement).toBe(first);
    await key(first, "Tab", true);
    expect(document.activeElement).toBe(last);
  });

  it("the ✕ button and Escape both close it (and count as seen)", async () => {
    seed(OLD_DATA);
    await mount();
    await click(whatsNew().querySelector('button[aria-label="Close what\'s new"]'));
    expect(whatsNew()).toBeNull();
    await unmount();
    localStorage.clear();
    seed(OLD_DATA);
    await mount();
    await key(whatsNew(), "Escape");
    expect(whatsNew()).toBeNull();
    expect(JSON.parse(localStorage.getItem("bt_meta")).whatsNewSeen).toBe(WHATS_NEW_VERSION);
  });
});

describe("content (plain language)", () => {
  const all = JSON.stringify(WHATS_NEW);
  it("covers the requested topics", () => {
    for (const phrase of ["weight trend", "±", "meals", "Day complete", "water weight", "body fat", "minimum", "backup", "day by day", "time zone", "may be different", "2–4 weeks"]) {
      expect(all).toContain(phrase);
    }
  });
  it("avoids technical terms and judgmental wording", () => {
    for (const term of ["Kalman", "TDEE", "BIA", "regression", "variance", "EMA", "schema", "localStorage", "UTC"]) expect(all).not.toContain(term);
    expect(hasAvoidedWording(all)).toBe(false);
  });
});

describe("version logic", () => {
  const withData = (meta, settings = {}) => ({ ...emptyState(), entries: [{ id: 1, date: "2026-08-01", weight: 80 }], meta: { ...emptyState().meta, ...meta }, settings: { ...emptyState().settings, ...settings } });
  it("compares dotted versions", () => {
    expect(compareVersions("2.1", "2.0")).toBeGreaterThan(0);
    expect(compareVersions("2.1", "2.1.0")).toBe(0);
    expect(compareVersions("2.10", "2.9")).toBeGreaterThan(0);
  });
  it("shows when the seen version is missing or older, not when current", () => {
    expect(shouldShowWhatsNew(withData({ whatsNewSeen: null }))).toBe(true);
    expect(shouldShowWhatsNew(withData({ whatsNewSeen: "2.0" }), "2.1")).toBe(true);
    expect(shouldShowWhatsNew(withData({ whatsNewSeen: "2.1" }), "2.1")).toBe(false);
    expect(shouldShowWhatsNew({ ...emptyState(), meta: { ...emptyState().meta, whatsNewSeen: null } })).toBe(false);
  });
  it("new users start as up to date", () => {
    expect(initialWhatsNewSeen(emptyState())).toBe(WHATS_NEW_VERSION);
    expect(initialWhatsNewSeen(withData({ whatsNewSeen: null }))).toBeNull();
  });
  it("onboarding order", () => {
    expect(onboardingStep(withData({ whatsNewSeen: null }))).toBe("whatsnew");
    expect(onboardingStep(withData({ whatsNewSeen: WHATS_NEW_VERSION }))).toBe("profile");
    expect(onboardingStep(withData({ whatsNewSeen: WHATS_NEW_VERSION }, { profilePrompted: true }))).toBeNull();
    expect(onboardingStep(emptyState())).toBe("welcome");
    expect(profileStepPending(withData({}))).toBe(true);
  });
});
