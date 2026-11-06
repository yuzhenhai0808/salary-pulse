use crate::model::{Config, LocaleView};
use serde_json::Value;

pub fn resolve(preference: &str) -> String {
    if preference == "zh-CN" || preference == "en-US" {
        return preference.into();
    }
    #[cfg(target_os = "macos")]
    if let Ok(output) = std::process::Command::new("/usr/bin/defaults")
        .args(["read", "-g", "AppleLanguages"])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        for language in text.split(|c: char| !c.is_alphanumeric() && c != '-') {
            if language.starts_with("zh") {
                return "zh-CN".into();
            }
            if language.starts_with("en") {
                return "en-US".into();
            }
        }
    }
    "en-US".into()
}

pub fn text(locale: &str, key: &str) -> String {
    lookup(locale, key)
}

fn lookup(locale: &str, key: &str) -> String {
    use std::sync::OnceLock;
    static ZH: OnceLock<Value> = OnceLock::new();
    static EN: OnceLock<Value> = OnceLock::new();
    let en = EN.get_or_init(|| {
        serde_json::from_str(include_str!("../../resources/locales/en-US/app.json"))
            .expect("English resources")
    });
    let catalog = if locale == "zh-CN" {
        ZH.get_or_init(|| {
            serde_json::from_str(include_str!("../../resources/locales/zh-CN/app.json"))
                .expect("Chinese resources")
        })
    } else {
        en
    };
    catalog
        .get(key)
        .or_else(|| en.get(key))
        .and_then(Value::as_str)
        .unwrap_or(key)
        .into()
}

pub fn view(config: &Config, sequence: u64, locale: &str) -> LocaleView {
    LocaleView {
        preference: config.preferences.language.clone(),
        effective_locale: locale.into(),
        revision: config.revision,
        locale_sequence: sequence,
    }
}
