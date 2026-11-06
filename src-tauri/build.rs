fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_settings",
            "save_settings",
            "get_snapshot",
            "get_locale",
            "set_language",
            "set_privacy",
            "set_floating",
            "test_notification",
            "set_autostart",
            "get_autostart",
            "open_data_dir",
            "reset_data",
            "recover_data",
            "preview_salary",
        ]),
    ))
    .expect("Could not build desktop manifest");
}
