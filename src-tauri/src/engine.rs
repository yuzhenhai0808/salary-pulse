use crate::model::{Config, Rules, Salary, SalaryPreview, Schedule, Snapshot};
use chrono::{
    DateTime, Datelike, Duration, LocalResult, NaiveDate, NaiveDateTime, NaiveTime, TimeZone,
    Timelike, Utc,
};
use chrono_tz::Tz;
use rust_decimal::{Decimal, RoundingStrategy};
use std::str::FromStr;

#[derive(Debug)]
pub struct Shift {
    pub id: String,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub paid: Vec<(DateTime<Utc>, DateTime<Utc>)>,
    pub breaks: Vec<(DateTime<Utc>, DateTime<Utc>, bool)>,
    pub warnings: Vec<String>,
}

pub fn parse_time(value: &str) -> Result<NaiveTime, String> {
    if value.len() != 5 {
        return Err("INVALID_TIME".into());
    }
    NaiveTime::parse_from_str(value, "%H:%M").map_err(|_| "INVALID_TIME".into())
}

pub fn rate(salary: &Salary) -> Result<Decimal, String> {
    let amount = Decimal::from_str(&salary.amount).map_err(|_| "INVALID_SALARY")?;
    if amount <= Decimal::ZERO || amount > Decimal::from(1_000_000_000u64) {
        return Err("INVALID_SALARY".into());
    }
    if !["CNY", "USD"].contains(&salary.currency.as_str()) {
        return Err("INVALID_CURRENCY".into());
    }
    if !["fixed", "calendar"].contains(&salary.calculation_basis.as_str()) {
        return Err("INVALID_BASIS".into());
    }
    let denominator = match salary.mode.as_str() {
        "hourly" => Decimal::from(3600),
        "monthly" => {
            let days = Decimal::from_str(&salary.divisor_days).map_err(|_| "INVALID_DIVISOR")?;
            if days < Decimal::new(1, 2)
                || days > Decimal::from(31)
                || salary.standard_paid_minutes == 0
                || salary.standard_paid_minutes > 1440
            {
                return Err("INVALID_DIVISOR".into());
            }
            days.checked_mul(Decimal::from(salary.standard_paid_minutes))
                .and_then(|v| v.checked_mul(Decimal::from(60)))
                .ok_or("INVALID_DIVISOR")?
        }
        _ => return Err("INVALID_MODE".into()),
    };
    amount
        .checked_div(denominator)
        .ok_or_else(|| "INVALID_SALARY".into())
}

pub fn planned_paid_minutes(schedule: &Schedule) -> Result<u32, String> {
    validate_schedule(schedule)?;
    let start = parse_time(&schedule.shift_start)?.num_seconds_from_midnight() / 60;
    let end = parse_time(&schedule.shift_end)?.num_seconds_from_midnight() / 60
        + schedule.end_day_offset * 1440;
    let unpaid: u32 = schedule
        .breaks
        .iter()
        .filter(|b| !b.paid)
        .map(|b| b.duration_minutes)
        .sum();
    Ok(end - start - unpaid)
}

fn month_budget(rules: &Rules, anchor: NaiveDate) -> Result<(u32, i64), String> {
    let mut date = anchor.with_day(1).ok_or("INVALID_DATE")?;
    let mut days = 0;
    let mut seconds = 0;
    while date.month() == anchor.month() && date.year() == anchor.year() {
        if let Some(shift) = resolve_shift(rules, date)? {
            days += 1;
            seconds += paid_seconds(&shift, shift.start, shift.end);
        }
        date = date.succ_opt().ok_or("INVALID_DATE")?;
    }
    Ok((days, seconds))
}

pub fn rate_for_shift(rules: &Rules, anchor: NaiveDate) -> Result<Decimal, String> {
    let fallback = rate(&rules.salary)?;
    if rules.salary.mode != "monthly" || rules.salary.calculation_basis == "fixed" {
        return Ok(fallback);
    }
    let (_, seconds) = month_budget(rules, anchor)?;
    if seconds == 0 {
        return Err("NO_PAID_TIME".into());
    }
    Decimal::from_str(&rules.salary.amount)
        .map_err(|_| "INVALID_SALARY")?
        .checked_div(Decimal::from(seconds))
        .ok_or_else(|| "NO_PAID_TIME".into())
}

