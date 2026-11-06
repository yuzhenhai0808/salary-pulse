import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Config,
  LocaleView,
  SettingsPayload,
  SettingsView,
  Snapshot,
  Salary,
  Schedule,
  SalaryPreview,
} from "./types";
import { systemLocale } from "./i18n";
import Decimal from "decimal.js";
import { shiftMinutes } from "./automation";

export const desktop = isTauri();
const defaultPreferences = {
  language: "system",
  nickname: "",
  theme: "system",
  hideSalary: false,
  reducedMotion: false,
  floatingVisible: false,
  clockOutEnabled: false,
  quietEnabled: false,
  quietStart: "22:00",
  quietEnd: "07:00",
  decimalPlaces: 2,
  floatingPosition: null,
};
export const defaultSalary = {
  mode: "monthly" as const,
  amount: "",
  currency: "CNY" as const,
  divisorDays: "21.75",
  standardPaidMinutes: 480,
  calculationBasis: "calendar" as const,
};
export const defaultSchedule = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
  workWeekdays: [1, 2, 3, 4, 5],
  shiftStart: "09:00",
  shiftEnd: "18:00",
  endDayOffset: 0,
  breaks: [{ startOffsetMinutes: 180, durationMinutes: 60, paid: false }],
  exceptions: [],
};
const events = new EventTarget();
let seq = 0;
let localeSeq = 1;
let config: Config = (() => {
  try {
    const saved = localStorage.getItem("salary-pulse-demo");
    if (saved) {
      const parsed: Config = JSON.parse(saved);
      parsed.rules.forEach((rule) => {
        rule.salary.calculationBasis ||= "fixed";
      });
      return parsed;
    }
  } catch {
    /* Demo storage can be unavailable. */
  }
  return {
    schemaVersion: 1,
    revision: 0,
    trackingStartedAtUtc: null,
    preferences: defaultPreferences,
    rules: [],
  };
})();
const locale = () =>
  config.preferences.language === "system"
    ? systemLocale()
    : config.preferences.language;
const persist = () => {
  localStorage.setItem("salary-pulse-demo", JSON.stringify(config));
  events.dispatchEvent(new CustomEvent("settings_changed"));
};
export async function command<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (desktop) return invoke<T>(name, args);
  let result: unknown;
  if (name === "get_settings")
    result = {
      config,
      recoveryRequired: false,
      effectiveLocale: locale(),
    } satisfies SettingsView;
  else if (name === "get_locale")
    result = {
      preference: config.preferences.language,
      effectiveLocale: locale(),
      revision: config.revision,
      localeSequence: localeSeq,
    } satisfies LocaleView;
  else if (name === "get_snapshot") result = demoSnapshot();
  else if (name === "preview_salary") {
    const input = args.input as { salary: Salary; schedule: Schedule };
    result = demoPreview(input.salary, input.schedule);
  } else if (name === "save_settings") {
    const payload = args.payload as SettingsPayload;
    if (payload.expectedRevision !== config.revision)
      throw Error("REVISION_CONFLICT");
    config = {
      ...config,
      preferences: payload.preferences,
      revision: config.revision + 1,
      trackingStartedAtUtc:
        config.trackingStartedAtUtc || new Date().toISOString(),
      rules: [
        {
          id: "demo",
          effectiveFromUtc: new Date().toISOString(),
          salary: payload.salary,
          schedule: payload.schedule,
        },
      ],
    };
    persist();
    result = { config, recoveryRequired: false, effectiveLocale: locale() };
  } else if (name === "set_language") {
    config.preferences.language = String(args.language);
    config.revision++;
    localeSeq++;
    persist();
    result = {
      preference: config.preferences.language,
      effectiveLocale: locale(),
      revision: config.revision,
      localeSequence: localeSeq,
    };
  } else if (name === "set_privacy") {
    config.preferences.hideSalary = Boolean(args.hidden);
    config.revision++;
    persist();
    result = { config, recoveryRequired: false, effectiveLocale: locale() };
  } else if (name === "set_floating") {
    config.preferences.floatingVisible = Boolean(args.visible);
    persist();
  } else if (name === "get_autostart") result = false;
  else if (name === "reset_data") {
    config = {
      schemaVersion: 1,
      revision: 0,
      trackingStartedAtUtc: null,
      preferences: { ...defaultPreferences },
      rules: [],
    };
    persist();
    result = { config, recoveryRequired: false, effectiveLocale: locale() };
  } else throw Error("DESKTOP_ONLY");
  return result as T;
}

