# Salary Pulse

[简体中文](README.md)

An offline workday companion for Apple Silicon Mac, with estimated earnings, a clock-out countdown, an original animated robot, a menu-bar entry, and a desktop mini window. Simplified Chinese and English are included in the same app. No account, database, cloud sync, or work monitoring.

## Status

`v0.1.0` is a private local build for your own Apple Silicon Mac. Until a release is explicitly requested, development stays at 0.1.0 and replaces the same installer, without retaining rollback packages. No Apple Developer account, signing certificate, notarization credentials, GitHub login, API key, or cloud account is required. The build tool uses certificate-free ad-hoc signing. Public distribution is not part of the current scope.

The build targets macOS 13 or later. Building and process startup were checked on Apple Silicon macOS 27.0.1. Older macOS versions, sleep/wake behavior, login startup, and long-running resource use still need native testing. See [implementation status](docs/IMPLEMENTATION_STATUS.md).

## Install

The local DMG is built under `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/` as `Salary Pulse_0.1.0_aarch64.dmg`. Open the disk image, drag `Salary Pulse.app` to Applications, and configure your own salary and schedule.

The installed app needs no developer tools or network connection. Updates replace the app and preserve local settings. No Release is uploaded or published. If public distribution is requested later, review Developer ID signing and notarization separately. macOS security prompts can depend on provenance and quarantine status; do not disable system security protections.

## Linked Fields

New setups calculate monthly working days and paid time directly from the schedule. Salary, weekday, date-exception, and break changes update daily, hourly, and per-second previews automatically. Overnight shifts, break duration, and the Mac time zone are inferred. Switching pay periods converts the current amount using the preview; currencies are never automatically converted.

Legacy fixed-divisor settings remain available under Advanced Calculation and are preserved when loading existing configurations. The new calendar mode divides monthly salary by that month's total scheduled paid seconds. Mid-month setup or changes accrue only after the effective time; no past earnings are invented. Overnight shifts use the start date's month for their rate.

## Development

Requires Node.js 24, Rust stable, and Xcode Command Line Tools.

```bash
npm ci
npm run desktop:dev
npm run desktop:build
```

`desktop:build` produces an Apple Silicon DMG. The wrapper can use the ignored, project-local `.toolchains/` Rust installation on the current machine or a developer's normal global toolchain.

`npm run dev` provides a browser preview, normally at `http://127.0.0.1:1420`. Browser mode uses clearly marked, fixed fictional earnings, not a second salary engine or a test of native Mac features.

## Checks

```bash
npm run check:locales
npm run test
npm run build
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Privacy and Estimates

Salary and schedule settings are stored as local JSON under `~/Library/Application Support/com.yuzhenhai.salarypulse/`. The files are not encrypted. Hiding earnings protects the display only, not files or screen capture. Removing the app does not remove personal settings; use the explicit data deletion command in Settings when needed.

Monthly earnings default to automatic calendar-based paid-time calculations. Fixed divisors remain an explicit legacy option. This is not actual payroll, attendance tracking, or payment confirmation. Unpaid breaks pause earnings; the countdown continues. Salary and schedule changes start on a safe later date. Language does not change currency, time zone, or salary rules. There is no automatic currency conversion.

Notifications are attempted only while the app runs. macOS notification settings or Focus may limit delivery. Salary values never appear in reminders.

## License

Apache-2.0. Robot artwork and icon source are original project assets. See [third-party notices](THIRD_PARTY_NOTICES.md). This iteration is private local use, not a public release, and configures no publishing credentials.