pub fn salary_preview(
    salary: &Salary,
    schedule: &Schedule,
    now: DateTime<Utc>,
) -> Result<SalaryPreview, String> {
    rate(salary)?;
    let paid_minutes = planned_paid_minutes(schedule)?;
    let tz: Tz = schedule.timezone.parse().map_err(|_| "INVALID_TIMEZONE")?;
    let anchor = now.with_timezone(&tz).date_naive();
    let rules = Rules {
        id: "preview".into(),
        effective_from_utc: now.to_rfc3339(),
        salary: salary.clone(),
        schedule: schedule.clone(),
    };
    let (days, seconds) = month_budget(&rules, anchor)?;
    let per_second = rate_for_shift(&rules, anchor)?;
    Ok(SalaryPreview {
        month: format!("{}-{:02}", anchor.year(), anchor.month()),
        working_days: days,
        paid_minutes_per_shift: paid_minutes,
        monthly_paid_seconds: seconds,
        monthly_amount: money(per_second, seconds, 2),
        daily_amount: money(per_second, i64::from(paid_minutes) * 60, 2),
        hourly_amount: money(per_second, 3600, 2),
        secondly_amount: money(per_second, 1, 8),
        calculation_basis: salary.calculation_basis.clone(),
    })
}

pub fn normalize_salary(mut salary: Salary, schedule: &Schedule) -> Result<Salary, String> {
    // The fixed fields are legacy metadata only when calendar mode is selected.
    if salary.calculation_basis == "calendar" {
        salary.divisor_days = "21.75".into();
        let minutes = planned_paid_minutes(schedule)?;
        if minutes == 0 {
            return Err("NO_PAID_TIME".into());
        }
        salary.standard_paid_minutes = minutes;
    }
    rate(&salary)?;
    Ok(salary)
}

pub fn validate_schedule(schedule: &Schedule) -> Result<(), String> {
    schedule
        .timezone
        .parse::<Tz>()
        .map_err(|_| "INVALID_TIMEZONE")?;
    let start = parse_time(&schedule.shift_start)?;
    let end = parse_time(&schedule.shift_end)?;
    let minutes = end.num_seconds_from_midnight() as i64 / 60
        + schedule.end_day_offset as i64 * 1440
        - start.num_seconds_from_midnight() as i64 / 60;
    if schedule.end_day_offset > 1 || minutes <= 0 || minutes >= 1440 {
        return Err("INVALID_SHIFT".into());
    }
    if schedule.work_weekdays.is_empty()
        || schedule.work_weekdays.len() > 7
        || schedule.work_weekdays.iter().any(|d| !(1..=7).contains(d))
    {
        return Err("INVALID_WEEKDAYS".into());
    }
    let mut days = schedule.work_weekdays.clone();
    days.sort();
    days.dedup();
    if days.len() != schedule.work_weekdays.len()
        || schedule.breaks.len() > 8
        || schedule.exceptions.len() > 366
    {
        return Err("INVALID_SCHEDULE".into());
    }
    let mut intervals = Vec::new();
    for pause in &schedule.breaks {
        let end = pause
            .start_offset_minutes
            .checked_add(pause.duration_minutes)
            .ok_or("INVALID_BREAK")?;
        if pause.duration_minutes == 0 || end as i64 > minutes {
            return Err("INVALID_BREAK".into());
        }
        intervals.push((pause.start_offset_minutes, end));
    }
    intervals.sort();
    if intervals.windows(2).any(|pair| pair[0].1 > pair[1].0) {
        return Err("OVERLAPPING_BREAKS".into());
    }
    let mut dates = Vec::new();
    for exception in &schedule.exceptions {
        NaiveDate::parse_from_str(&exception.date, "%Y-%m-%d").map_err(|_| "INVALID_DATE")?;
        if dates.contains(&exception.date) {
            return Err("DUPLICATE_DATE".into());
        }
        dates.push(exception.date.clone());
    }
    Ok(())
}

fn local_utc(tz: Tz, value: NaiveDateTime, end: bool) -> Result<(DateTime<Utc>, bool), String> {
    match tz.from_local_datetime(&value) {
        LocalResult::Single(time) => Ok((time.with_timezone(&Utc), false)),
        LocalResult::Ambiguous(a, b) => Ok((
            (if end { a.max(b) } else { a.min(b) }).with_timezone(&Utc),
            true,
        )),
        LocalResult::None => Err("NONEXISTENT_LOCAL_TIME".into()),
    }
}

