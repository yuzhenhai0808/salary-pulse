export interface Salary {
  mode: "monthly" | "hourly";
  amount: string;
  currency: "CNY" | "USD";
  divisorDays: string;
  standardPaidMinutes: number;
  calculationBasis: "calendar" | "fixed";
}
export interface SalaryPreview {
  month: string;
  workingDays: number;
  paidMinutesPerShift: number;
  monthlyPaidSeconds: number;
  monthlyAmount: string;
  dailyAmount: string;
  hourlyAmount: string;
  secondlyAmount: string;
  calculationBasis: string;
}
export interface Pause {
  startOffsetMinutes: number;
  durationMinutes: number;
  paid: boolean;
}
export interface Schedule {
  timezone: string;
  workWeekdays: number[];
  shiftStart: string;
  shiftEnd: string;
  endDayOffset: number;
  breaks: Pause[];
  exceptions: Array<{ date: string; working: boolean }>;
}
export interface Preferences {
  language: string;
  nickname: string;
  theme: string;
  hideSalary: boolean;
  reducedMotion: boolean;
  floatingVisible: boolean;
  clockOutEnabled: boolean;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  decimalPlaces: number;
  floatingPosition: [number, number] | null;
}
export interface Rules {
  id: string;
  effectiveFromUtc: string;
  salary: Salary;
  schedule: Schedule;
}
export interface Config {
  schemaVersion: number;
  revision: number;
  trackingStartedAtUtc: string | null;
  preferences: Preferences;
  rules: Rules[];
}
export interface SettingsView {
  config: Config;
  recoveryRequired: boolean;
  effectiveLocale: string;
}
export interface LocaleView {
  preference: string;
  effectiveLocale: string;
  revision: number;
  localeSequence: number;
}
export interface Snapshot {
  sequence: number;
  generatedAtUtc: string;
  localDate: string;
  timezone: string;
  status: string;
  currency: string;
  estimatedTodayAmount: string | null;
  estimatedShiftAmount: string | null;
  paidSeconds: number;
  secondsUntilClockOut: number | null;
  secondsUntilNextShift: number | null;
  shiftProgress: number;
  shiftId: string | null;
  shiftEndUtc: string | null;
  salaryHidden: boolean;
  decimalPlaces: number;
  nickname: string;
  reducedMotion: boolean;
  theme: string;
  warnings: string[];
}
export interface SettingsPayload {
  expectedRevision: number;
  salary: Salary;
  schedule: Schedule;
  preferences: Preferences;
  startFromShift: boolean;
}
