import type { Schedule } from "./types";

export const minuteOf = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const clockAt = (minute: number) => {
  const normalized = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
};

export function shiftMinutes(schedule: Schedule): number {
  return (
    minuteOf(schedule.shiftEnd) +
    schedule.endDayOffset * 1440 -
    minuteOf(schedule.shiftStart)
  );
}

export function changeShift(
  schedule: Schedule,
  field: "shiftStart" | "shiftEnd",
  value: string,
): Schedule {
  const next = { ...schedule, [field]: value };
  next.endDayOffset =
    minuteOf(next.shiftEnd) < minuteOf(next.shiftStart) ? 1 : 0;
  const length = shiftMinutes(next);
  if (length > 0 && next.breaks.length === 1) {
    const pause = next.breaks[0];
    const oldClock = minuteOf(schedule.shiftStart) + pause.startOffsetMinutes;
    const offset = (oldClock - minuteOf(next.shiftStart) + 1440) % 1440;
    next.breaks =
      offset + pause.durationMinutes <= length
        ? [{ ...pause, startOffsetMinutes: offset }]
        : [{ ...suggestedBreak(next), paid: pause.paid }];
  }
  return next;
}

export function suggestedBreak(schedule: Schedule): Schedule["breaks"][number] {
  const length = Math.max(0, shiftMinutes(schedule));
  const duration = Math.min(60, Math.floor(length / 4));
  const noonOffset = (720 - minuteOf(schedule.shiftStart) + 1440) % 1440;
  const offset =
    noonOffset > 0 && noonOffset + duration < length
      ? noonOffset
      : Math.max(0, Math.floor((length - duration) / 2));
  return {
    startOffsetMinutes: offset,
    durationMinutes: Math.max(1, duration),
    paid: false,
  };
}

export function previewDependency(salary: unknown, schedule: unknown): string {
  return JSON.stringify({ salary, schedule });
}