pub fn resolve_shift(rules: &Rules, date: NaiveDate) -> Result<Option<Shift>, String> {
    let schedule = &rules.schedule;
    let working = schedule
        .exceptions
        .iter()
        .find(|e| e.date == date.to_string())
        .map(|e| e.working)
        .unwrap_or_else(|| {
            schedule
                .work_weekdays
                .contains(&date.weekday().number_from_monday())
        });
    if !working {
        return Ok(None);
    }
    let tz: Tz = schedule.timezone.parse().map_err(|_| "INVALID_TIMEZONE")?;
    let start_local = date.and_time(parse_time(&schedule.shift_start)?);
    let end_local = (date + Duration::days(schedule.end_day_offset as i64))
        .and_time(parse_time(&schedule.shift_end)?);
    let (start, a) = local_utc(tz, start_local, false)?;
    let (end, b) = local_utc(tz, end_local, true)?;
    if end <= start {
        return Err("INVALID_SHIFT".into());
    }
    let mut warnings = Vec::new();
    if a || b {
        warnings.push("AMBIGUOUS_TIME_WARNING".into());
    }
    let mut breaks = Vec::new();
    for pause in &schedule.breaks {
        let begin_local = start_local + Duration::minutes(pause.start_offset_minutes as i64);
        let finish_local = begin_local + Duration::minutes(pause.duration_minutes as i64);
        let (begin, a) = local_utc(tz, begin_local, false)?;
        let (finish, b) = local_utc(tz, finish_local, true)?;
        if begin < start || finish > end || finish <= begin {
            return Err("INVALID_BREAK".into());
        }
        if a || b {
            warnings.push("AMBIGUOUS_TIME_WARNING".into());
        }
        breaks.push((begin, finish, pause.paid));
    }
    breaks.sort_by_key(|v| v.0);
    if breaks.windows(2).any(|p| p[0].1 > p[1].0) {
        return Err("OVERLAPPING_BREAKS".into());
    }
    let mut paid = Vec::new();
    let mut cursor = start;
    for &(begin, finish, is_paid) in &breaks {
        if !is_paid {
            if begin > cursor {
                paid.push((cursor, begin));
            }
            cursor = finish;
        }
    }
    if cursor < end {
        paid.push((cursor, end));
    }
    Ok(Some(Shift {
        id: format!("{}:{}", rules.id, date),
        start,
        end,
        paid,
        breaks,
        warnings,
    }))
}

pub fn paid_seconds(shift: &Shift, lower: DateTime<Utc>, upper: DateTime<Utc>) -> i64 {
    shift
        .paid
        .iter()
        .map(|(start, end)| {
            ((*end).min(upper) - (*start).max(lower))
                .num_seconds()
                .max(0)
        })
        .sum()
}

fn money(rate: Decimal, seconds: i64, places: u32) -> String {
    let value = rate * Decimal::from(seconds);
    let mut rounded = value.round_dp_with_strategy(places, RoundingStrategy::MidpointAwayFromZero);
    rounded.rescale(places);
    rounded.to_string()
}

fn utc(value: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|v| v.with_timezone(&Utc))
        .map_err(|_| "INVALID_STATE".into())
}

