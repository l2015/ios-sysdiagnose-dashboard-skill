# iPhone Sysdiagnose Analyzer

> OpenClaw Skill · 版本 0.2.27

分析 iPhone sysdiagnose 诊断归档文件，提取电池健康、闪存状态、应用使用、崩溃日志等数据，生成自包含的 HTML 报告。

## 功能

- **电池**: 健康百分比、充电循环、容量衰减、温度趋势
- **NAND 闪存**: 剩余寿命、读写量（主机/闪存双视角）、PE 擦写次数、坏块、写入放大
- **应用排行**: 存储写入量、亮屏时间、内存峰值、网络流量
- **崩溃分析**: Jetsam 内存回收、Safari 崩溃、磁盘写入超限、CPU 资源事件
- **应用退出**: Jetsam 内存回收排行（哪个 App 被系统杀得最多）
- **设备信息**: 型号识别、SoC、磁盘容量、基带版本

## 快速开始

```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git
cd ios-sysdiagnose-dashboard-skill
bash analyze.sh your-sysdiagnose.tar.gz
```

报告生成在当前目录：`report-20260408.html`，浏览器打开即可查看。

也可以手动运行：

```bash
cd scripts && npm install
node extract.mjs <sysdiagnose解压目录> -o data.json
node report.mjs data.json -o report.html
```

## 环境要求

- Node.js 18+

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

## 输出报告

Apple HIG 风格暗色主题 HTML 报告，包含：

- 5 个 KPI 卡片（电池健康、循环次数、闪存剩余、崩溃数、应用退出）
- 电池详情卡片（容量损耗、温度、电压）
- NAND 闪存健康卡片（PE 擦写、WAF、坏块）
- 交互式电量趋势图（hover/tap 查看数值）
- 崩溃分析分类统计
- Jetsam 内存回收排行榜
- 应用 NAND 写入排行、亮屏时间、内存峰值、网络流量
- 响应式布局（桌面 / 平板 / 手机）
- 中英文自动检测（根据 App bundle ID）

## 数据源

| 来源 | 位置 | 内容 |
|------|------|------|
| **PowerLog** | `logs/powerlogs/*.PLSQL` | SQLite 数据库：电池、应用、系统指标 |
| **ASP SMART** | `ASPSnapshots/asptool_snapshot.log` | NAND 闪存健康数据 |
| **崩溃日志** | `crashes_and_spins/*.ips` | Jetsam、Safari、磁盘写入、CPU 崩溃 |

## 项目结构

```
ios-sysdiagnose-dashboard-skill/
├── analyze.sh               # 一键分析脚本
├── SKILL.md                 # OpenClaw 技能定义
├── _meta.json               # ClawHub 元数据
├── package.json             # 项目管理
├── LICENSE                  # MIT
├── scripts/
│   ├── extract.mjs          # 数据提取
│   └── report.mjs           # HTML 报告生成
└── references/
    └── features.md          # 完整可分析功能清单
```

## 更新日志

### v0.2.27
- 修复浏览器版 tar 解析器致命 bug：`longName` 在 `while` 循环体内 `let` 声明导致 GNU 长文件名丢失，VFS 文件路径全部错误
- `longName` 移至循环外部声明 + 显式重置 + 新增 BSD tar binary size 支持
- `findPowerlog` 两级 fallback：先搜 powerlog 路径，再搜任意 .PLSQL
- `extractAll` 新增诊断日志（`_diag`），PowerLog 缺失时 UI 显示警告条
- 补齐缺失提取函数：`parseBrightnessTrend`、`parseAppEnergy`、`parseAppCpu`、`parseProcessExits`
- 重做 Debug 模式：诊断面板显示 6 模块状态 + 原始日志，点击外部关闭
- 修复 build.js `<script>` / `</script>` 转义：同时转义为 split string，防止 HTML 解析器嵌套 script 块导致电量趋势以下模块消失
- 崩溃诊断增强：控制台输出目录内实际文件数

