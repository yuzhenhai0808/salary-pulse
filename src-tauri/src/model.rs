use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Salary {
    pub mode: String,
    pub amount: String,
    pub currency: String,
    pub divisor_days: String,
    pub standard_paid_minutes: u32,
    #[serde(default = "legacy_basis")]
    pub calculation_basis: String,
}

fn legacy_basis() -> String {
    "fixed".into()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInput {
    pub salary: Salary,
    pub schedule: Schedule,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SalaryPreview {
    pub month: String,
    pub working_days: u32,
    pub paid_minutes_per_shift: u32,
    pub monthly_paid_seconds: i64,
    pub monthly_amount: String,
    pub daily_amount: String,
    pub hourly_amount: String,
    pub secondly_amount: String,
    pub calculation_basis: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Break {
    pub start_offset_minutes: u32,
    pub duration_minutes: u32,
    pub paid: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DateException {
    pub date: String,
    pub working: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub timezone: String,
    pub work_weekdays: Vec<u32>,
    pub shift_start: String,
    pub shift_end: String,
    pub end_day_offset: u32,
    pub breaks: Vec<Break>,
    pub exceptions: Vec<DateException>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rules {
    pub id: String,
    pub effective_from_utc: String,
    pub salary: Salary,
    pub schedule: Schedule,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub language: String,
    pub nickname: String,
    pub theme: String,
    pub hide_salary: bool,
    pub reduced_motion: bool,
    pub floating_visible: bool,
    pub clock_out_enabled: bool,
    pub quiet_enabled: bool,
    pub quiet_start: String,
    pub quiet_end: String,
    pub decimal_places: u32,
    pub floating_position: Option<[f64; 2]>,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            language: "system".into(),
            nickname: String::new(),
            theme: "system".into(),
            hide_salary: false,
            reduced_motion: false,
            floating_visible: false,
            clock_out_enabled: false,
            quiet_enabled: false,
            quiet_start: "22:00".into(),
            quiet_end: "07:00".into(),
            decimal_places: 2,
            floating_position: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub schema_version: u32,
    pub revision: u64,
    pub tracking_started_at_utc: Option<String>,
    pub preferences: Preferences,
    pub rules: Vec<Rules>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            schema_version: 2,
            revision: 0,
            tracking_started_at_utc: None,
            preferences: Preferences::default(),
            rules: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPayload {
    pub expected_revision: u64,
    pub salary: Salary,
    pub schedule: Schedule,
    pub preferences: Preferences,
    pub start_from_shift: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub config: Config,
    pub recovery_required: bool,
    pub effective_locale: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocaleView {
    pub preference: String,
    pub effective_locale: String,
    pub revision: u64,
    pub locale_sequence: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub sequence: u64,
    pub generated_at_utc: String,
    pub local_date: String,
    pub timezone: String,
    pub status: String,
    pub currency: String,
    pub estimated_today_amount: Option<String>,
    pub estimated_shift_amount: Option<String>,
    pub paid_seconds: i64,
    pub seconds_until_clock_out: Option<i64>,
    pub seconds_until_next_shift: Option<i64>,
    pub shift_progress: f64,
    pub shift_id: Option<String>,
    pub shift_end_utc: Option<String>,
    pub salary_hidden: bool,
    pub decimal_places: u32,
    pub nickname: String,
    pub reduced_motion: bool,
    pub theme: String,
    pub warnings: Vec<String>,
}

impl Snapshot {
    pub fn empty(config: &Config, status: &str) -> Self {
        Self {
            sequence: 0,
            generated_at_utc: Utc::now().to_rfc3339(),
            local_date: String::new(),
            timezone: String::new(),
            status: status.into(),
            currency: "CNY".into(),
            estimated_today_amount: None,
            estimated_shift_amount: None,
            paid_seconds: 0,
            seconds_until_clock_out: None,
            seconds_until_next_shift: None,
            shift_progress: 0.0,
            shift_id: None,
            shift_end_utc: None,
            salary_hidden: config.preferences.hide_salary,
            decimal_places: config.preferences.decimal_places,
            nickname: config.preferences.nickname.clone(),
            reduced_motion: config.preferences.reduced_motion,
            theme: config.preferences.theme.clone(),
            warnings: Vec::new(),
        }
    }
}
