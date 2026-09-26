// "What's new" release notes: which users see them, and in what order with the
// profile step. The content lives in src/content/whats-new.json; to announce a
// future update, replace the content and raise its "version".
import content from "../content/whats-new.json";

export const WHATS_NEW = content;
export const WHATS_NEW_VERSION = content.version;

/** Compare dotted versions ("2.1" vs "2.0.3"): negative, 0 or positive. */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export const isVersionString = (v) => typeof v === "string" && /^\d+(\.\d+)*$/.test(v);

/** The person has logged something (weigh-in, measurement or food). */
export const hasLoggedData = (state) => (state.entries?.length || 0) > 0 || (state.food?.length || 0) > 0;

/**
 * Seen-version for a freshly loaded state: people starting with no data are
 * already on the current version, so they never get this release's notes.
 */
export function initialWhatsNewSeen(state, version = WHATS_NEW_VERSION) {
  if (isVersionString(state.meta?.whatsNewSeen)) return state.meta.whatsNewSeen;
  return hasLoggedData(state) ? null : version;
}

/** Show the notes to people with data who haven't dismissed this version yet. */
export function shouldShowWhatsNew(state, version = WHATS_NEW_VERSION) {
  if (!hasLoggedData(state)) return false;
  const seen = state.meta?.whatsNewSeen;
  return !isVersionString(seen) || compareVersions(version, seen) > 0;
}

/** Existing users still owe the one-time profile confirmation. */
export const profileStepPending = (state) => !state.settings?.profilePrompted && hasLoggedData(state);

/**
 * The single onboarding screen to show on open, in order:
 * What's new → profile confirmation (returning users) / welcome (new users).
 */
export function onboardingStep(state) {
  if (shouldShowWhatsNew(state)) return "whatsnew";
  if (!state.settings?.profilePrompted) return hasLoggedData(state) ? "profile" : "welcome";
  return null;
}
