---
name: ios-sysdiagnose-dashboard-skill
version: 0.3.1
description: >
  Analyze iPhone sysdiagnose (.tar.gz) diagnostic archives. PWA version: installable, works offline,
  drag-and-drop in browser. Extracts battery health (cycle count, capacity, trend), NAND flash SMART
  data (lifespan, PE cycles, WAF), app metrics (screen time, NAND writes, memory, network), crash logs
  (Jetsam, Safari, disk writes, CPU), app exit analysis (Jetsam kill ranking), and device info.
  Generates an Apple HIG-style dark theme HTML report with interactive charts and Chinese/English i18n.
  Triggers (satisfy ANY one):
  - User provides a sysdiagnose .tar.gz file
  - User asks about iPhone/iPad diagnostics, battery health, storage analysis
  - User wants an iOS device health report
  - User mentions app crashes, memory pressure, Jetsam events
  - User asks about NAND flash lifespan or storage wear
metadata:
  openclaw:
    emoji: "📱"
---

<!--
  language: en | zh
  default: en
-->

## What is this?

This is the **PWA version** — installable, works offline, best UX. Runs entirely in the browser.
Open the page once, install it like an app, then analyze .tar.gz files anytime, even without internet.

Extracts the same data as the CLI version:

- **Battery** — health %, cycle count, capacity trend, temperature, voltage
- **NAND Flash** — SMART data, lifespan %, PE cycles, bad blocks, WAF
- **Apps** — screen time, NAND writers, energy, CPU, memory, network, GPS usage
- **Crashes** — Jetsam, Safari, disk writes, CPU resource events
- **App Exits** — Jetsam kill ranking per app
- **Device** — model, SoC, disk, baseband version

Report uses Apple HIG dark theme with interactive charts and auto i18n (Chinese/English).

## Installation

```bash
npx skills add l2015/ios-sysdiagnose-dashboard-skill@ios-sysdiagnose-dashboard-skill -g -y
```

## Setup

No setup required. Open in browser and optionally install as PWA:

```bash
# macOS
open index.html

# Linux
xdg-open index.html

# Windows
start index.html
```

**Install as PWA** (for offline use): Open the page, then click the install icon in your browser's
address bar. The app will appear on your desktop/home screen and work without internet.

## Tool Selection: Three-Layer Strategy

| Scenario | Use | Reason |
|----------|------|--------|
| **AI analyzes for user** (most common) | `master` branch skill | AI handles all steps automatically |
| Quick browser, no install | `browser-app` branch | Drag-and-drop, zero setup |
| **PWA, offline-capable, installable** | **`pwa` (this branch)** | Best UX, works offline, desktop icon |
| Manual CLI, Node.js | `master` branch | `node scripts/extract.mjs` + `report.mjs` |

## Notes

- App names auto-translated for Chinese devices (e.g., `com.taobao.fleamarket` → 淘宝)
- Language auto-detected from app bundle IDs
- NAND vendor/model not available in customer sysdiagnose (Apple internal only)
- Cumulative stats (uptime, Jetsam kills) since last "Erase All Content"
- All processing happens locally in the browser — no data leaves your machine

---

## 🀄 中文说明

> **Language: English above / 中文说明见下**

## 这是什么？

这是 **PWA 版本**——可安装、离线可用、体验最佳。完全在浏览器中运行。打开一次页面后，像安装应用一样安装它，之后随时分析 .tar.gz 文件，即使没有网络也能使用。

提取与 CLI 版本相同的数据：

- **电池** — 健康度、循环次数、容量趋势、温度、电压
- **NAND 闪存** — SMART 数据、剩余寿命、PE 循环次数、坏块、WAF
- **应用** — 屏幕时间、NAND 写入量、能耗、CPU、内存、网络、GPS 使用情况
- **崩溃** — Jetsam、Safari、磁盘写入、CPU 资源事件
- **应用退出** — 按应用分组的 Jetsam 杀进程排名
- **设备** — 型号、SoC、闪存、基带版本

报告采用 Apple HIG 暗色主题，带交互图表，自动中英双语。

## 安装

```bash
npx skills add l2015/ios-sysdiagnose-dashboard-skill@ios-sysdiagnose-dashboard-skill -g -y
```

## 使用方法

无需安装。直接在浏览器中打开，并可选择安装为 PWA：

```bash
# macOS
open index.html

# Linux
xdg-open index.html

# Windows
start index.html
```

**安装为 PWA**（离线使用）：打开页面后，点击浏览器地址栏中的安装图标。应用会出现在桌面/主屏幕，即使没有网络也能使用。

## 工具选择策略

| 场景 | 推荐 | 原因 |
|------|------|------|
| **AI 自动为用户分析**（最常用） | `master` 分支 Skill | AI 全自动处理 |
| 快速浏览器，零安装 | `browser-app` 分支 | 拖入即用 |
| **PWA，离线可用，可安装** | **`pwa`（本分支）** | 最佳体验，支持离线 |
| 手动 CLI，Node.js | `master` 分支 | `node scripts/extract.mjs` + `report.mjs` |

## 注意事项

- 应用名称自动汉化（如 `com.taobao.fleamarket` → 淘宝）
- 语言根据应用包 ID 自动检测
- NAND 厂商/型号在客户版 sysdiagnose 中不可用（Apple 内部数据）
- 统计为累计值（上次"抹掉所有内容和设置"至今）
- 所有处理在浏览器本地完成——数据不会离开你的电脑
