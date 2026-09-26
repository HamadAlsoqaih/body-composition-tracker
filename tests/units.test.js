import { describe, it, expect } from "vitest";
import {
  KG_PER_LB, lbToKg, kgToLb, inToCm, cmToIn, weightToDisplay, weightFromDisplay,
  lengthToDisplay, lengthFromDisplay, parseNum, fmt, signed, roundTo, fmtInt, fmtPlusMinus,
  fmtWeight, fmtLength,
} from "../src/lib/units.js";

describe("units", () => {
  it("1 lb = 0.45359237 kg exactly", () => {
    expect(KG_PER_LB).toBe(0.45359237);
    expect(lbToKg(1)).toBe(0.45359237);
    expect(lbToKg(200)).toBeCloseTo(90.718474, 9);
    expect(kgToLb(0.45359237)).toBeCloseTo(1, 12);
    expect(kgToLb(lbToKg(183.4))).toBeCloseTo(183.4, 10);
  });
  it("1 in = 2.54 cm exactly", () => {
    expect(inToCm(1)).toBe(2.54);
    expect(inToCm(70)).toBeCloseTo(177.8, 10);
    expect(cmToIn(2.54)).toBeCloseTo(1, 12);
  });
  it("display conversions", () => {
    expect(weightToDisplay(100, "kg")).toBe(100);
    expect(weightToDisplay(100, "lb")).toBeCloseTo(220.462262, 5);
    expect(weightFromDisplay("220.462262185", "lb")).toBeCloseTo(100, 6);
    expect(weightFromDisplay("", "lb")).toBeNull();
    expect(weightToDisplay(null)).toBeNull();
    expect(lengthToDisplay(254, "in")).toBeCloseTo(100, 10);
    expect(lengthFromDisplay("10", "in")).toBeCloseTo(25.4, 10);
    expect(lengthFromDisplay("abc", "cm")).toBeNull();
  });
  it("parsing and formatting", () => {
    expect(parseNum("")).toBeNull();
    expect(parseNum("0")).toBe(0);
    expect(parseNum("x")).toBeNull();
    expect(fmt(1.0)).toBe("1");
    expect(fmt(1.25, 2)).toBe("1.25");
    expect(fmt(null)).toBe("—");
    expect(signed(-1.23, "kg")).toBe("−1.2 kg");
    expect(signed(0.3, "%")).toBe("+0.3%");
    expect(roundTo(176, 10)).toBe(180);
    expect(fmtInt(2950.4)).toBe("2,950");
    expect(fmtPlusMinus(2947, 176)).toBe("2,950 ± 180");
    expect(fmtWeight(100, "lb", 0)).toBe("220 lb");
    expect(fmtLength(null)).toBe("—");
  });
});
