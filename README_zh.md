# iPhone Sysdiagnose Analyzer

![版本](https://img.shields.io/badge/版本-0.3.1-blue) ![许可证](https://img.shields.io/badge/许可证-MIT-green) ![PWA](https://img.shields.io/badge/PWA-ready-purple) ![离线](https://img.shields.io/badge/离线-100%25-yellow) ![平台](https://img.shields.io/badge/平台-浏览器-lightgrey)

分析 Apple 设备 sysdiagnose 诊断归档，生成交互式 HTML 报告。**无需服务器、纯浏览器运行、支持 PWA 安装到桌面**。

---

## 快速开始

**方式一 · GitHub Pages**（推荐，无需下载）
> 访问 [l2015.github.io/ios-sysdiagnose-dashboard-skill](https://l2015.github.io/ios-sysdiagnose-dashboard-skill)，拖入 `.tar.gz` 即可

**方式二 · 下载到本地**
```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git
# 或 Download ZIP → 解压
# 双击打开 index.html，拖入 .tar.gz
```

**方式三 · 安装 PWA**（离线可用，可添加到桌面/主屏幕）
> 在浏览器打开 index.html 后，点击地址栏的安装图标 → 桌面应用

---

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

---

## 项目结构

```
├── index.html               # 入口（拖入 .tar.gz 即可，build 产物，勿手动修改）
├── manifest.json            # PWA manifest
├── sw.js                    # Service Worker（离线缓存）
├── lib/                     # 浏览器依赖（pako / sql.js / WASM）
├── icons/                   # PWA 图标
├── SKILL.md                 # OpenClaw Skill 定义
└── references/
    └── features.md          # 功能清单
```

> PWA 安装后可在无网络环境下使用。所有数据处理在本地完成，不上传任何内容。

---

## 版本

当前版本：**v0.3.1** — 内存安全采样（iPhone Safari / PWA 大数据量 OOM 修复）

详细更新历史 → [`CHANGELOG.md`](CHANGELOG.md)

---

## 许可证

MIT