### v0.2.22
- 修复 web/build.js helper 提取：`opts = {}` 默认参数中的 `{}` 被误认为函数体花括号，导致 `interactiveChartSvg` 和 `barChartSvg` 两个函数被截断
- 修复 generateReport 提取：regex `^export` 匹配范围过大，CLI 代码（`process.argv`）被带入浏览器版导致 ReferenceError 崩溃
- 修复 generateReport 中 `${CHART_JS}` 引用：浏览器版未定义该变量，浏览器版改用 `CHART_JS_DATA` 单独注入
- Helper 提取改为括号感知：跳过参数区花括号，只在外层花括号上计数；简单 const 按分号截断
- 新增 `VERSION` 到 helper 提取列表

### v0.2.20
- 新增 `analyze.sh` 一键分析脚本，简化手动使用流程
- 崩溃展开按钮增大、间距优化
- 存储显示合并为"已用/总(百分比)"格式
- 电量趋势默认展示最近24h，修复切换后悬浮提示失效

### v0.2.19
- SoC 名称简化为商业型号（A15/M1 等），去除微架构前缀
- 电量趋势周期按钮阈值降低，>1 天即显示（7天/24时）
- 存储写入饼图改为 Apple 风格水平条形图

### v0.2.18
- 新增全设备型号对照表（iPhone/iPad/Watch/Vision Pro/TV/HomePod/iPod），ProductType 友好显示
- 新增 SoC 芯片名称对照表，HardwarePlatform 显示商业名称+微架构
- 查不到时回退到原始值，兼容未来新设备

### v0.2.17
- 去除所有硬编码映射：设备信息从 `remotectl_dumpstate.txt` 动态提取（ProductType/HardwarePlatform/DeviceClass），不再写死 SoC→型号/芯片名
- `parseDeviceConfig` 动态检测 PowerLog 列（`PRAGMA table_info`），iPad 等无 `Device_SoC` 列的设备不再返回空数据
- App 显示名从 bundle ID 自动推断（取末段），不再维护 ~40 条映射表
- 报告标题/页脚随设备类型变化（iPhone/iPad/Watch）
- 语言检测改为纯时区驱动，不再写死中国 App 前缀列表
- 修复路径末尾 `/` 导致时区解析失败的 bug

### v0.2.16
- 崩溃展开按钮移到数字左侧，数字对齐
- 存储写入饼图尺寸 140→200px

### v0.2.15
- 移除 `strings` 命令依赖，用纯 JS 实现 extractStrings，零外部依赖跨平台

### v0.2.14
- better-sqlite3 替换为 sql.js（纯 JS，零编译，跨平台），Windows 无需 VS Build Tools

### v0.2.13
- 崩溃展开按钮改为内联 icon（▸/▾），紧跟数字后面
- 存储写入饼图重做为 Apple HIG 风格：更大尺寸、分段间距、中心显示最大占比、带数据量图例
- 时间格式统一为 "X时X分"
- 报告左上角新增 Preview/Debug 切换开关
- Debug 模式：点击任意数据行显示精确数据来源（表名/字段名）
- 关键数据加 data-source 属性（电池 7 项、闪存 8 项）

### v0.2.12
- 崩溃分析重新设计：保留 stat-row 简洁布局，Jetsam/磁盘写入进程名折叠显示
- 存储写入从排行表格改为饼图（donut chart），直观展示各 App 写入占比
- 前台/后台时间统一为中文格式（125小时48分）
- 总亮屏改为中文格式，加 tooltip 说明统计周期和日均

### v0.2.11
- 崩溃分析改为可展开分类结构（Jetsam/磁盘写入点击展开显示进程名）
- 移除进程名→App名硬编码映射，直接显示原始进程名
- 移除进程退出板块
- 前台/后台时间统一为 "Xh Ym" 格式
- 存储写入排行加占比百分比
- PE 擦写移除硬编码兜底，优先使用 max_native_endurance

### v0.2.10
- 移除能耗排行模块（数据不完整，缺乏工程价值）
- 移除 CPU 排行模块（实用性不足）
- 移除屏幕状态独立图表（已合并到电量趋势亮屏带）
- 电量趋势下方数据改用四宫格布局
- 电量趋势支持按 全部/30天/7天/24小时 切换
- 崩溃分析进程名映射为中文 App 名（Aweme→抖音，discover→小红书等）

