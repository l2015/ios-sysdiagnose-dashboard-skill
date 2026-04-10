# iPhone Sysdiagnose Analyzer

![版本](https://img.shields.io/badge/版本-0.2.20c-blue) ![许可证](https://img.shields.io/badge/许可证-MIT-green) ![OpenClaw Skill](https://img.shields.io/badge/OpenClaw-Skill-orange) ![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)

分析 Apple 设备 sysdiagnose（.tar.gz）诊断归档，提取电池健康、闪存状态、应用使用、崩溃日志等数据，生成交互式 HTML 报告。

> 📖 English → [`README.md`](README.md)

---

## ⚡ 快速开始

上传你的 sysdiagnose 文件 — **AI 自动完成全部工作**（推荐）：

```
# 告诉 OpenClaw："分析我的 sysdiagnose 文件"
```

OpenClaw 自动安装 Skill、提取数据、生成报告。无需手动配置。

---

## 🖥️备选：浏览器打开（无需安装）

不想用命令行？直接在浏览器里打开分析：

```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git
# 打开 browser-app/index.html，将 .tar.gz 文件拖入即可
```

**browser-app** 分支 = 同一分析引擎，纯浏览器运行，无需 Node.js。

---

## 💻 手动 CLI（高级用户）

### 环境要求

- Node.js 18+
- bash（Linux / macOS / WSL）
- 无原生依赖

### 一键脚本

```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git
cd ios-sysdiagnose-dashboard-skill
bash analyze.sh your-sysdiagnose.tar.gz
```

报告输出：`report-<日期>.html`

### 手动分步

```bash
# 安装依赖
cd scripts && npm install && cd ..

# 第一步：解压归档
tar xzf your-sysdiagnose.tar.gz -C /tmp
BASE=$(find /tmp/sysdiagnose_* -maxdepth 1 -type d | head -1)

# 第二步：提取结构化数据
node scripts/extract.mjs "$BASE" -o data.json

# 第三步：生成 HTML 报告
node scripts/report.mjs data.json -o report.html
```

---

## ✅ 功能

| 模块 | 分析内容 |
|------|---------|
| 🔋 电池 | 健康百分比、充电循环、容量衰减、温度趋势 |
| 💾 NAND | 剩余寿命、PE 擦写次数、坏块、写入放大系数 |
| 📱 应用 | 存储写入、亮屏时间、内存峰值、网络流量 |
| 💥 崩溃 | Jetsam 内存回收、Safari 崩溃、磁盘写入、CPU 资源 |
| 📡 设备 | 型号、SoC、磁盘容量、基带版本 |

支持 iPhone / iPad / Watch / Vision Pro。报告自动检测中英文。

## 分支说明

| 分支 | 类型 | 适用场景 |
|------|------|---------|
| `master`（默认） | Node.js CLI | 开发者、Linux 服务器、自动化 |
| `browser-app` | 纯浏览器单文件 | 快速浏览器分析，无需配置 |
| `pwa` | PWA（离线可用） | 最佳体验，可安装为应用 |

---

## 版本

当前版本：**v0.2.20c** — `analyze.sh` 一键脚本，电量趋势默认 24h

详细更新历史 → [`CHANGELOG.md`](CHANGELOG.md)

---

## 许可证

MIT
