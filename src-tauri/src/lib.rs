mod engine;
mod locale;
mod model;
mod storage;

use chrono::{DateTime, Duration as ChronoDuration, Timelike, Utc};
use model::{
    Config, LocaleView, PreviewInput, Rules, SalaryPreview, SettingsPayload, SettingsView, Snapshot,
};
use std::{sync::Mutex, time::Duration};
use storage::Store;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_notification::NotificationExt;

struct RuntimeState {
    config: Config,
    recovery: bool,
    sequence: u64,
    locale_sequence: u64,
    locale: String,
}
struct AppState {
    runtime: Mutex<RuntimeState>,
    store: Store,
}

fn authorize(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("PERMISSION_DENIED".into())
    }
}

fn settings(state: &AppState) -> Result<SettingsView, String> {
    let r = state.runtime.lock().map_err(|_| "INVALID_STATE")?;
    Ok(SettingsView {
        config: r.config.clone(),
        recovery_required: r.recovery,
        effective_locale: r.locale.clone(),
    })
}

fn update_preferences<F>(
    app: &tauri::AppHandle,
    state: &AppState,
    change: F,
) -> Result<Config, String>
where
    F: FnOnce(&mut model::Preferences),
{
    let mut r = state.runtime.lock().map_err(|_| "INVALID_STATE")?;
    if r.recovery {
        return Err("RECOVERY_REQUIRED".into());
    }
    let mut next = r.config.clone();
    change(&mut next.preferences);
    next.revision += 1;
    state.store.save(&next, Some(r.config.revision))?;
    r.config = next.clone();
    let next_locale = locale::resolve(&next.preferences.language);
    if next_locale != r.locale {
        r.locale = next_locale;
        r.locale_sequence += 1;
    }
    let view = locale::view(&next, r.locale_sequence, &r.locale);
    drop(r);
    let _ = app.emit("settings_changed", next.revision);
    let _ = app.emit("locale_changed", view);
    rebuild_menu(app, state)?;
    emit_snapshot(app, state);
    Ok(next)
}

#[tauri::command]
fn get_settings(
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
) -> Result<SettingsView, String> {
    authorize(&window)?;
    settings(&state)
}

#[tauri::command]
fn get_locale(state: tauri::State<AppState>) -> Result<LocaleView, String> {
    let r = state.runtime.lock().map_err(|_| "INVALID_STATE")?;
    Ok(locale::view(&r.config, r.locale_sequence, &r.locale))
}

#[tauri::command]
fn preview_salary(
    window: tauri::WebviewWindow,
    input: PreviewInput,
) -> Result<SalaryPreview, String> {
    authorize(&window)?;
    let salary = engine::normalize_salary(input.salary, &input.schedule)?;
    engine::salary_preview(&salary, &input.schedule, Utc::now())
}

#[tauri::command]
fn set_language(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
    language: String,
    expected_revision: u64,
) -> Result<LocaleView, String> {
    authorize(&window)?;
    {
        let r = state.runtime.lock().map_err(|_| "INVALID_STATE")?;
        if r.config.revision != expected_revision {
            return Err("REVISION_CONFLICT".into());
        }
    }
    update_preferences(&app, &state, |p| p.language = language)?;
    get_locale(state)
}

#[tauri::command]
fn save_settings(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
    mut payload: SettingsPayload,
) -> Result<SettingsView, String> {
    authorize(&window)?;
    engine::validate_schedule(&payload.schedule)?;
    payload.salary = engine::normalize_salary(payload.salary, &payload.schedule)?;
    let mut r = state.runtime.lock().map_err(|_| "INVALID_STATE")?;
    if r.recovery {
        return Err("RECOVERY_REQUIRED".into());
    }
    if r.config.revision != payload.expected_revision {
        return Err("REVISION_CONFLICT".into());
    }
    let now = Utc::now();
    let mut next = r.config.clone();
    next.preferences = payload.preferences;
    next.schema_version = 2;
    next.preferences.floating_position = r.config.preferences.floating_position;
    next.revision += 1;
    let current = next.rules.last();
    let changed = current.is_none_or(|rules| {
        serde_json::to_value(&rules.salary).ok() != serde_json::to_value(&payload.salary).ok()
            || serde_json::to_value(&rules.schedule).ok()
                != serde_json::to_value(&payload.schedule).ok()
    });
    if changed {
        let first = next.rules.is_empty();
        let effective = if first {
            let (effective, tracking) = engine::initial_times(
                &payload.salary,
                &payload.schedule,
                now,
                payload.start_from_shift,
            )?;
            next.tracking_started_at_utc = Some(tracking.to_rfc3339());
            effective
        } else {
            engine::next_effective(&next, &payload.schedule, &payload.salary.currency, now)?
        };
        next.rules.retain(|rules| {
            DateTime::parse_from_rfc3339(&rules.effective_from_utc)
                .is_ok_and(|t| t.with_timezone(&Utc) <= now)
        });
        // Retain recent rule boundaries and the most recent baseline, all in one atomic document.
        while next.rules.len() > 2
            && DateTime::parse_from_rfc3339(&next.rules[1].effective_from_utc)
                .is_ok_and(|t| t.with_timezone(&Utc) < now - ChronoDuration::days(7))
        {
            next.rules.remove(0);
        }
        next.rules.push(Rules {
            id: format!("r-{}", now.timestamp_micros()),
            effective_from_utc: effective.to_rfc3339(),
            salary: payload.salary,
            schedule: payload.schedule,
        });
    }
    state.store.save(&next, Some(r.config.revision))?;
    r.config = next;
    r.locale = locale::resolve(&r.config.preferences.language);
    r.locale_sequence += 1;
    let view = locale::view(&r.config, r.locale_sequence, &r.locale);
    let float_visible = r.config.preferences.floating_visible;
    drop(r);
    sync_floating(&app, float_visible);
    let _ = app.emit("locale_changed", view);
    let _ = app.emit("settings_changed", ());
    rebuild_menu(&app, &state)?;
    emit_snapshot(&app, &state);
    settings(&state)
}

