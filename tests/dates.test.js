import { describe, it, expect } from "vitest";
import {
  localDateString, daysBetween, addDays, lastNDays, dateRange, isDateString,
  weekday, lastWeekdayOnOrBefore, monthsBefore, parseLocalDate,
} from "../src/lib/dates.js";

const TZ = process.env.TZ;

describe("time zone", () => {
  it("TZ from the npm test script took effect", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(process.env.TZ);
  });
});

describe("localDateString", () => {
  it("uses the local calendar date at 00:30 local (not UTC)", () => {
    const d = new Date(2026, 8, 26, 0, 30); // 26 Sep 2026 00:30 local
    expect(localDateString(d)).toBe("2026-09-26");
    if (TZ === "Asia/Riyadh") {
      // UTC is 21:30 on the 25th — the old toISOString() bug
      expect(d.toISOString().slice(0, 10)).toBe("2026-09-25");
    }
  });

  it("00:30 local in New York stays on the local date", () => {
    const d = new Date(2026, 0, 1, 0, 30);
    expect(localDateString(d)).toBe("2026-01-01");
  });

  it("23:59 local is still the same day", () => {
    expect(localDateString(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it.skipIf(!TZ)("runs under the TZ set by the npm test script", () => {
    expect(["Asia/Riyadh", "America/New_York"]).toContain(TZ);
  });
});

describe("daysBetween / addDays", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2026-01-31", "2026-01-01")).toBe(-30);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2); // leap year
  });

  it("is DST-safe across the US spring-forward and fall-back transitions", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-03-09", -1)).toBe("2026-03-08");
    // a full year spanning both transitions
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("addDays crosses months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("windows are exact", () => {
  it("lastNDays(7) returns exactly 7 dates ending today", () => {
    const w = lastNDays(7, "2026-09-26");
    expect(w).toHaveLength(7);
    expect(w[0]).toBe("2026-09-20");
    expect(w[6]).toBe("2026-09-26");
  });

  it("lastNDays across DST has no duplicates or gaps", () => {
    const w = lastNDays(14, "2026-11-08");
    expect(new Set(w).size).toBe(14);
    for (let i = 1; i < w.length; i++) expect(daysBetween(w[i - 1], w[i])).toBe(1);
  });

  it("the old '>= today − 7' filter would include 8 days; lastNDays(7) includes 7", () => {
    const today = "2026-09-26";
    const all = dateRange("2026-09-01", today);
    const old = all.filter((d) => d >= addDays(today, -7));
    expect(old).toHaveLength(8);
    const w = new Set(lastNDays(7, today));
    expect(all.filter((d) => w.has(d))).toHaveLength(7);
  });

  it("dateRange is inclusive", () => {
    expect(dateRange("2026-09-01", "2026-09-03")).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(dateRange("2026-09-03", "2026-09-01")).toEqual([]);
  });
});

describe("misc", () => {
  it("validates date strings", () => {
    expect(isDateString("2026-02-29")).toBe(false);
    expect(isDateString("2024-02-29")).toBe(true);
    expect(isDateString("2026-9-1")).toBe(false);
    expect(isDateString(null)).toBe(false);
  });
  it("weekday helpers", () => {
    expect(weekday("2026-09-26")).toBe(6); // Saturday
    expect(lastWeekdayOnOrBefore("2026-09-26", 1)).toBe("2026-09-21");
    expect(lastWeekdayOnOrBefore("2026-09-26", 6)).toBe("2026-09-26");
  });
  it("monthsBefore clamps month end", () => {
    expect(monthsBefore("2026-03-31", 1)).toBe("2026-02-28");
    expect(monthsBefore("2026-09-26", 12)).toBe("2025-09-26");
  });
  it("parseLocalDate is local noon", () => {
    expect(parseLocalDate("2026-03-08").getHours()).toBe(12);
    expect(() => parseLocalDate("bad")).toThrow();
  });
});
