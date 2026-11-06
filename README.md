# Salary Pulse · 上班鼓励器

[English](README.en.md) · [下载最新版](https://github.com/yuzhenhai0808/salary-pulse/releases/latest)

一款 Apple Silicon Mac 的离线桌面鼓励器：看收入一点点增长、距离下班一点点缩短。简体中文和英文随时切换，薪资只保存在你的本机。

## 下载安装

1. 在 [Releases](https://github.com/yuzhenhai0808/salary-pulse/releases/latest) 下载 `SalaryPulse_0.1.0_macos_arm64.dmg`，不要下载源码压缩包。
2. 打开 DMG，将 `Salary Pulse.app` 拖入“应用程序”。
3. 打开应用，填写薪资与排班，开始使用。无需 Node.js、Rust、账号、API Key 或数据库。

支持 M 系列芯片 Mac；最低构建目标 macOS 13，已在 macOS 27.0.1 构建运行，macOS 13 实机尚未验证。不支持 Intel Mac 或 Windows。

**首次打开提醒：** v0.1.0 使用 ad-hoc 签名，未经过 Apple Developer ID 签名和公证。从 GitHub 下载后 macOS 可能阻止首次打开。确认来源为本仓库并核对 Release 校验和后，可按系统提供的单应用“隐私与安全性 → 仍要打开”流程操作；不同 macOS 版本提示可能不同。不需要全局关闭 Gatekeeper 或其他系统保护。此版本不能保证下载后无警告双击运行。

## 功能

- 按月薪或时薪，自动折算日薪、时薪和每秒收入；工作日、休息时间和日期例外联动。
- 今日收入估算、下班倒计时、自动识别夜班、原创机器人互动与鼓励语。
- 菜单栏常驻、桌面小窗、金额隐藏、深浅外观、可选下班提醒与登录自启。
- 同一安装包包含中文与英文，语言选择保存在本机。

## 本地数据与计算

配置保存于 `~/Library/Application Support/com.yuzhenhai.salarypulse/` 的 JSON 文件，不上传薪资、没有遥测或工作行为监控。文件为明文；隐藏金额不是文件加密或防截屏。删除应用不自动删除配置，可在设置页打开目录或确认删除个人数据。

收入是按个人排班估算，不是实际到账或工资凭证。默认按当月完整有薪排班分摊月薪；首次开始时间保持不变。修改薪资/排班并保存后立即生效，按新设置重算今日收入和倒计时；没有未来生效计划，不自动换汇。提醒仅在应用运行时尝试发送，可能受到系统通知设置和专注模式限制。

## 从源码构建

开发需要 Node.js 24、Rust stable、Xcode Command Line Tools：

```bash
npm ci
npm run desktop:dev
```

打包 Apple Silicon DMG：`npm run desktop:build`。产物在 `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`。`npm run dev` 是浏览器演示，固定虚构金额，不等同于原生计薪。

## 许可

[Apache-2.0](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md)。角色与图标为本项目原创资源。
