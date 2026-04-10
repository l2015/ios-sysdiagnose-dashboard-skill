---
name: ios-sysdiagnose-dashboard-skill
version: 0.2.20c
description: >
  Analyze iPhone sysdiagnose (.tar.gz) diagnostic archives. Extracts battery health (cycle count,
  capacity, trend), NAND flash SMART data (lifespan, writes, reads, bad blocks, PE cycles, WAF),
  app metrics (screen time, NAND writes, memory, network), crash logs (Jetsam, Safari, disk writes, CPU),
  app exit analysis (Jetsam kill ranking), and device info. Generates a self-contained Apple HIG-style
  dark theme HTML report with interactive charts and Chinese/English i18n.
  Triggers (satisfy ANY one):
  - User provides a sysdiagnose .tar.gz file
  - User asks about iPhone/iPad diagnostics, battery health, storage analysis
  - User wants an iOS device health report
  - User mentions app crashes, memory pressure, Jetsam events
  - User asks about NAND flash lifespan or storage wear
metadata:
  openclaw:
    emoji: "📱"
    requires:
      node: ">=18"
---

<!--
  language: en | zh
  default: en
-->

## What is this?

This skill extracts structured data from iPhone/iPad sysdiagnose archives (.tar.gz) and generates an
interactive HTML report covering:

- **Battery** — health %, cycle count, capacity trend, temperature, voltage
- **NAND Flash** — SMART data, lifespan %, host/NAND read-write, PE cycles, bad blocks, WAF
- **Apps** — screen time, NAND writers, energy, CPU, memory, network, GPS usage
- **Crashes** — Jetsam, Safari, disk writes, CPU resource events
- **App Exits** — Jetsam kill ranking per app
- **Device** — model, SoC, disk, baseband version

Report uses Apple HIG dark theme with interactive charts and auto i18n (Chinese/English).

## Installation

```bash
npx skills add l2015/ios-sysdiagnose-dashboard-skill@ios-sysdiagnose-dashboard-skill -g -y
```

## Setup (one-time)

```bash
cd scripts && npm install
```

## Pipeline

### 1. Extract archive

```bash
WORK=$(mktemp -d)
tar xzf "<input>.tar.gz" -C "$WORK"
BASE=$(find "$WORK" -maxdepth 1 -type d -name "sysdiagnose_*" | head -1)
```

### 2. Extract structured data

```bash
node scripts/extract.mjs "$BASE" -o data.json
```

### 3. Generate HTML report

```bash
node scripts/report.mjs data.json -o ~/.openclaw/workspace/iphone-report.html
```

### 4. Cleanup

```bash
rm -rf "$WORK"
```

## Quick One-Liner

```bash
WORK=$(mktemp -d) && tar xzf "<input>.tar.gz" -C "$WORK" && BASE=$(find "$WORK" -maxdepth 1 -type d | head -1) && node scripts/extract.mjs "$BASE" -o /tmp/sd-data.json && node scripts/report.mjs /tmp/sd-data.json -o ~/.openclaw/workspace/iphone-report.html && rm -rf "$WORK"
```

## Tool Selection: Three-Layer Strategy

| Scenario | Use | Reason |
|----------|------|--------|
| **AI analyzes for user** (most common) | **This skill** | AI handles all steps automatically |
| Pure browser, no install | `browser-app` branch | Open `index.html`, drag in .tar.gz |
| PWA, offline-capable | `pwa` branch | Works without internet, installable |
| Just extract raw JSON | `node scripts/extract.mjs` | CLI-only, no report |

## Notes

- App names auto-translated for Chinese devices (e.g., `com.taobao.fleamarket` → 淘宝)
- Language auto-detected from app bundle IDs
- NAND vendor/model not available in customer sysdiagnose (Apple internal only)
- Cumulative stats (uptime, Jetsam kills) since last "Erase All Content"

---

## 🀄 中文说明

> **Language: English above / 中文说明见下**

##这是什么？

这个 Skill 从 iPhone/iPad 的 sysdiagnose 归档（.tar.gz）中提取结构化数据，生成涵盖以下内容的交互式 HTML 报告：

- **电池** — 健康度、循环次数、容量趋势、温度、电压
- **NAND 闪存** — SMART 数据、剩余寿命、读写量、PE 循环次数、坏块、WAF
- **应用** — 屏幕时间、NAND 写入量、能耗、CPU、内存、网络、GPS 使用情况
- **崩溃** — Jetsam、Safari、磁盘写入、CPU 资源事件
- **应用退出** — 按应用分组的 Jetsam 杀进程排名
- **设备** — 型号、SoC、闪存、基带版本

报告采用 Apple HIG 暗色主题，带交互图表，自动中英双语。

## 安装

```bash
npx skills add l2015/ios-sysdiagnose-dashboard-skill@ios-sysdiagnose-dashboard-skill -g -y
```

## 一次性配置

```bash
cd scripts && npm install
```

## 处理流程

### 1. 解压归档

```bash
WORK=$(mktemp -d)
tar xzf "<输入文件>.tar.gz" -C "$WORK"
BASE=$(find "$WORK" -maxdepth 1 -type d -name "sysdiagnose_*" | head -1)
```

### 2. 提取结构化数据

```bash
node scripts/extract.mjs "$BASE" -o data.json
```

### 3. 生成 HTML 报告

```bash
node scripts/report.mjs data.json -o ~/.openclaw/workspace/iphone-report.html
```

### 4. 清理

```bash
rm -rf "$WORK"
```

## 快速一条命令

```bash
WORK=$(mktemp -d) && tar xzf "<输入文件>.tar.gz" -C "$WORK" && BASE=$(find "$WORK" -maxdepth 1 -type d | head -1) && node scripts/extract.mjs "$BASE" -o /tmp/sd-data.json && node scripts/report.mjs /tmp/sd-data.json -o ~/.openclaw/workspace/iphone-report.html && rm -rf "$WORK"
```

## 工具选择策略

| 场景 | 推荐 | 原因 |
|------|------|------|
| **AI 自动为用户分析**（最常用） | **本 Skill** | AI 全自动处理 |
| 纯浏览器，无需安装 | `browser-app` 分支 | 打开 `index.html`，拖入 .tar.gz 即可 |
| PWA，离线可用 | `pwa` 分支 | 无网络也可使用，可安装到桌面 |
| 仅提取 JSON 数据 | `node scripts/extract.mjs` | 仅 CLI，不生成报告 |

## 注意事项

- 应用名称自动汉化（如 `com.taobao.fleamarket` → 淘宝）
- 语言根据应用包 ID 自动检测
- NAND 厂商/型号在客户版 sysdiagnose 中不可用（Apple 内部数据）
- 统计为累计值（上次"抹掉所有内容和设置"至今）
