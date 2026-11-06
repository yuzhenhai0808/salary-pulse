import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  FolderOpen,
  Heart,
  Info,
  LoaderCircle,
  Minus,
  Monitor,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import i18n from "./i18n";
import {
  command,
  defaultSalary,
  defaultSchedule,
  desktop,
  subscribe,
} from "./bridge";
import { amount, duration, parseAmount } from "./format";
import { changeShift, clockAt, minuteOf, suggestedBreak } from "./automation";
import { Robot } from "./Robot";
import type {
  Config,
  LocaleView,
  Preferences,
  Salary,
  Schedule,
  SettingsPayload,
  SettingsView,
  Snapshot,
  SalaryPreview,
} from "./types";

const floating =
  new URLSearchParams(location.search).get("view") === "floating";
export default function App() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState("today");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const sequence = useRef(0),
    localeSequence = useRef(0);
  const reload = async () => {
    if (!floating) {
      const view = await command<SettingsView>("get_settings");
      setSettings(view);
      await i18n.changeLanguage(view.effectiveLocale);
    }
    const locale = await command<LocaleView>("get_locale");
    if (locale.localeSequence >= localeSequence.current) {
      localeSequence.current = locale.localeSequence;
      await i18n.changeLanguage(locale.effectiveLocale);
    }
    const snap = await command<Snapshot>("get_snapshot");
    if (snap.sequence > sequence.current) {
      sequence.current = snap.sequence;
      setSnapshot(snap);
    }
  };
  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];
    const add = async <T,>(name: string, handler: (data: T) => void) => {
      const unlisten = await subscribe(name, handler);
      if (disposed) unlisten();
      else cleanups.push(unlisten);
    };
    void (async () => {
      await add<Snapshot>("snapshot_updated", (snap) => {
        if (snap.sequence > sequence.current) {
          sequence.current = snap.sequence;
          setSnapshot(snap);
        }
      });
      await add<LocaleView>("locale_changed", (locale) => {
        if (locale.localeSequence > localeSequence.current) {
          localeSequence.current = locale.localeSequence;
          void i18n.changeLanguage(locale.effectiveLocale);
        }
        if (!floating)
          void command<SettingsView>("get_settings").then(setSettings);
      });
      await add("settings_changed", () => {
        void reload().catch((e) => setError(String(e)));
      });
      await add("navigate_settings", () => setPage("settings"));
      await reload();
    })().catch((e) => setError(String(e)));
    const interval = window.setInterval(
      () => {
        if (!document.hidden)
          void command<Snapshot>("get_snapshot")
            .then((snap) => {
              if (snap.sequence > sequence.current) {
                sequence.current = snap.sequence;
                setSnapshot(snap);
              }
            })
            .catch(() => {});
      },
      desktop ? 10000 : 1000,
    );
    const onVisible = () => {
      if (!document.hidden) void reload().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);
  useEffect(() => {
    document.documentElement.dataset.theme =
      snapshot?.theme || settings?.config.preferences.theme || "system";
  }, [snapshot?.theme, settings?.config.preferences.theme]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const errorText = (code: string) =>
    t(i18n.exists(`error.${code}`) ? `error.${code}` : "error.generic");
  const act = async (name: string, args: Record<string, unknown> = {}) => {
    try {
      setError("");
      await command(name, args);
      await reload();
    } catch (e) {
      setError(String(e).replace(/^Error: /, ""));
    }
  };
  const changeLanguage = async (language: string) => {
    if (!settings) return;
    try {
      setError("");
      const locale = await command<LocaleView>("set_language", {
        language,
        expectedRevision: settings.config.revision,
      });
      await i18n.changeLanguage(locale.effectiveLocale);
      await reload();
    } catch (e) {
      setError(String(e).replace(/^Error: /, ""));
    }
  };
  if (floating)
    return (
      <div
        className="floating-surface"
        onMouseDown={(event) => {
          if (desktop && event.target === event.currentTarget)
            void getCurrentWindow().startDragging();
        }}
      >
        <div className="floating-top" data-tauri-drag-region>
          <span>{t("app.title")}</span>
          <button
            className="icon-button"
            title={t("common.close")}
            aria-label={t("common.close")}
            onClick={() => void act("set_floating", { visible: false })}
          >
            <X size={15} />
          </button>
        </div>
        <div className="floating-content">
          <div>
            <p>{t("dashboard.todayEstimate")}</p>
            <strong>{amount(snapshot?.estimatedTodayAmount ?? null)}</strong>
            <span className="floating-time">
              <Clock3 size={12} />
              {duration(snapshot?.secondsUntilClockOut ?? null)}
            </span>
          </div>
          <Robot
            resting={snapshot?.status.includes("BREAK") ?? false}
            finished={snapshot?.status === "AFTER_SHIFT"}
            cheer={false}
            reduced={snapshot?.reducedMotion ?? false}
            compact
          />
        </div>
      </div>
    );
  if (!settings || !snapshot)
    return (
      <div className="loading">
        <LoaderCircle className="spin" />
        <span>{error ? errorText(error) : "Salary Pulse"}</span>
        {error && (
          <button onClick={() => void reload()}>{t("common.retry")}</button>
        )}
      </div>
    );
  const configured = settings.config.rules.length > 0;
  const rules =
    settings.config.rules.find(
      (rule) => rule.id === snapshot.shiftId?.split(":")[0],
    ) ||
    settings.config.rules
      .filter((rule) => new Date(rule.effectiveFromUtc) <= new Date())
      .at(-1);
  const languageSelect = (
    <select
      aria-label={t("language.label")}
      className="language-select"
      value={settings.config.preferences.language}
      onChange={(e) => void changeLanguage(e.target.value)}
    >
      <option value="system">{t("language.system")}</option>
      <option value="zh-CN">简体中文</option>
      <option value="en-US">English</option>
    </select>
  );
  return (
    <div className="app-shell">
      <header className="header">
        <div className="brand">
          <div className="brand-icon">
            <Sparkles size={21} />
          </div>
          <div>
            <strong>{t("app.title")}</strong>
            <span>{t("app.subtitle")}</span>
          </div>
        </div>
        <div className="header-tools">
          {languageSelect}
          <button
            className="icon-button"
            title={t("nav.about")}
            aria-label={t("nav.about")}
            onClick={() => setPage(page === "about" ? "today" : "about")}
          >
            <Info size={19} />
          </button>
        </div>
      </header>
      {configured && !settings.recoveryRequired && (
        <nav className="nav">
          <button
            className={page === "today" ? "active" : ""}
            onClick={() => setPage("today")}
          >
            <Sun size={16} />
            {t("nav.today")}
          </button>
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => setPage("settings")}
          >
            <Settings2 size={16} />
            {t("nav.settings")}
          </button>
          <span className="local-tag">
            <ShieldCheck size={13} />
            {t("dashboard.local")}
          </span>
        </nav>
      )}
      {error && (
        <div role="alert" className="notice error">
          {errorText(error)}
          <button
            className="icon-button"
            aria-label={t("common.close")}
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div role="status" className="notice success">
          <Check size={17} />
          {t(toast)}
        </div>
      )}
      {settings.recoveryRequired ? (
        <section className="recovery">
          <ShieldCheck size={36} />
          <h1>{t("recovery.title")}</h1>
          <p>{t("recovery.body")}</p>
          <button className="primary" onClick={() => void act("recover_data")}>
            <RefreshCw size={16} />
            {t("recovery.restore")}
          </button>
          <button
            className="danger"
            onClick={() => {
              if (window.confirm(t("settings.resetConfirm")))
                void act("reset_data", {
                  confirmation: "DELETE_PERSONAL_DATA",
                });
            }}
          >
            {t("settings.reset")}
          </button>
        </section>
      ) : page === "about" ? (
        <section className="about">
          <Robot resting={false} finished cheer={false} reduced />
          <h1>{t("about.title")}</h1>
          <p>{t("about.body")}</p>
          <div className="about-meta">
            <span>{t("about.version")} 0.1.0</span>
            <span>Apache-2.0</span>
          </div>
          <p>{t("about.privacy")}</p>
          <small>{t("about.build")}</small>
          <a
            href="https://github.com/yuzhenhai0808/salary-pulse"
            target="_blank"
            rel="noreferrer"
          >
            {t("about.source")}
            <ArrowUpRight size={16} />
          </a>
        </section>
      ) : !configured || page === "settings" ? (
        <SettingsForm
          config={settings.config}
          language={i18n.language}
          first={!configured}
          onSaved={async () => {
            await reload();
            setPage("today");
            setToast("common.saved");
          }}
          onError={setError}
          onTest={() => {
            void command("test_notification")
              .then(() => setToast("settings.notificationSent"))
              .catch((e) => setError(String(e).replace(/^Error: /, "")));
          }}
          act={act}
        />
      ) : (
        <Dashboard
          snapshot={snapshot}
          rules={rules}
          onPrivacy={() =>
            void act("set_privacy", { hidden: !snapshot.salaryHidden })
          }
          onFloating={() =>
            void act("set_floating", {
              visible: !settings.config.preferences.floatingVisible,
            })
          }
          floatingVisible={settings.config.preferences.floatingVisible}
          onSettings={() => setPage("settings")}
        />
      )}
      <footer>
        <span>
          <ShieldCheck size={12} />
          {t("dashboard.estimateNote")}
        </span>
        {!desktop && (
          <span className="demo-label" title={t("demo.note")}>
            {t("demo.label")}
          </span>
        )}
      </footer>
    </div>
  );
}