fn current_snapshot(state: &AppState) -> Result<Snapshot, String> {
    let mut r = state.runtime.lock().map_err(|_| "INVALID_STATE")?;
    let mut snapshot = if r.recovery {
        Snapshot::empty(&r.config, "ERROR")
    } else {
        engine::snapshot(&r.config, Utc::now()).unwrap_or_else(|error| {
            let mut s = Snapshot::empty(&r.config, "ERROR");
            s.warnings.push(error);
            s
        })
    };
    r.sequence += 1;
    snapshot.sequence = r.sequence;
    Ok(snapshot)
}

#[tauri::command]
fn get_snapshot(state: tauri::State<AppState>) -> Result<Snapshot, String> {
    current_snapshot(&state)
}

fn emit_snapshot(app: &tauri::AppHandle, state: &AppState) {
    if let Ok(snapshot) = current_snapshot(state) {
        let _ = app.emit("snapshot_updated", snapshot);
    }
}

#[tauri::command]
fn set_privacy(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
    hidden: bool,
) -> Result<SettingsView, String> {
    authorize(&window)?;
    update_preferences(&app, &state, |p| p.hide_salary = hidden)?;
    settings(&state)
}

fn sync_floating(app: &tauri::AppHandle, visible: bool) {
    if let Some(window) = app.get_webview_window("floating") {
        if visible {
            let _ = window.show();
        } else {
            let _ = window.hide();
        }
    }
}

#[tauri::command]
fn set_floating(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
    visible: bool,
) -> Result<(), String> {
    if window.label() != "main" && visible {
        return Err("PERMISSION_DENIED".into());
    }
    update_preferences(&app, &state, |p| p.floating_visible = visible)?;
    sync_floating(&app, visible);
    Ok(())
}

#[tauri::command]
fn test_notification(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    authorize(&window)?;
    let r = state.runtime.lock().map_err(|_| "INVALID_STATE")?;
    app.notification()
        .builder()
        .title(locale::text(&r.locale, "notification.testTitle"))
        .body(locale::text(&r.locale, "notification.testBody"))
        .show()
        .map_err(|_| "NOTIFICATION_FAILED".into())
}

