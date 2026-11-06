# Salary Pulse · 上班鼓励器

[English](README.en.md)

一款 Apple Silicon Mac 的离线桌面鼓励器：实时估算收入、下班倒计时、原创机器人互动、菜单栏与桌面小窗。同一应用可切换简体中文和英文，薪资只保存在用户本机，不需要数据库或账号。

## 当前状态

`v0.1.0` 私有本地版。尚未发版，迭代期间版本号固定为 0.1.0，安装包直接更新，不另存回退版本。只在自己的 Apple Silicon Mac 构建、安装和使用，不需要 Apple Developer 账号/证书、公证凭据、GitHub 登录、API Key 或云服务。构建工具自动使用无需证书的 ad-hoc 签名；未进行 Apple 公证，不代表公开分发安装体验已验证。

最低构建目标 macOS 13；已在 Apple Silicon macOS 27.0.1 构建及启动。其他系统版本、合盖、登录自启和长期常驻仍需实机测试。详细范围见 [落地状态](docs/IMPLEMENTATION_STATUS.md)。

## 安装

本地打包结果位于 `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`，文件名为 `Salary Pulse_0.1.0_aarch64.dmg`。

打开自己本机生成的 DMG，将 `Salary Pulse.app` 拖入“应用程序”，打开后填写薪资和排班即可使用。安装后不需要开发环境或网络；更新时替换应用，保留本地配置。不上传 GitHub Releases、不自动发布。若以后改变需求、在网络上给其他人分发，再单独评估签名公证；来源和 quarantine 状态可能触发 macOS 安全提示，不建议关闭系统保护。

## 自动联动

- 新配置默认按当月排班统计工作日，月薪自动折算到日薪、时薪和每秒收入。
- 每日有薪时长由上班、下班和无薪休息自动计算；休息开始/结束自动换算分钟数。
- 改工作日、调休例外、薪资或休息安排，折算预览自动更新；跨月按新月份日历自动计算，无需重新填写。
- 上下班时间自动识别跨夜，休息时间在调整班次时保留原钟点或给出班次内建议，时区自动读取 Mac。
- 切换月薪/时薪时将已有金额按当前预览换算，不把月薪数字误当成时薪。币种不会自动换汇。
- `21.75` 等旧折算参数仅在高级设置中保留。旧配置缺少 `calculationBasis` 时按固定模式读取，不改变已有费率；可主动选择自动模式。

## 开发

需要 Node.js 24、Rust stable 和 Xcode Command Line Tools。

```bash
npm ci
npm run desktop:dev
```

仅预览浏览器界面：`npm run dev`，地址通常为 `http://127.0.0.1:1420`。浏览器是明确标记的演示模式，金额为虚构固定数据，不验证 Mac 原生能力。

构建 Apple Silicon DMG：

```bash
npm run desktop:build
```

当前机器的 Rust 工具链安装在忽略的 `.toolchains/` 中，脚本会自动使用；其他开发者可以使用自己的全局 Rust。`.toolchains/`、安装包、个人配置和 `target/` 不进入 Git。

## 质量检查

```bash
npm run check:locales
npm run test
npm run build
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

使用项目私有 Rust 时，先将 `.toolchains/cargo/bin` 加入 PATH，并将 `CARGO_HOME` / `RUSTUP_HOME` 指向对应项目目录。

## 计算与隐私

- 默认月薪每秒费率 = 薪资 ÷ 当月完整排班有薪秒数；当月工作日、日期例外和无薪休息自动参与分母。完整月预算等于输入月薪，但月中启用或改薪只累计生效后的时段，不补造历史。
- 跨午夜班次按开始日期所属月份确定费率，今日金额按自然日拆分。没有任何有薪时间时提示修正，不除零。固定模式的 21.75 是个人估算参数，不是工资结算规则。
- 无薪休息暂停金额增长，倒计时继续；隐藏窗口、合盖或退出后再次打开按时间重算，不按定时器次数累加。
- 修改薪资和排班从安全的后续日期生效，不追溯重算今天；不自动换汇，已配置时区变更需重新设置。
- 配置放在 `~/Library/Application Support/com.yuzhenhai.salarypulse/` 中的 JSON 文件。没有云同步、行为监控、广告或遥测。
- 本地配置为明文；隐藏金额只是显示保护，不是文件加密或防截屏。
- 删除 `.app` 不会自动删除个人配置。应用设置中可打开本地目录或明确删除个人数据。
- 通知只在程序运行时尝试发送，系统专注模式和通知设置可能限制投递，不在通知里显示薪资。

## 文档与许可

[技术框架](docs/TECH_FRAMEWORK.md) · [实际落地状态](docs/IMPLEMENTATION_STATUS.md) · [第三方声明](THIRD_PARTY_NOTICES.md)

Apache-2.0。角色与图标为本项目原创资源；本次不进行对外发布，也不配置发布凭据。