function Dashboard({
  snapshot: s,
  rules,
  onPrivacy,
  onFloating,
  floatingVisible,
  onSettings,
}: {
  snapshot: Snapshot;
  rules?: Config["rules"][number];
  onPrivacy: () => void;
  onFloating: () => void;
  floatingVisible: boolean;
  onSettings: () => void;
}) {
  const { t } = useTranslation();
  const [cheer, setCheer] = useState(false),
    [message, setMessage] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handle = setInterval(
      () => setMessage((v) => (v % 5) + 1),
      15 * 60 * 1000,
    );
    return () => {
      clearInterval(handle);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const resting = s.status.includes("BREAK") || s.status === "OFF_DAY",
    finished = s.status === "AFTER_SHIFT";
  return (
    <main className="dashboard">
      <div className="greeting">
        <div>
          <p>
            {new Intl.DateTimeFormat(i18n.language, {
              month: "long",
              day: "numeric",
              weekday: "long",
              timeZone: s.timezone || undefined,
            }).format(new Date(s.generatedAtUtc))}
          </p>
          <h1>
            {t("dashboard.hello", {
              name: s.nickname || t("dashboard.defaultName"),
            })}
          </h1>
        </div>
        <span
          className={`status-chip ${resting ? "rest" : finished ? "done" : ""}`}
        >
          <i />
          {t(`status.${s.status}`)}
        </span>
      </div>
      <section className="metrics">
        <div className="earnings">
          <div className="metric-label">
            <Wallet size={16} />
            <span>{t("dashboard.todayEstimate")}</span>
            <button
              className="icon-button"
              title={t(s.salaryHidden ? "common.show" : "common.hide")}
              aria-label={t(s.salaryHidden ? "common.show" : "common.hide")}
              onClick={onPrivacy}
            >
              {s.salaryHidden ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="amount">
            <span>{s.currency === "USD" ? "$" : "¥"}</span>
            <strong>{amount(s.estimatedTodayAmount)}</strong>
            <small>{s.currency}</small>
          </div>
          <p>
            {t("dashboard.shiftEstimate")}{" "}
            <b>{amount(s.estimatedShiftAmount)}</b>
            <span>
              {" "}
              · {t("dashboard.paidTime")} {Math.floor(s.paidSeconds / 3600)}h{" "}
              {Math.floor((s.paidSeconds % 3600) / 60)}m
            </span>
          </p>
        </div>
        <div className="countdown">
          <div className="metric-label">
            <Clock3 size={16} />
            <span>
              {t(
                finished
                  ? "dashboard.done"
                  : resting && s.status === "OFF_DAY"
                    ? "dashboard.clockInIn"
                    : s.status === "BEFORE_SHIFT"
                      ? "dashboard.clockInIn"
                      : "dashboard.clockOutIn",
              )}
            </span>
          </div>
          <strong>
            {duration(
              s.status === "BEFORE_SHIFT" || s.status === "OFF_DAY"
                ? s.secondsUntilNextShift
                : s.secondsUntilClockOut,
            )}
          </strong>
          <p>
            {t("dashboard.progress")}{" "}
            <b>{Math.round(s.shiftProgress * 100)}%</b>
          </p>
          <div className="progress">
            <span style={{ width: `${s.shiftProgress * 100}%` }} />
          </div>
        </div>
      </section>
      <section className="companion">
        <div className="scene">
          <div className="scene-label">
            <span className="small-dot" /> SALARY PULSE
          </div>
          <Robot
            resting={resting}
            finished={finished}
            cheer={cheer}
            reduced={s.reducedMotion}
          />
          <div className="scene-floor" />
        </div>
        <div className="encouragement">
          <span className="eyebrow">
            <Heart size={14} />
            {t("dashboard.gentle")}
          </span>
          <h2>
            {t(
              resting
                ? "message.rest"
                : finished
                  ? "message.done"
                  : `message.${message}`,
            )}
          </h2>
          <div className="encouragement-actions">
            <button
              className="primary"
              disabled={cheer}
              onClick={() => {
                setCheer(true);
                timer.current = setTimeout(() => setCheer(false), 2500);
              }}
            >
              <Sparkles size={16} />
              {t("dashboard.cheer")}
            </button>
            <button
              className="icon-button subtle"
              title={t("dashboard.changeMessage")}
              aria-label={t("dashboard.changeMessage")}
              onClick={() => setMessage((v) => (v % 5) + 1)}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          <p>{t("dashboard.shiftNote")}</p>
        </div>
      </section>
      <section className="schedule-strip">
        <div>
          <Clock3 size={17} />
          <span>{t("dashboard.schedule")}</span>
          <b>
            {rules?.schedule.shiftStart} – {rules?.schedule.shiftEnd}
            {rules?.schedule.endDayOffset ? " +1" : ""}
          </b>
          <small>{s.timezone}</small>
        </div>
        <button className="text-button" onClick={onSettings}>
          {t("common.settings")}
          <ChevronRight size={14} />
        </button>
        <button
          className={`secondary ${floatingVisible ? "selected" : ""}`}
          onClick={onFloating}
        >
          <Monitor size={16} />
          {t("common.floating")}
        </button>
      </section>
      {s.warnings.map((warning) => (
        <p className="notice warning" key={warning}>
          {t(
            i18n.exists(`error.${warning}`)
              ? `error.${warning}`
              : "error.generic",
          )}
        </p>
      ))}
    </main>
  );
}

function SettingsForm({
  config,
  first,
  onSaved,
  onError,
  onTest,
  act,
}: {
  config: Config;
  language: string;
  first: boolean;
  onSaved: () => Promise<void>;
  onError: (code: string) => void;
  onTest: () => void;
  act: (name: string, args?: Record<string, unknown>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const rule = config.rules.at(-1);
  const [salary, setSalary] = useState<Salary>(() => ({
    ...structuredClone(rule?.salary || defaultSalary),
    calculationBasis:
      rule?.salary.calculationBasis || (rule ? "fixed" : "calendar"),
  }));
  const [schedule, setSchedule] = useState<Schedule>(() =>
    structuredClone(rule?.schedule || defaultSchedule),
  );
  const [preferences, setPreferences] = useState<Preferences>(() =>
    structuredClone(config.preferences),
  );
  const [saving, setSaving] = useState(false),
    [startFromShift, setStartFromShift] = useState(true),
    [autostart, setAutostart] = useState(false);
  const [exceptionDate, setExceptionDate] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [extraBreaksRemoved, setExtraBreaksRemoved] = useState(false);
  const [preview, setPreview] = useState<SalaryPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [advanced, setAdvanced] = useState(
    rule?.salary.calculationBasis === "fixed",
  );
  useEffect(() => {
    let active = true;
    setPreview(null);
    setPreviewError("");
    const timer = setTimeout(() => {
      if (!salary.amount.trim()) return;
      let input: { salary: Salary; schedule: Schedule };
      try {
        input = {
          salary: { ...salary, amount: parseAmount(salary.amount) },
          schedule,
        };
      } catch {
        if (active) setPreviewError("INVALID_SALARY");
        return;
      }
      void command<SalaryPreview>("preview_salary", { input })
        .then((result) => {
          if (active) setPreview(result);
        })
        .catch((error) => {
          if (active) setPreviewError(String(error).replace(/^Error: /, ""));
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [salary, schedule]);
  useEffect(() => {
    setPreferences((p) => ({
      ...p,
      language: config.preferences.language,
      hideSalary: config.preferences.hideSalary,
      floatingVisible: config.preferences.floatingVisible,
      floatingPosition: config.preferences.floatingPosition,
    }));
  }, [
    config.preferences.language,
    config.preferences.hideSalary,
    config.preferences.floatingVisible,
    config.preferences.floatingPosition,
  ]);
  useEffect(() => {
    void command<boolean>("get_autostart")
      .then(setAutostart)
      .catch(() => {});
  }, []);
  const pref = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPreferences((p) => ({ ...p, [key]: value }));
  const setPause = (value: Partial<Schedule["breaks"][number]>) =>
    setSchedule((s) => ({
      ...s,
      breaks: [
        {
          ...(s.breaks[0] || {
            startOffsetMinutes: 180,
            durationMinutes: 60,
            paid: false,
          }),
          ...value,
        },
        ...s.breaks.slice(1),
      ],
    }));
  const startMinute = minuteOf(schedule.shiftStart),
    pause = schedule.breaks[0];
  const pauseClock = () => {
    const n = (startMinute + (pause?.startOffsetMinutes || 0)) % 1440;
    return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    onError("");
    try {
      const payload: SettingsPayload = {
        expectedRevision: config.revision,
        salary: { ...salary, amount: parseAmount(salary.amount) },
        schedule,
        preferences: {
          ...preferences,
          language: config.preferences.language,
          floatingPosition: config.preferences.floatingPosition,
        },
        startFromShift,
      };
      await command("save_settings", { payload });
      await onSaved();
    } catch (e) {
      onError(String(e).replace(/^Error: /, ""));
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="settings-page">
      <div className="page-heading">
        <h1>{t(first ? "onboarding.title" : "settings.title")}</h1>
        <p>{t(first ? "onboarding.subtitle" : "settings.nextDay")}</p>
      </div>
      {rule && new Date(rule.effectiveFromUtc) > new Date() && (
        <p className="notice warning">
          {t("settings.pending", {
            date: new Intl.DateTimeFormat(i18n.language, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: rule.schedule.timezone,
            }).format(new Date(rule.effectiveFromUtc)),
          })}
        </p>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <section className="form-section">
          <h2>
            <Heart size={17} />
            {t("settings.profile")}
          </h2>
          <div className="form-grid">
            <label>
              {t("settings.nickname")}
              <input
                maxLength={40}
                placeholder={t("settings.nicknamePlaceholder")}
                value={preferences.nickname}
                onChange={(e) => pref("nickname", e.target.value)}
              />
            </label>
            <label>
              {t("settings.theme")}
              <select
                value={preferences.theme}
                onChange={(e) => pref("theme", e.target.value)}
              >
                {["system", "light", "dark"].map((v) => (
                  <option key={v} value={v}>
                    {t(`settings.${v}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <section className="form-section">
          <h2>
            <Wallet size={17} />
            {t("settings.salary")}
          </h2>
          <div className="form-grid">
            <label>
              {t("settings.mode")}
              <select
                value={salary.mode}
                onChange={(e) =>
                  setSalary((s) => ({
                    ...s,
                    mode: e.target.value as Salary["mode"],
                    amount: preview
                      ? e.target.value === "hourly"
                        ? preview.hourlyAmount
                        : preview.monthlyAmount
                      : s.amount,
                  }))
                }
              >
                <option value="monthly">{t("settings.monthly")}</option>
                <option value="hourly">{t("settings.hourly")}</option>
              </select>
            </label>
            <label>
              {t("settings.currency")}
              <select
                value={salary.currency}
                onChange={(e) =>
                  setSalary((s) => ({
                    ...s,
                    currency: e.target.value as Salary["currency"],
                  }))
                }
              >
                <option value="CNY">CNY · ¥</option>
                <option value="USD">USD · $</option>
              </select>
            </label>
            <label>
              {t("settings.amount")}
              <input
                required
                inputMode="decimal"
                value={salary.amount}
                placeholder="0.00"
                onChange={(e) =>
                  setSalary((s) => ({ ...s, amount: e.target.value }))
                }
              />
            </label>
            <label>
              {t("settings.precision")}
              <select
                value={preferences.decimalPlaces}
                onChange={(e) => pref("decimalPlaces", Number(e.target.value))}
              >
                <option value={2}>0.00</option>
                <option value={4}>0.0000</option>
              </select>
            </label>
          </div>
          <details
            className="advanced-settings"
            open={advanced}
            onToggle={(event) => setAdvanced(event.currentTarget.open)}
          >
            <summary>{t("settings.advancedCalculation")}</summary>
            <div className="form-grid">
              <label>
                {t("settings.calculationBasis")}
                <select
                  value={salary.calculationBasis}
                  onChange={(e) =>
                    setSalary((s) => ({
                      ...s,
                      calculationBasis: e.target
                        .value as Salary["calculationBasis"],
                    }))
                  }
                >
                  <option value="calendar">
                    {t("settings.calendarBasis")}
                  </option>
                  <option value="fixed">{t("settings.fixedBasis")}</option>
                </select>
              </label>
              {salary.mode === "monthly" &&
                salary.calculationBasis === "fixed" && (
                  <>
                    <label>
                      {t("settings.divisor")}
                      <input
                        required
                        type="number"
                        min="0.01"
                        max="31"
                        step="0.01"
                        value={salary.divisorDays}
                        onChange={(e) =>
                          setSalary((s) => ({
                            ...s,
                            divisorDays: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      {t("settings.hours")}
                      <input
                        required
                        type="number"
                        min="0.1"
                        max="24"
                        step="0.1"
                        value={salary.standardPaidMinutes / 60}
                        onChange={(e) =>
                          setSalary((s) => ({
                            ...s,
                            standardPaidMinutes: Math.round(
                              Number(e.target.value) * 60,
                            ),
                          }))
                        }
                      />
                    </label>
                  </>
                )}
            </div>
          </details>
          <p className="field-note">
            {t(
              salary.calculationBasis === "calendar"
                ? "settings.autoCalculationNote"
                : "settings.divisorNote",
            )}{" "}
            {t("settings.currencyNote")}
          </p>
        </section>
        <section className="form-section">
          <h2>
            <Clock3 size={17} />
            {t("settings.schedule")}
          </h2>
          <div className="weekday-field">
            <span>{t("settings.weekdays")}</span>
            <div className="weekdays">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={schedule.workWeekdays.includes(day)}
                    onChange={() =>
                      setSchedule((s) => ({
                        ...s,
                        workWeekdays: s.workWeekdays.includes(day)
                          ? s.workWeekdays.filter((v) => v !== day)
                          : [...s.workWeekdays, day].sort(),
                      }))
                    }
                  />
                  <span>{t(`weekday.${day}`)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-grid">
            <label>
              {t("settings.start")}
              <input
                required
                type="time"
                value={schedule.shiftStart}
                onChange={(e) =>
                  setSchedule((s) =>
                    changeShift(s, "shiftStart", e.target.value),
                  )
                }
              />
            </label>
            <label>
              {t("settings.end")}
              <input
                required
                type="time"
                value={schedule.shiftEnd}
                onChange={(e) =>
                  setSchedule((s) => changeShift(s, "shiftEnd", e.target.value))
                }
              />
            </label>
            <div className="derived-field">
              <span>{t("settings.shiftType")}</span>
              <strong>
                {t(
                  schedule.endDayOffset
                    ? "settings.overnightAuto"
                    : "settings.sameDayAuto",
                )}
              </strong>
            </div>
            <label>
              {t("settings.timezone")}
              <input value={schedule.timezone} readOnly />
            </label>
          </div>
          <p className="field-note">24h · {t("settings.autoTimezone")}</p>
          <div className="break-heading">
            <h3>{t("settings.break")}</h3>
            <label className="switch">
              <input
                type="checkbox"
                checked={schedule.breaks.length > 0}
                onChange={(e) => {
                  setSchedule((s) => ({
                    ...s,
                    breaks: e.target.checked ? [suggestedBreak(s)] : [],
                  }));
                  setExtraBreaksRemoved(true);
                }}
              />
              <span />
            </label>
          </div>
          {pause && (
            <div className="form-grid">
              <label>
                {t("settings.breakStart")}
                <input
                  type="time"
                  value={pauseClock()}
                  onChange={(e) =>
                    setPause({
                      startOffsetMinutes:
                        (minuteOf(e.target.value) - startMinute + 1440) % 1440,
                    })
                  }
                />
              </label>
              <label>
                {t("settings.breakEnd")}
                <input
                  type="time"
                  value={clockAt(
                    startMinute +
                      pause.startOffsetMinutes +
                      pause.durationMinutes,
                  )}
                  onChange={(e) =>
                    setPause({
                      durationMinutes:
                        (minuteOf(e.target.value) -
                          minuteOf(pauseClock()) +
                          1440) %
                        1440,
                    })
                  }
                />
              </label>
              <div className="derived-field">
                <span>{t("settings.breakMinutes")}</span>
                <strong>
                  {pause.durationMinutes} {t("settings.minutesUnit")}
                </strong>
              </div>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={pause.paid}
                  onChange={(e) => setPause({ paid: e.target.checked })}
                />
                {t("settings.breakPaid")}
              </label>
            </div>
          )}
          {schedule.breaks.length > 1 && !extraBreaksRemoved && (
            <small>+{schedule.breaks.length - 1}</small>
          )}
          <h3>{t("settings.exceptions")}</h3>
          <div className="exception-add">
            <input
              type="date"
              aria-label={t("settings.exceptions")}
              value={exceptionDate}
              onChange={(e) => setExceptionDate(e.target.value)}
            />
            <button
              type="button"
              className="secondary"
              disabled={
                !exceptionDate ||
                schedule.exceptions.some((v) => v.date === exceptionDate)
              }
              onClick={() => {
                setSchedule((s) => ({
                  ...s,
                  exceptions: [
                    ...s.exceptions,
                    { date: exceptionDate, working: false },
                  ],
                }));
                setExceptionDate("");
              }}
            >
              {t("settings.addException")}
            </button>
          </div>
          <div className="exceptions">
            {schedule.exceptions.map((item) => (
              <div key={item.date}>
                <span>{item.date}</span>
                <select
                  aria-label={`${item.date} ${t("settings.exceptions")}`}
                  value={item.working ? "work" : "off"}
                  onChange={(e) =>
                    setSchedule((s) => ({
                      ...s,
                      exceptions: s.exceptions.map((v) =>
                        v.date === item.date
                          ? { ...v, working: e.target.value === "work" }
                          : v,
                      ),
                    }))
                  }
                >
                  <option value="off">{t("settings.offDay")}</option>
                  <option value="work">{t("settings.workingDay")}</option>
                </select>
                <button
                  type="button"
                  className="icon-button"
                  title={t("settings.remove")}
                  aria-label={t("settings.remove")}
                  onClick={() =>
                    setSchedule((s) => ({
                      ...s,
                      exceptions: s.exceptions.filter(
                        (v) => v.date !== item.date,
                      ),
                    }))
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <section
            className="salary-preview"
            aria-label={t("settings.livePreview")}
            aria-live="polite"
          >
            <h3>
              {t("settings.livePreview")}
              {preview && <small>{preview.month}</small>}
            </h3>
            {preview ? (
              <>
                <dl className="preview-grid">
                  <div>
                    <dt>{t("settings.autoWorkingDays")}</dt>
                    <dd data-testid="preview-working-days">
                      {preview.workingDays}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("settings.autoPaidHours")}</dt>
                    <dd data-testid="preview-paid-hours">
                      {Math.floor(preview.paidMinutesPerShift / 60)}h{" "}
                      {preview.paidMinutesPerShift % 60}m
                    </dd>
                  </div>
                  <div>
                    <dt>{t("settings.autoDaily")}</dt>
                    <dd data-testid="preview-daily">
                      {amount(preview.dailyAmount)}{" "}
                      <small>{salary.currency}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>{t("settings.autoHourly")}</dt>
                    <dd data-testid="preview-hourly">
                      {amount(preview.hourlyAmount)}{" "}
                      <small>{salary.currency}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>{t("settings.autoSecondly")}</dt>
                    <dd data-testid="preview-secondly">
                      {amount(preview.secondlyAmount)}{" "}
                      <small>{salary.currency}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>{t("settings.autoMonthly")}</dt>
                    <dd data-testid="preview-monthly">
                      {amount(preview.monthlyAmount)}{" "}
                      <small>{salary.currency}</small>
                    </dd>
                  </div>
                </dl>
                <p className="field-note">{t("settings.previewBudgetNote")}</p>
              </>
            ) : (
              <p className="field-note">
                {previewError
                  ? t(
                      i18n.exists(`error.${previewError}`)
                        ? `error.${previewError}`
                        : "error.generic",
                    )
                  : t(
                      salary.amount
                        ? "settings.previewCalculating"
                        : "settings.previewEmpty",
                    )}
              </p>
            )}
          </section>
        </section>
        <section className="form-section">
          <h2>
            <Monitor size={17} />
            {t("settings.desktop")}
          </h2>
          <Toggle
            label={t("settings.reducedMotion")}
            checked={preferences.reducedMotion}
            onChange={(v) => pref("reducedMotion", v)}
          />
          <Toggle
            label={t("settings.hideSalary")}
            checked={preferences.hideSalary}
            onChange={(v) => pref("hideSalary", v)}
          />
          <Toggle
            label={t("settings.floating")}
            checked={preferences.floatingVisible}
            onChange={(v) => pref("floatingVisible", v)}
          />
          <Toggle
            label={t("settings.notifications")}
            note={t("settings.notificationNote")}
            checked={preferences.clockOutEnabled}
            onChange={(v) => pref("clockOutEnabled", v)}
          />
          <button type="button" className="secondary" onClick={onTest}>
            {t("settings.testNotification")}
          </button>
          <Toggle
            label={t("settings.quiet")}
            checked={preferences.quietEnabled}
            onChange={(v) => pref("quietEnabled", v)}
          />
          {preferences.quietEnabled && (
            <div className="form-grid">
              <label>
                {t("settings.quietStart")}
                <input
                  type="time"
                  value={preferences.quietStart}
                  onChange={(e) => pref("quietStart", e.target.value)}
                />
              </label>
              <label>
                {t("settings.quietEnd")}
                <input
                  type="time"
                  value={preferences.quietEnd}
                  onChange={(e) => pref("quietEnd", e.target.value)}
                />
              </label>
            </div>
          )}
          {!first && (
            <Toggle
              label={t("settings.autostart")}
              note={t("settings.autostartNote")}
              checked={autostart}
              onChange={(enabled) => {
                void command<boolean>("set_autostart", { enabled })
                  .then(setAutostart)
                  .catch((e) => onError(String(e).replace(/^Error: /, "")));
              }}
            />
          )}
        </section>
        {first && (
          <label className="checkbox-line start-option">
            <input
              type="checkbox"
              checked={startFromShift}
              onChange={(e) => setStartFromShift(e.target.checked)}
            />
            {t("onboarding.startFromShift")}
          </label>
        )}
        <div className="form-actions">
          <span>
            <ShieldCheck size={14} />
            {t("onboarding.private")}
          </span>
          <button className="primary" disabled={saving} type="submit">
            {saving ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}{" "}
            {t(
              saving
                ? "common.saving"
                : first
                  ? "onboarding.start"
                  : "common.save",
            )}
          </button>
        </div>
      </form>
      {!first && (
        <section className="data-section">
          <h2>{t("settings.data")}</h2>
          <button
            className="secondary"
            onClick={() => void act("open_data_dir")}
          >
            <FolderOpen size={16} />
            {t("settings.openData")}
          </button>
          <button
            className="text-button danger"
            onClick={() => setResetConfirm(true)}
          >
            <Trash2 size={15} />
            {t("settings.reset")}
          </button>
        </section>
      )}
      {resetConfirm && (
        <div className="modal-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            className="modal"
          >
            <h2 id="reset-title">{t("settings.reset")}</h2>
            <p>{t("settings.resetConfirm")}</p>
            <div>
              <button
                className="secondary"
                onClick={() => setResetConfirm(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="primary destructive"
                onClick={() => {
                  setResetConfirm(false);
                  void act("reset_data", {
                    confirmation: "DELETE_PERSONAL_DATA",
                  });
                }}
              >
                {t("settings.reset")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Toggle({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <b>{label}</b>
        {note && <small>{note}</small>}
      </span>
      <span className="switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span />
      </span>
    </label>
  );
}