### v0.2.9
- 电量趋势图叠加亮屏带（绿色背景标示亮屏时段）
- 电量趋势下方新增：日均消耗、充/放电速率、充电次数
- 时间范围描述统一为日期范围
- FCC/累计通电加 tooltip 解释
- 能耗排行交叉补全屏幕时间数据（解决抖音/小红书缺失）
- CPU 排行加条形图可视化
- 表格列头可点击排序
- 屏幕状态图表增加说明文字
- 进程退出原因码翻译（Jetsam/看门狗/信号等）
- 电池摘要：按充放电会话统计，中位数速率

### v0.2.8
- 新增使用汇总：总亮屏时间(含日均)、电池FCC范围、累计使用天数

### v0.2.7
- 修复网络蜂窝列名（CellularIn → CellIn），蜂窝数据正常显示
- App 退出原因码扩展（10: 非法内存访问, 15: 资源耗尽）

### v0.2.6
- 修复 Jetsam 进程名正则（"procname" → "largestProcess"），杀后台详情正常提取
- 6 个函数补充时间范围（energy/cpu/gps/进程退出/亮度/电量趋势）
- 过滤 stacks-*.ips 堆栈快照，崩溃数虚高修复
- 数据结构统一为 dict 格式

### v0.2.5
- 报告新增：亮度趋势图、能耗排行、CPU 排行、GPS 使用、进程退出
- 网络流量拆分 WiFi / 蜂窝数据
- Jetsam 崩溃提取具体进程名并展示
- 扩展 SoC / 型号映射（A14~A18 Pro）
- 移除文档中不存在的文件引用（extract-bsdtar.mjs、server.mjs、prebuilt/）
- 版本同步扩展至 report.mjs（5 处同步）

### v0.2.4
- 完善 handoff 打包规范，排除 data.json 保护个人信息
- 更新版本历史记录（补齐 v0.2.1~v0.2.3）
- 版本号四处同步（_meta.json、SKILL.md、README.md 顶部、README.md 更新日志）

### v0.2.3
- 新增脚本：extract-bsdtar.mjs（跨平台 sysdiagnose .tar.gz 提取）
- 预编译 bsdtar 二进制（Linux x64 / macOS）
- 支持 zstd 压缩的 sysdiagnose 包

### v0.2.2
- 新增脚本：server.mjs（原生 HTTP 服务器 + WebSocket）
- Log Viewer：Xterm.js 终端组件，支持搜索、过滤、高亮
- APT 助手：邮件模版、配置管理、压缩附件准备
- 关机日志高亮、关键诊断数据段标注
- 30 秒自动刷新机制

### v0.2.1
- Web UI 版本：index.html + style.css + script.js + app.js
- Chart.js 交互式图表
- KaTeX 数学公式渲染
- 支持实时分析（非仅静态报告）

### v0.2.0
- 从 Python 重写为 JavaScript (Node.js)
- 单一依赖：sql.js（纯 JS，无需编译，跨平台）
- 无需编译，直接 `node` 执行
- 保留全部 18 个数据提取类别
- 保留 Apple HIG 暗色主题交互式报告

### v0.1.4
- 崩溃分析：直接解析 `.ips` 文件，不再依赖 SAF
- 新增 Jetsam 内存回收排行
- 术语说明全部重写，通俗化

### v0.1.3
- 报告头部增加日期含义标注
- 电池详情补充容量损耗和标称容量
- 运行时间改为显示"累计通电/开机次数"
- CSS hover 提示改为 JS 弹窗，支持移动端

### v0.1.2
- 修复时间戳类型错误
- 闪存改为显示剩余健康百分比
- 增加闪存实际读写量
- 响应式布局

### v0.1.1
- 报告完全重写，Apple HIG 深色主题
- 中文自动检测
- App 名称映射
- 电量/亮度曲线增加时间轴和 hover 交互

### v0.1.0
- 初始版本：18 个数据提取类别
- 基础 HTML 报告

## 已知限制

- NAND 供应商/型号在用户级 sysdiagnose 中不可见
- PowerLog 表结构因 iOS 版本不同可能有差异
- 累计数据（通电时间、Jetsam 次数等）自上次"抹掉所有内容"起算

## Acknowledgments

- [EC-DIGIT-CSIRC/sysdiagnose](https://github.com/EC-DIGIT-CSIRC/sysdiagnose) (SAF) — PowerLog 表结构参考，Apollo 模块用作数据映射灵感

## 许可证

MIT
