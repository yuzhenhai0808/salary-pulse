import { describe, expect, it } from "vitest";
import {
  changeShift,
  clockAt,
  shiftMinutes,
  suggestedBreak,
} from "./automation";
import type { Schedule } from "./types";
const schedule: Schedule = {
  timezone: "Asia/Shanghai",
  workWeekdays: [1, 2, 3, 4, 5],
  shiftStart: "09:00",
  shiftEnd: "18:00",
  endDayOffset: 0,
  breaks: [],
  exceptions: [],
};
describe("linked schedule fields", () => {
  it("keeps lunch at the same clock time when start changes", () => {
    const next = changeShift(
      {
        ...schedule,
        breaks: [{ startOffsetMinutes: 180, durationMinutes: 60, paid: false }],
      },
      "shiftStart",
      "10:00",
    );
    expect(next.breaks[0].startOffsetMinutes).toBe(120);
  });
  it("detects overnight finish", () =>
    expect(
      changeShift({ ...schedule, shiftStart: "22:00" }, "shiftEnd", "06:00")
        .endDayOffset,
    ).toBe(1));
  it("returns to same-day when finish is later", () =>
    expect(
      changeShift({ ...schedule, endDayOffset: 1 }, "shiftEnd", "17:00")
        .endDayOffset,
    ).toBe(0));
  it("computes shift and wrapped clocks", () => {
    expect(shiftMinutes(schedule)).toBe(540);
    expect(clockAt(1500)).toBe("01:00");
  });
  it("suggests lunch inside a day shift", () =>
    expect(suggestedBreak(schedule)).toEqual({
      startOffsetMinutes: 180,
      durationMinutes: 60,
      paid: false,
    }));
  it("suggests an in-range rest for short and night shifts", () => {
    for (const s of [
      { ...schedule, shiftEnd: "10:00" },
      { ...schedule, shiftStart: "22:00", shiftEnd: "06:00", endDayOffset: 1 },
    ]) {
      const pause = suggestedBreak(s);
      expect(
        pause.startOffsetMinutes + pause.durationMinutes,
      ).toBeLessThanOrEqual(shiftMinutes(s));
    }
  });
});
