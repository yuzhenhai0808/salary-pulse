# Salary Pulse

[简体中文](README.md) · [Download](https://github.com/yuzhenhai0808/salary-pulse/releases/latest)

An offline workday companion for Apple Silicon Mac: estimated earnings, a clock-out countdown, an original robot, a menu-bar entry, and a desktop mini window. Chinese and English are included in the same app.

## Install

1. Download `SalaryPulse_0.1.0_macos_arm64.dmg` from [Releases](https://github.com/yuzhenhai0808/salary-pulse/releases/latest), not the source archive.
2. Open the disk image and drag `Salary Pulse.app` to Applications.
3. Open the app and enter your salary and schedule. No developer tools, account, API key, or database required.

Apple Silicon only. The minimum build target is macOS 13; it was built and run on macOS 27.0.1, not yet verified on macOS 13. Intel and Windows are unsupported.

**First launch:** v0.1.0 is ad-hoc signed, without Apple Developer ID signing or notarization. macOS may block a downloaded copy. After verifying this repository and the Release checksum, use the system's per-app Privacy & Security approval if available. Prompts vary by macOS version. Do not disable Gatekeeper globally. This release does not promise warning-free installation.

## Features

- Automatic daily, hourly, and per-second estimates from salary, working days, breaks, and date exceptions.
- Clock-out countdown, overnight shifts, original robot animation, and encouragement.
- Menu bar, mini window, earnings privacy, light/dark appearance, optional reminders and launch at login.
- Persistent Chinese/English switching, with all salary data stored locally.

## Privacy and Estimates

Settings are local JSON under `~/Library/Application Support/com.yuzhenhai.salarypulse/`. No salary upload, telemetry, or work monitoring. Files are not encrypted; hiding earnings protects the display only. Uninstalling does not delete settings; use the data deletion option when needed.

Earnings are estimates, not payment confirmation. Monthly salary is spread across the month's scheduled paid time. Mid-month setup accrues only effective intervals. Rule changes begin on a safe later date; there is no automatic currency conversion. Notifications are attempted only while the app runs and may be limited by macOS or Focus.

## Build from Source

Requires Node.js 24, Rust stable, and Xcode Command Line Tools:

```bash
npm ci
npm run desktop:dev
```

`npm run desktop:build` creates the Apple Silicon DMG under `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`. `npm run dev` is a browser demo with fixed fictional earnings, not the native calculation engine.

## License

[Apache-2.0](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md). Robot artwork and icon source are original project assets.