pub fn snapshot(config: &Config, now: DateTime<Utc>) -> Result<Snapshot, String> {
    let mut result = Snapshot::empty(config, "UNCONFIGURED");
    result.generated_at_utc = now.to_rfc3339();
    let Some(current) = config
        .rules
        .iter()
        .rfind(|r| utc(&r.effective_from_utc).is_ok_and(|t| t <= now))
    else {
        return Ok(result);
    };
    let tz: Tz = current
        .schedule
        .timezone
        .parse()
        .map_err(|_| "INVALID_TIMEZONE")?;
    let date = now.with_timezone(&tz).date_naive();
    let day_start = local_utc(tz, date.and_hms_opt(0, 0, 0).ok_or("INVALID_DATE")?, false)?.0;
    let day_end = local_utc(
        tz,
        (date + Duration::days(1))
            .and_hms_opt(0, 0, 0)
            .ok_or("INVALID_DATE")?,
        true,
    )?
    .0;
    let tracking = config
        .tracking_started_at_utc
        .as_deref()
        .map(utc)
        .transpose()?
        .unwrap_or(now);
    let mut today = Decimal::ZERO;
    let mut active: Option<(Shift, &Rules)> = None;
    let mut ended: Option<(Shift, &Rules)> = None;
    let mut next_start: Option<DateTime<Utc>> = None;
    result.status = "OFF_DAY".into();
    result.local_date = date.to_string();
    result.timezone = tz.to_string();
    result.currency = current.salary.currency.clone();
    for (index, rules) in config.rules.iter().enumerate() {
        let from = utc(&rules.effective_from_utc)?;
        let until = config
            .rules
            .get(index + 1)
            .map(|r| utc(&r.effective_from_utc))
            .transpose()?;
        let rule_tz: Tz = rules
            .schedule
            .timezone
            .parse()
            .map_err(|_| "INVALID_TIMEZONE")?;
        let base = now.with_timezone(&rule_tz).date_naive();
        for offset in -1..=8 {
            let shift_date = base + Duration::days(offset);
            let shift = match resolve_shift(rules, shift_date) {
                Ok(Some(s)) => s,
                Ok(None) => continue,
                Err(error) if offset <= 0 => {
                    result.warnings.push(error);
                    continue;
                }
                Err(_) => continue,
            };
            // Rule selection is by shift start. A future rule must not overlap an admitted old shift.
            if shift.start < from || until.is_some_and(|t| shift.start >= t) {
                continue;
            }
            let seconds = paid_seconds(&shift, tracking.max(day_start), now.min(day_end));
            if seconds > 0 {
                if rules.salary.currency != current.salary.currency {
                    return Err("MIXED_CURRENCY".into());
                }
                today += rate_for_shift(rules, shift_date)? * Decimal::from(seconds);
            }
            if shift.start <= now && now < shift.end {
                active = Some((shift, rules));
            } else if shift.end <= now
                && shift.end > day_start
                && ended.as_ref().is_none_or(|(s, _)| shift.end > s.end)
            {
                ended = Some((shift, rules));
            } else if shift.start > now {
                next_start = Some(next_start.map_or(shift.start, |s| s.min(shift.start)));
            }
        }
    }
    result.seconds_until_next_shift = next_start.map(|s| (s - now).num_seconds());
    let display = active.or(ended);
    if let Some((shift, rules)) = display {
        result.status = if now >= shift.end {
            "AFTER_SHIFT".into()
        } else if let Some((_, _, paid)) =
            shift.breaks.iter().find(|(a, b, _)| *a <= now && now < *b)
        {
            if *paid { "PAID_BREAK" } else { "UNPAID_BREAK" }.into()
        } else {
            "WORKING".into()
        };
        result.paid_seconds = paid_seconds(&shift, tracking, now);
        result.estimated_shift_amount = Some(money(
            rate_for_shift(rules, shift.start.with_timezone(&tz).date_naive())?,
            result.paid_seconds,
            config.preferences.decimal_places,
        ));
        result.seconds_until_clock_out = Some((shift.end - now).num_seconds().max(0));
        result.shift_progress = ((now - shift.start).num_seconds() as f64
            / (shift.end - shift.start).num_seconds() as f64)
            .clamp(0.0, 1.0);
        result.shift_id = Some(shift.id);
        result.shift_end_utc = Some(shift.end.to_rfc3339());
        result.warnings.extend(shift.warnings);
    } else if next_start.is_some_and(|s| s.with_timezone(&tz).date_naive() == date) {
        result.status = "BEFORE_SHIFT".into();
    }
    let mut rounded = today.round_dp_with_strategy(
        config.preferences.decimal_places,
        RoundingStrategy::MidpointAwayFromZero,
    );
    rounded.rescale(config.preferences.decimal_places);
    result.estimated_today_amount = Some(rounded.to_string());
    if result.salary_hidden {
        result.estimated_today_amount = None;
        result.estimated_shift_amount = None;
    }
    result.warnings.sort();
    result.warnings.dedup();
    if result.status == "OFF_DAY"
        && result
            .warnings
            .iter()
            .any(|code| code == "NONEXISTENT_LOCAL_TIME")
    {
        result.status = "ERROR".into();
    }
    Ok(result)
}

