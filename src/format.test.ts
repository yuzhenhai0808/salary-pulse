import { describe, expect, it } from "vitest";
import { amount, duration, parseAmount } from "./format";
describe("display formatting", () => {
  it("does not convert decimal strings through floating point", () =>
    expect(amount("1000000000.1234")).toBe("1,000,000,000.1234"));
  it("hides amounts", () => expect(amount(null)).toBe("••••"));
  it("supports durations longer than a day", () =>
    expect(duration(90000)).toBe("25:00:00"));
  it("never displays negative time", () =>
    expect(duration(-10)).toBe("00:00:00"));
  it("validates grouped amounts", () =>
    expect(parseAmount("1,234.56")).toBe("1234.56"));
  it("rejects ambiguous decimal formats", () =>
    expect(() => parseAmount("1.234,56")).toThrow());
});