#[tauri::command]
fn set_autostart(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    enabled: bool,
) -> Result<bool, String> {
    authorize(&window)?;
    if enabled {
        let path = std::env::current_exe().map_err(|_| "AUTOSTART_FAILED")?;
        if !path.to_string_lossy().contains("/Applications/") {
            return Err("INSTALL_FIRST".into());
        }
        app.autolaunch().enable().map_err(|_| "AUTOSTART_FAILED")?;
    } else {
        app.autolaunch().disable().map_err(|_| "AUTOSTART_FAILED")?;
    }
    app.autolaunch()
        .is_enabled()
        .map_err(|_| "AUTOSTART_FAILED".into())
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<bool, String> {
    authorize(&window)?;
    app.autolaunch()
        .is_enabled()
        .map_err(|_| "AUTOSTART_FAILED".into())
}

#[tauri::command]
fn open_data_dir(
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    authorize(&window)?;
    std::fs::create_dir_all(&state.store.directory).map_err(|_| "STORAGE_UNAVAILABLE")?;
    std::process::Command::new("/usr/bin/open")
        .arg(&state.store.directory)
        .spawn()
        .map_err(|_| "STORAGE_UNAVAILABLE")?;
    Ok(())
}

#[tauri::command]
fn reset_data(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
    confirmation: String,
) -> Result<SettingsView, String> {
    authorize(&window)?;
    if confirmation != "DELETE_PERSONAL_DATA" {
        return Err("PERMISSION_DENIED".into());
    }
    let mut r = state.runtime.lock().map_err(|_| "INVALID_STATE")?;
    state.store.reset()?;
    let _ = app.autolaunch().disable();
    r.config = Config::default();
    r.recovery = false;
    r.locale = locale::resolve("system");
    r.locale_sequence += 1;
    drop(r);
    sync_floating(&app, false);
    rebuild_menu(&app, &state)?;
    emit_snapshot(&app, &state);
    settings(&state)
}

#[tauri::command]
fn recover_data(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
) -> Result<SettingsView, String> {
    authorize(&window)?;
    let config = state.store.load_backup()?;
    state.store.recover(&config)?;
    let mut r = state.runtime.lock().map_err(|_| "INVALID_STATE")?;
    r.config = config;
    r.recovery = false;
    r.locale = locale::resolve(&r.config.preferences.language);
    r.locale_sequence += 1;
    drop(r);
    rebuild_menu(&app, &state)?;
    emit_snapshot(&app, &state);
    settings(&state)
}

fn rebuild_menu(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    let r = state.runtime.lock().map_err(|_| "INVALID_STATE")?;
    let effective_locale = r.locale.clone();
    let hidden = r.config.preferences.hide_salary;
    drop(r);
    let keys = [
        ("open", "common.open"),
        ("settings", "common.settings"),
        (
            "privacy",
            if hidden { "common.show" } else { "common.hide" },
        ),
        ("floating", "common.floating"),
        ("quit", "common.quit"),
    ];
    let items: Vec<MenuItem<tauri::Wry>> = keys
        .iter()
        .map(|(id, key)| {
            MenuItem::with_id(
                app,
                *id,
                locale::text(&effective_locale, key),
                true,
                None::<&str>,
            )
        })
        .collect::<Result<_, _>>()
        .map_err(|_| "MENU_FAILED")?;
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = items
        .iter()
        .map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>)
        .collect();
    let menu = Menu::with_items(app, &refs).map_err(|_| "MENU_FAILED")?;
    if let Some(tray) = app.tray_by_id("workday") {
        tray.set_menu(Some(menu)).map_err(|_| "MENU_FAILED")?;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&locale::text(&effective_locale, "app.title"));
    }
    Ok(())
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn ticker(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut ticks = 0u64;
        let mut last_position = None;
        let mut stable_position_ticks = 0;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            ticks += 1;
            let state = app.state::<AppState>();
            if let Some(window) = app.get_webview_window("floating") {
                if let Ok(position) = window.outer_position() {
                    let scale = window.scale_factor().unwrap_or(1.0);
                    let position = [position.x as f64 / scale, position.y as f64 / scale];
                    if last_position == Some(position) {
                        stable_position_ticks += 1;
                    } else {
                        stable_position_ticks = 0;
                        last_position = Some(position);
                    }
                    if stable_position_ticks == 2 {
                        if let Ok(mut r) = state.runtime.lock() {
                            if !r.recovery
                                && !r.config.rules.is_empty()
                                && r.config.preferences.floating_position != Some(position)
                            {
                                let mut next = r.config.clone();
                                next.preferences.floating_position = Some(position);
                                if state.store.save(&next, Some(r.config.revision)).is_ok() {
                                    r.config = next;
                                }
                            }
                        }
                    }
                }
            }
            if let Ok(s) = current_snapshot(&state) {
                let _ = app.emit("snapshot_updated", &s);
                if ticks.is_multiple_of(10) {
                    if let Some(tray) = app.tray_by_id("workday") {
                        let title = s
                            .seconds_until_clock_out
                            .filter(|v| *v > 0)
                            .or(s.seconds_until_next_shift)
                            .map(|sec| format!("{}:{:02}", sec / 3600, (sec % 3600) / 60))
                            .unwrap_or_else(|| "✓".into());
                        let _ = tray.set_title(Some(&title));
                    }
                }
                if let Some(end) = s
                    .shift_end_utc
                    .as_deref()
                    .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
                {
                    let age = (Utc::now() - end.with_timezone(&Utc)).num_seconds();
                    if (0..300).contains(&age) {
                        if let Ok(r) = state.runtime.lock() {
                            let id = format!("{}:end", s.shift_id.as_deref().unwrap_or(""));
                            if let Ok(true) = state.store.claim_notification(&id) {
                                let p = &r.config.preferences;
                                let tz = r.config.rules.last().and_then(|v| {
                                    v.schedule.timezone.parse::<chrono_tz::Tz>().ok()
                                });
                                let minute = tz
                                    .map(|tz| {
                                        Utc::now().with_timezone(&tz).num_seconds_from_midnight()
                                            / 60
                                    })
                                    .unwrap_or(0);
                                let quiet = engine::parse_time(&p.quiet_start)
                                    .ok()
                                    .zip(engine::parse_time(&p.quiet_end).ok())
                                    .is_some_and(|(a, b)| {
                                        let a = a.num_seconds_from_midnight() / 60;
                                        let b = b.num_seconds_from_midnight() / 60;
                                        p.quiet_enabled
                                            && if a < b {
                                                a <= minute && minute < b
                                            } else {
                                                minute >= a || minute < b
                                            }
                                    });
                                if p.clock_out_enabled && !quiet {
                                    let _ = app
                                        .notification()
                                        .builder()
                                        .title(locale::text(
                                            &r.locale,
                                            "notification.clockOutTitle",
                                        ))
                                        .body(locale::text(&r.locale, "notification.clockOutBody"))
                                        .show();
                                }
                            }
                        }
                    }
                }
            }
            if ticks.is_multiple_of(30) {
                let mut r = state.runtime.lock().unwrap();
                if r.config.preferences.language == "system" {
                    let next = locale::resolve("system");
                    if next != r.locale {
                        r.locale = next;
                        r.locale_sequence += 1;
                        let view = locale::view(&r.config, r.locale_sequence, &r.locale);
                        drop(r);
                        let _ = app.emit("locale_changed", view);
                        let _ = rebuild_menu(&app, &state);
                    }
                }
            }
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app)
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .macos_launcher(tauri_plugin_autostart::MacosLauncher::LaunchAgent)
                .arg("--background")
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            get_snapshot,
            get_locale,
            set_language,
            set_privacy,
            set_floating,
            test_notification,
            set_autostart,
            get_autostart,
            open_data_dir,
            reset_data,
            recover_data,
            preview_salary
        ])
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            let store = Store { directory };
            let (config, recovery) = if store.exists() {
                match store.load() {
                    Ok(c) => (c, false),
                    Err(_) => (Config::default(), true),
                }
            } else {
                (Config::default(), false)
            };
            let locale = locale::resolve(&config.preferences.language);
            let floating = config.preferences.floating_visible;
            let position = config.preferences.floating_position;
            app.manage(AppState {
                runtime: Mutex::new(RuntimeState {
                    config,
                    recovery,
                    sequence: 0,
                    locale_sequence: 1,
                    locale,
                }),
                store,
            });
            TrayIconBuilder::with_id("workday")
                .icon(
                    app.default_window_icon()
                        .ok_or("Missing application icon")?
                        .clone(),
                )
                .icon_as_template(false)
                .on_menu_event(|app, event| {
                    let state = app.state::<AppState>();
                    match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "open" => show_main(app),
                        "settings" => {
                            show_main(app);
                            let _ = app.emit("navigate_settings", ());
                        }
                        "privacy" => {
                            let hidden = state
                                .runtime
                                .lock()
                                .map(|r| !r.config.preferences.hide_salary)
                                .unwrap_or(true);
                            let _ = update_preferences(app, &state, |p| p.hide_salary = hidden);
                        }
                        "floating" => {
                            let visible = state
                                .runtime
                                .lock()
                                .map(|r| !r.config.preferences.floating_visible)
                                .unwrap_or(false);
                            if update_preferences(app, &state, |p| p.floating_visible = visible)
                                .is_ok()
                            {
                                sync_floating(app, visible);
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show_main(tray.app_handle());
                    }
                })
                .show_menu_on_left_click(false)
                .build(app)?;
            rebuild_menu(app.handle(), &app.state::<AppState>()).map_err(std::io::Error::other)?;
            if let Some(window) = app.get_webview_window("floating") {
                if let Some(pos) = position {
                    if let Ok(Some(monitor)) = window.primary_monitor() {
                        let scale = monitor.scale_factor();
                        let mp = monitor.position();
                        let size = monitor.size();
                        let x = pos[0].clamp(
                            mp.x as f64 / scale,
                            (mp.x as f64 + size.width as f64) / scale - 290.0,
                        );
                        let y = pos[1].clamp(
                            mp.y as f64 / scale + 30.0,
                            (mp.y as f64 + size.height as f64) / scale - 158.0,
                        );
                        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
                    }
                }
            }
            sync_floating(app.handle(), floating);
            if !std::env::args().any(|arg| arg == "--background") || recovery {
                show_main(app.handle());
            }
            ticker(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("Unable to run Salary Pulse");
}