pub fn validate_config(config: &Config) -> Result<(), String> {
    if ![1, 2].contains(&config.schema_version) {
        return Err("UNSUPPORTED_FORMAT".into());
    }
    let p = &config.preferences;
    if !["system", "zh-CN", "en-US"].contains(&p.language.as_str())
        || !["system", "light", "dark"].contains(&p.theme.as_str())
        || ![2, 4].contains(&p.decimal_places)
        || p.nickname.chars().count() > 40
    {
        return Err("INVALID_PREFERENCES".into());
    }
    parse_time(&p.quiet_start)?;
    parse_time(&p.quiet_end)?;
    if p.quiet_enabled && p.quiet_start == p.quiet_end {
        return Err("INVALID_QUIET_HOURS".into());
    }
    if p.floating_position
        .is_some_and(|pos| pos.iter().any(|v| !v.is_finite() || v.abs() > 100_000.0))
    {
        return Err("INVALID_POSITION".into());
    }
    if config.rules.len() > 16 {
        return Err("TOO_MANY_RULES".into());
    }
    if !config.rules.is_empty() && config.tracking_started_at_utc.is_none() {
        return Err("INVALID_STATE".into());
    }
    if let Some(start) = &config.tracking_started_at_utc {
        utc(start)?;
    }
    let mut previous = None;
    let mut ids = Vec::new();
    for rules in &config.rules {
        if rules.id.is_empty() || rules.id.len() > 80 || ids.contains(&rules.id) {
            return Err("INVALID_STATE".into());
        }
        ids.push(rules.id.clone());
        rate(&rules.salary)?;
        validate_schedule(&rules.schedule)?;
        let from = utc(&rules.effective_from_utc)?;
        if previous.is_some_and(|t| t >= from) {
            return Err("INVALID_STATE".into());
        }
        previous = Some(from);
    }
    Ok(())
}

pub fn initial_times(
    salary: &Salary,
    schedule: &Schedule,
    now: DateTime<Utc>,
    from_shift: bool,
) -> Result<(DateTime<Utc>, DateTime<Utc>), String> {
    let tz: Tz = schedule.timezone.parse().map_err(|_| "INVALID_TIMEZONE")?;
    let date = now.with_timezone(&tz).date_naive();
    let midnight = local_utc(tz, date.and_hms_opt(0, 0, 0).ok_or("INVALID_DATE")?, false)?.0;
    let candidate = Rules {
        id: "initial".into(),
        effective_from_utc: midnight.to_rfc3339(),
        salary: salary.clone(),
        schedule: schedule.clone(),
    };
    for anchor in [date - Duration::days(1), date] {
        if let Some(shift) = resolve_shift(&candidate, anchor)? {
            if shift.start <= now && now < shift.end {
                let effective = midnight.min(shift.start);
                return Ok((effective, if from_shift { shift.start } else { now }));
            }
        }
    }
    Ok((midnight, if from_shift { midnight } else { now }))
}

pub fn next_effective(
    config: &Config,
    schedule: &Schedule,
    currency: &str,
    now: DateTime<Utc>,
) -> Result<DateTime<Utc>, String> {
    let tz: Tz = schedule.timezone.parse().map_err(|_| "INVALID_TIMEZONE")?;
    let old = config
        .rules
        .iter()
        .rfind(|r| utc(&r.effective_from_utc).is_ok_and(|t| t <= now))
        .ok_or("INVALID_STATE")?;
    if old.schedule.timezone != schedule.timezone {
        return Err("TIMEZONE_RESET_REQUIRED".into());
    }
    let base = now.with_timezone(&tz).date_naive();
    let candidate_rules = Rules {
        id: "candidate".into(),
        effective_from_utc: now.to_rfc3339(),
        salary: old.salary.clone(),
        schedule: schedule.clone(),
    };
    // Start after a full future midnight. Old shifts admitted before the boundary are also checked.
    for offset in 1..=366 {
        let date = base + Duration::days(offset);
        let boundary = local_utc(tz, date.and_hms_opt(0, 0, 0).ok_or("INVALID_DATE")?, false)?.0;
        let Some(new_shift) = resolve_shift(&candidate_rules, date)? else {
            continue;
        };
        let mut safe = true;
        for old_date in [date - Duration::days(1), date] {
            if let Some(shift) = resolve_shift(old, old_date)? {
                if shift.start < boundary
                    && (shift.end > new_shift.start
                        || (old.salary.currency != currency && shift.end > boundary))
                {
                    safe = false;
                }
            }
        }
        if safe {
            return Ok(boundary);
        }
    }
    Err("NO_SAFE_EFFECTIVE_DATE".into())
}