// Editable form preview only. Desktop previews and the earnings counter use Rust.
function demoPreview(salary: Salary, schedule: Schedule): SalaryPreview {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timezone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(dateParts.find((p) => p.type === "year")?.value);
  const month = Number(dateParts.find((p) => p.type === "month")?.value);
  const minutes =
    shiftMinutes(schedule) -
    schedule.breaks
      .filter((b) => !b.paid)
      .reduce((sum, b) => sum + b.durationMinutes, 0);
  if (minutes <= 0 || !schedule.workWeekdays.length)
    throw Error("NO_PAID_TIME");
  for (const pause of schedule.breaks) {
    if (
      pause.startOffsetMinutes < 0 ||
      pause.durationMinutes <= 0 ||
      pause.startOffsetMinutes + pause.durationMinutes > shiftMinutes(schedule)
    )
      throw Error("INVALID_BREAK");
  }
  let days = 0;
  for (
    let day = 1;
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
    day++
  ) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
    const exception = schedule.exceptions.find((e) => e.date === date);
    if (exception ? exception.working : schedule.workWeekdays.includes(weekday))
      days++;
  }
  const seconds = days * minutes * 60;
  if (!seconds) throw Error("NO_PAID_TIME");
  const amount = new Decimal(salary.amount);
  if (!amount.isFinite() || amount.lte(0)) throw Error("INVALID_SALARY");
  const perSecond =
    salary.mode === "hourly"
      ? amount.div(3600)
      : salary.calculationBasis === "calendar"
        ? amount.div(seconds)
        : amount.div(
            new Decimal(salary.divisorDays)
              .mul(salary.standardPaidMinutes)
              .mul(60),
          );
  return {
    month: `${year}-${String(month).padStart(2, "0")}`,
    workingDays: days,
    paidMinutesPerShift: minutes,
    monthlyPaidSeconds: seconds,
    monthlyAmount: perSecond.mul(seconds).toFixed(2),
    dailyAmount: perSecond.mul(minutes * 60).toFixed(2),
    hourlyAmount: perSecond.mul(3600).toFixed(2),
    secondlyAmount: perSecond.toFixed(8),
    calculationBasis: salary.calculationBasis,
  };
}
export async function subscribe<T>(
  name: string,
  fn: (data: T) => void,
): Promise<() => void> {
  if (desktop) return listen<T>(name, (event) => fn(event.payload));
  const handler = (event: Event) => fn((event as CustomEvent<T>).detail);
  events.addEventListener(name, handler);
  return () => events.removeEventListener(name, handler);
}
function demoSnapshot(): Snapshot {
  const rules = config.rules[0];
  // Browser mode intentionally uses fixed illustrative values, never a second salary engine.
  return {
    sequence: ++seq,
    generatedAtUtc: new Date().toISOString(),
    localDate: "2026-11-06",
    timezone: rules?.schedule.timezone || defaultSchedule.timezone,
    status: rules ? "WORKING" : "UNCONFIGURED",
    currency: rules?.salary.currency || "CNY",
    estimatedTodayAmount: config.preferences.hideSalary ? null : "126.38",
    estimatedShiftAmount: config.preferences.hideSalary ? null : "126.38",
    paidSeconds: 7920,
    secondsUntilClockOut: 8034,
    secondsUntilNextShift: null,
    shiftProgress: 0.58,
    shiftId: "demo-shift",
    shiftEndUtc: null,
    salaryHidden: config.preferences.hideSalary,
    decimalPlaces: config.preferences.decimalPlaces,
    nickname: config.preferences.nickname,
    reducedMotion: config.preferences.reducedMotion,
    theme: config.preferences.theme,
    warnings: [],
  };
}
