# Changelog

## [v0.3.1] — 2026-04-10

**内存采样修复**

- 修复 iPhone Safari Large Rendered Document / PWA 数据量大（>200MB）导致浏览器 OOM 崩溃
- 改用 interval sampling + 精度自适应，避免内存溢出

## [v0.3.0] — 2026-04-08

**PWA 支持**

- 支持安装到桌面 / 主屏幕，离线可用
- 外部依赖（pako / sql.js / WASM）本地化，零网络依赖
- 新增 GitHub Pages 配置（`404.html`、`.nojekyll`）

## [v0.2.29] — 2026-04-08

**清理 CLI 文件**

- `browser-app` 分支清理完成，纯浏览器版单 HTML 项目
- Node.js CLI 版源码已移除（保留 `master` 分支）

## [v0.2.28] — 2026-04-08

- 修复电量趋势（`_trendData`）显示 bug
- 修复崩溃日志路径问题

## [v0.2.27] — 2026-04-08

**数据提取修复**

- 修复浏览器版 tar 解析器 `longName` 致命 bug（GNU 长文件名丢失，VFS 路径全部错误）
- PowerLog 缺失时 UI 显示警告条
- 补齐 4 个缺失提取函数：亮度趋势、能耗、CPU、进程退出
- 崩溃诊断增强：控制台输出目录内实际文件数

## [v0.2.22] — 2026-04-08

- 修复 `build.js` helper 提取 bug（`opts = {}` 被误认为函数体边界）
- 修复 `build.js` generateReport 提取 bug（CLI 代码被带入浏览器导致崩溃）
- 移除 `CHART_JS` 变量引用，浏览器版改用 `CHART_JS_DATA`

## [v0.2.20] — 2026-04-08

- 新增 `analyze.sh` 一键分析脚本
- 电量趋势默认展示最近 24h

## [v0.2.17] — 2026-04-08

**设备兼容扩展**

- 支持 iPad / Watch / Vision Pro，设备信息动态检测
- 去除所有硬编码设备映射

## [v0.2.15] — 2026-04-08

- 移除 `strings` 命令依赖，纯 JS 实现，零外部依赖

## [v0.2.14] — 2026-04-08

- better-sqlite3 替换为 sql.js（纯 JS，Windows 无需 VS Build Tools）

## [v0.2.9] — 2026-04-08

- 电量趋势图叠加亮屏带（绿色背景标示亮屏时段）
- 新增日均消耗、充电速率、充电次数统计

## [v0.2.0] — 2026-04-08

- 从 Python 重写为 JavaScript (Node.js)
- 单一依赖 sql.js，跨平台无需编译

## [v0.1.0] — 2026-04-08

- 初始版本，18 个数据提取类别
