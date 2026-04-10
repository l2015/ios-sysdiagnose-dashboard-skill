# iPhone Sysdiagnose Analyzer

![版本](https://img.shields.io/badge/版本-0.2.20c-blue) ![许可证](https://img.shields.io/badge/许可证-MIT-green) ![OpenClaw Skill](https://img.shields.io/badge/OpenClaw-Skill-orange) ![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)

分析 Apple 设备 sysdiagnose 诊断归档文件，提取电池健康、闪存状态、应用使用、崩溃日志等数据，生成自包含的 HTML 报告。**OpenClaw Skill · Node.js CLI · 跨平台**。

> 📖 English → [`README.md`](README.md)

---

## 快速开始

**一键脚本**（推荐）
```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git
cd ios-sysdiagnose-dashboard-skill
bash analyze.sh your-sysdiagnose.tar.gz
```

报告输出：`report-<日期>.html`

**手动分步**
```bash
cd scripts && npm install
node extract.mjs <解压后的sysdiagnose目录> -o data.json
node report.mjs data.json -o report.html
```

## 环境要求

- Node.js 18+
- 零原生依赖，纯 JavaScript（sql.js）

## 功能

| 模块 | 分析内容 |
|------|---------|
| 🔋 电池 | 健康百分比、充电循环、容量衰减、温度趋势 |
| 💾 NAND | 剩余寿命、PE 擦写次数、坏块、写入放大系数 |
| 📱 应用 | 存储写入、亮屏时间、内存峰值、网络流量 |
| 💥 崩溃 | Jetsam 内存回收、Safari 崩溃、磁盘写入、CPU 资源 |
| 📡 设备 | 型号、SoC、磁盘容量、基带版本 |

支持 iPhone / iPad / Watch / Vision Pro。报告自动检测中英文。

## 作为 OpenClaw Skill 使用

安装后，用户只需上传 sysdiagnose 文件，AI 自动完成：

1. 解压归档
2. 提取数据（PowerLog + ASP SMART + 崩溃日志）
3. 生成 HTML 报告

### 安装

```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git ~/.openclaw/skills/ios-sysdiagnose-dashboard-skill
cd ~/.openclaw/skills/ios-sysdiagnose-dashboard-skill/scripts && npm install
```

## 项目结构

```
├── analyze.sh               # 一键分析脚本
├── SKILL.md                 # OpenClaw Skill 定义
├── _meta.json               # ClawHub 元数据
├── package.json
├── LICENSE
├── scripts/
│   ├── extract.mjs          # 数据提取
│   └── report.mjs           # HTML 报告生成
└── references/
    └── features.md          # 功能清单
```

## 版本

当前版本：**v0.2.20c** — `analyze.sh` 一键脚本，电量趋势默认 24h

详细更新历史 → [`CHANGELOG.md`](CHANGELOG.md)

---

## 许可证

MIT
