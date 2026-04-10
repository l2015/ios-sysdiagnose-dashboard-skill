# iPhone Sysdiagnose Analyzer

![版本](https://img.shields.io/badge/版本-0.2.29-blue) ![许可证](https://img.shields.io/badge/许可证-MIT-green) ![平台](https://img.shields.io/badge/平台-浏览器-lightgrey) ![单文件](https://img.shields.io/badge/单HTML文件-blue)

分析 Apple 设备 sysdiagnose 诊断归档，生成交互式 HTML 报告。**纯浏览器运行 · 单 HTML 文件 · 无需服务器**。

> 📖 English → [`README.md`](README.md)

---

## 快速开始

```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git
# 或 Download ZIP → 解压
```

然后在浏览器中打开 `index.html`，将 `.tar.gz` 文件拖入即可。

报告输出：`report-<日期>.html`

## 环境要求

无需任何环境要求 — 完全在浏览器中运行，首次加载后可在离线环境下使用。

## 功能

| 模块 | 分析内容 |
|------|---------|
| 🔋 电池 | 健康百分比、充电循环、容量衰减、温度趋势 |
| 💾 NAND | 剩余寿命、PE 擦写次数、坏块、写入放大系数 |
| 📱 应用 | 存储写入、亮屏时间、内存峰值、网络流量 |
| 💥 崩溃 | Jetsam 内存回收、Safari 崩溃、磁盘写入、CPU 资源 |
| 📡 设备 | 型号、SoC、磁盘容量、基带版本 |

支持 iPhone / iPad / Watch / Vision Pro。报告自动检测中英文。

完整可分析项目清单 → [`references/features.md`](references/features.md)

## 项目结构

```
├── index.html               # 单文件浏览器应用（拖入 .tar.gz 即可）
├── references/
│   └── features.md          # 功能清单
├── SKILL.md                 # OpenClaw Skill 定义
├── _meta.json               # ClawHub 元数据
└── package.json
```

> 所有数据处理在本地浏览器完成，不上传任何内容。

## 版本

当前版本：**v0.2.29** — 纯浏览器单文件版

详细更新历史 → [`CHANGELOG.md`](CHANGELOG.md)

---

## 许可证

MIT
