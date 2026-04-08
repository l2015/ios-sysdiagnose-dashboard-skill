# iPhone Sysdiagnose Analyzer — AI 交接文档

> 版本: v0.2.27
> 最后更新: 2026-04-08 13:15 CST

## ⚠️ 必读

**这不是参考资料，是工作规程。收到后立即按本文档建立工作区、执行流程。不要只当文档阅读。**

## 项目概述

OpenClaw Skill，分析 sysdiagnose 诊断归档（支持 iPhone/iPad/Watch/Vision Pro 等所有 Apple 设备），生成 Apple HIG 暗色主题 HTML 报告。
Node.js + sql.js（纯 JS SQLite），单依赖，无需编译，无需 Python。

**两个版本共存：**
- **master 分支** — Node.js CLI 版，通过 `extract.mjs` + `report.mjs` 命令行使用
- **browser-app 分支** — 浏览器版，单 `index.html` 纯离线，拖入 .tar.gz 即用

## 项目结构

```
ios-sysdiagnose-dashboard-skill/
├── analyze.sh               # 一键分析脚本（Node.js 版）
├── index.html               # 浏览器版入口（build 产物，勿手动编辑）
├── SKILL.md                 # OpenClaw 技能定义
├── _meta.json               # ClawHub 元数据
├── package.json             # 项目管理
├── LICENSE                  # MIT
├── scripts/                 # Node.js 版源码
│   ├── extract.mjs          # 数据提取（读文件系统）
│   └── report.mjs           # HTML 报告生成
├── web/                     # 浏览器版源码
│   ├── vfs.js               # 虚拟文件系统（从 tar 内存读取）
│   ├── extract.js           # 数据提取（读 VFS，适配浏览器）
│   └── build.js             # 构建脚本，合并为单 index.html
└── references/
    └── features.md          # 完整可分析功能清单
```

### 浏览器版构建

依赖已安装在 `/tmp/node_modules/`（pako + sql.js）：

```bash
cd ios-sysdiagnose-dashboard-skill
node web/build.js
```

产出 `index.html`（~1MB），pako/sql.js/WASM 全部内联，纯离线零依赖。

**`index.html` 是 build 产物，不要手动编辑。** 改 `web/` 下的源码或 `scripts/report.mjs`，然后重新 build。

## 工作区路径

```
~/workspace/
├── in/
│   ├── HANDOFF.md
│   ├── logs/          ← 诊断日志（原始 tar.gz + 解压目录）
│   └── project/       ← 项目源码（含 git）
└── out/
    ├── report-v{ver}-{date}-{device}.html
    └── iphone-sysdiagnose-v{ver}.tar.gz
```

## 数据来源

1. **直接附件** — 用户发送 .tar.gz
2. **Wormhole 链接** — 按以下步骤下载

### Wormhole.app 下载步骤

收到 `https://wormhole.app/XXXX#密钥` 后执行：

1. **打开链接** — `browser open → https://wormhole.app/XXXX#密钥`（target=host）
2. **等待加载** — `act wait 3s`，然后 `snapshot` 检查页面
3. **处理报错** — 如果看到 "secret key is missing" 或 "link is invalid"：`close` 页面，重新 `open` 一次
4. **确认文件** — 页面应显示文件名和大小（如 `xxx.tar.gz 411.3 MB`）
5. **点击下载** — 点击 "Download file" 按钮
6. **等待完成** — `act wait 15s`，检查页面：文件名旁边出现 `XX% Loading...` 表示下载中；百分比消失恢复显示大小表示完成
7. **找到文件** — 执行 `ls -lhrt /tmp/playwright-artifacts-*/`，最新 UUID 文件即为下载文件
8. **复制重命名** — `cp /tmp/playwright-artifacts-XXXX/UUID in/logs/原始文件名`
9. **关闭标签** — `browser close`

> ⚠️ Playwright 将下载文件存到 `/tmp/playwright-artifacts-*/` 下，文件名是 UUID，无任何提示。

收到后保存到 `in/logs/`，解压到同目录。分析基于解压目录。

## 任务节奏

**预估超过 10 分钟的任务，先问用户有没有时间再开始。** 不要默默跑很久。拆分大任务为小批次，每批验证报告后再继续。

## 调用与打包

读取 `SKILL.md` 和 `scripts/` 下的源码了解调用方式，不同环境路径可能有差异。打包时排除 `node_modules`，保留 `.git`。

每次发布打两个包到 out/：
- **项目包** `iphone-sysdiagnose-v{ver}.zip` — 纯项目源码（含 .git），给用户下载
- **Handoff 包** `iphone-sysdiagnose-handoff-v{ver}.zip` — 项目源码 + HANDOFF.md，给 AI 交接用

浏览器版额外打：
- `iphone-sysdiagnose-browser-v{ver}.zip` — 浏览器版项目包
- `iphone-sysdiagnose-browser-handoff-v{ver}.zip` — 浏览器版 Handoff 包

两个分支各打各的包，命名带 `browser` 区分。

## 更新流程（每次用户提需求都必须严格走完）

**用户提任何改动需求，无论大小，都必须按以下步骤完整执行，不可跳步。**

1. **改代码** — 读取源码，修改实现
2. **出报告** — 基于诊断日志生成报告，检查无报错无回归
3. **版本号** — 六处同步（不升主版本）：
   - `_meta.json` / `SKILL.md` / `README.md` 顶部 / `README.md` 更新日志 / `report.mjs` VERSION / `package.json`
4. **Commit** — `git add -A && git commit -m "vX.Y.Z: 描述" && git tag -a vX.Y.Z`
5. **打项目包** — 产出到 out/
6. **更新 HANDOFF.md** — 同步版本号、补充版本历史、调整文档描述（如有流程变更）
7. **交付** — 附更新摘要

版本号规则：Bug修复补号+1，新功能次版本+1

> ⚠️ **这不是建议，是强制流程。完成步骤 1 后必须走到步骤 7，不可遗漏。**

## 关键经验

### 设备兼容性（v0.2.17+）

- **绝对不要写死列名/表名**。不同设备（iPhone/iPad/Watch/Vision Pro）的 PowerLog 表结构不同
- `PLConfigAgent_EventNone_Config` 的 `Device_SoC` 列不是所有设备都有。iPad 没有，查询会直接报错
- 用 `PRAGMA table_info()` 动态检测列，只 SELECT 存在的列
- 设备型号/芯片信息从 `remotectl_dumpstate.txt` 提取：ProductType、HardwarePlatform、DeviceClass
- 型号和 SoC 对照表（PRODUCT_TYPE/SOC_NAME）查不到时回退到原始值，保证新设备不挂
- App 显示名从 bundle ID 自动推断（取末段，≤2 字符取倒数第二段），不维护映射表
- 语言检测用时区推断（UTC+5~+9），不写死 App 前缀列表

### 电量趋势

- 周期切换按钮：span > 1 天显示 "7天/24时"，> 7 天显示 "全部/30天"
- 默认激活 "24时" 按钮，图表初始渲染最近 24h 数据

### 存储写入

- 使用水平条形图（Apple 风格），不使用饼图
- 色系柔和，符合 Apple HIG 暗色主题

### 数据时间范围

- PowerLog 各表时间范围不同（48h~30天），不要假设一致
- timestamp 是 Unix 秒(UTC)，从目录名取时区偏移
- SAF 框架仅作参考借鉴，查看 Apollo 模块了解表结构

## 参考框架

开发时参考 **EC-DIGIT-CSIRC/sysdiagnose** (SAF)：
- https://github.com/EC-DIGIT-CSIRC/sysdiagnose
- Apollo 模块：`src/sysdiagnose/utils/apollo_modules/powerlog_*.txt`
- 仅借鉴，不集成

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1.0 | | 18 个数据类别，基础 HTML 报告 |
| v0.1.1 | | Apple HIG 深色主题，中文检测，App 映射 |
| v0.1.2 | | 时间戳修复，闪存剩余百分比，响应式 |
| v0.1.3 | | 容量损耗，通电次数，hover 修复 |
| v0.1.4 | | .ips 崩溃解析，Jetsam 排行 |
| v0.2.0 | | Python → Node.js 重写 |
| v0.2.1 | | 时区感知 |
| v0.2.2 | | UI 优化：字体/KPI/循环分级 |
| v0.2.3 | | 杀后台总次数，崩溃显示应用 |
| v0.2.4 | 2026-04-08 | 数据驱动时间范围 |
| v0.2.5 | 2026-04-08 | 亮度/能耗/CPU/GPS/进程退出; 蜂窝; Jetsam详情; SoC扩展 |
| v0.2.6 | 2026-04-08 | Jetsam进程名修复; 6函数补时间范围; 过滤stacks; 数据结构统一 |
| v0.2.7 | 2026-04-08 | 网络蜂窝列名修复(CellIn); 退出原因码扩展 |
| v0.2.8 | 2026-04-08 | 使用汇总：总亮屏时间(含日均)、电池FCC范围、累计使用天数 |
| v0.2.9 | 2026-04-08 | 电量趋势亮屏叠加/日均消耗/充放电速率/表格排序/时间范围统一/能耗补全/进程退出翻译 |
| v0.2.10 | 2026-04-08 | 移除能耗/CPU/屏幕状态, 电量趋势时间切换, 崩溃进程名映射, 数据排版改善 |
| v0.2.11 | 2026-04-08 | 崩溃可展开分类, 移除硬编码映射, 删进程退出, 写入占比 |
| v0.2.12 | 2026-04-08 | 崩溃重新设计, 存储写入饼图, 中文时间格式, 总亮屏周期说明 |
| v0.2.13 | 2026-04-08 | 崩溃内联展开icon, Preview/Debug切换, data-source属性, 打包改zip保留git |
| v0.2.14 | 2026-04-08 | better-sqlite3 → sql.js（纯JS，零编译，跨平台） |
| v0.2.15 | 2026-04-08 | 移除 strings 命令依赖，纯 JS 实现 |
| v0.2.16 | 2026-04-08 | PE/坏块无数据处理;崩溃按钮左移;饼图优化 |
| v0.2.17 | 2026-04-08 | 去除硬编码：Config列动态检测(PRAGMA table_info)，设备信息从remotectl提取，App名自动推断，标题随设备变化，修复路径尾/导致时区解析失败 |
| v0.2.18 | 2026-04-08 | 全设备型号对照表(iPhone/iPad/Watch/Vision Pro/TV/HomePod/iPod)+SoC芯片名称对照 |
| v0.2.19 | 2026-04-08 | SoC名称简化(A15等);电量趋势周期按钮阈值降为>1天;存储写入饼图改Apple风格水平条形图 |
| v0.2.23 | 2026-04-08 | 版本发布：build.js三个提取bug修复完整交付(v0.2.22变更) |
| v0.2.27 | 2026-04-08 | 修复浏览器版tar解析器longName致命bug（longName移至循环外+显式重置+BSD tar binary size）；findPowerlog两级fallback；extractAll诊断日志+UI警告；补齐4个缺失提取函数；重做debug模式（诊断面板+模块状态）；修复build.js script转义（同时转义`<script>`和`</script>`）；崩溃诊断增强 |
| v0.2.22 | 2026-04-08 | 修复build.js三个提取bug：(1)helper提取改为括号感知，opts={}默认参数中的{}不再导致函数体截断；(2)generateReport改用花括号计数精确截断，不再误带入process.argv CLI代码导致浏览器ReferenceError崩溃；(3)移除generateReport中CHART_JS引用，浏览器版用CHART_JS_DATA单独注入。浏览器版拖入/点击功能恢复 |
| v0.2.20 | 2026-04-08 | 新增analyze.sh一键脚本;崩溃按钮增大/间距优化;存储格式"已用/总(%)";电量趋势默认24h;切换后悬浮提示修复;HANDOFF精简调用/打包;package.json版本同步;六处版本号 |
| v0.2.21 | 2026-04-08 | 浏览器版：单HTML纯离线(pako+sql.js+WASM内联)，拖入tar.gz即用; web/模块化源码(vfs/extract/build); 转义report内script标签 |

## 待办

- [ ] SoC 能耗详情（EnergyModel 表）
- [ ] 充电会话分析
- [ ] 系统内存压力/Swap
- [ ] 屏幕状态精确统计
- [ ] 充电器功率分析
- [x] ~~设备型号映射完善~~ (v0.2.18: 全设备 ProductType 对照表)
- [x] ~~不依赖 strings 命令~~ (v0.2.14: 纯 JS 实现 extractStrings)

---

## 附录：sysdiagnose 包结构

<details>
<summary>完整结构（895MB）</summary>

```
sysdiagnose_*/                                           ~895MB
│
├── [顶层文件]                                             12MB
│   ├── taskinfo.txt                       3.6MB  ⭐ 进程详细内存
│   ├── spindump-nosymbols.txt             3.9MB  ⭐ 系统卡顿分析
│   ├── ltop.txt                           3.1MB     内核线程
│   ├── swcutil_show.txt                   1.7MB     Shared Web Credentials
│   ├── security-sysdiagnose.txt           1.5MB     钥匙串/安全
│   ├── smcDiagnose.txt                     33KB  ⭐ SMC 传感器时序
│   ├── vm_stat.txt                        5.5KB  ⭐ 虚拟内存统计
│   ├── jetsam_priority.csv                 30KB  ⭐ Jetsam 进程优先级
│   ├── ps.txt                              65KB     进程列表
│   ├── remotectl_dumpstate.txt            4.2KB  ⭐ 设备型号/芯片/SoC
│   ├── disks.txt                          1.7KB  ⭐ 磁盘分区
│   └── (其他文件)
│
├── system_logs.logarchive/                633MB  系统统一日志
├── logs/                                  123MB  各子系统日志
│   ├── powerlogs/                          82MB  ⭐⭐ SQLite（626表）
│   └── (50+ 其他)
├── crashes_and_spins/                      20MB  崩溃日志
├── ASPSnapshots/                          1.5MB  ⭐⭐ NAND SMART
└── (其他目录)
```

当前覆盖度：顶层文件 0/33，目录 3/14，PowerLog 15/626 表

</details>

## 附录：PowerLog 数据库

<details>
<summary>已用和未用表（626 表）</summary>

已使用（~15表）：
- PLBatteryAgent_EventBackward_Battery — 电池健康/温度/电压
- PLBatteryAgent_EventNone_BatteryConfig — 电池配置（注意列名因设备而异，用 PRAGMA 检测）
- PLCoalitionAgent_Aggregate_NANDStats — App NAND 写入
- PLAppTimeService_Aggregate_AppRunTime — App 亮屏/后台时间
- PLDuetService_Aggregate_DuetEnergyAccumulator — App 能耗
- PLCoalitionAgent_EventInterval_CoalitionInterval — App CPU
- PLApplicationAgent_EventBackward_ApplicationMemory — App 内存峰值
- PLDisplayAgent_EventForward_Display — 亮度趋势
- PLLocationAgent_EventForward_ClientStatus — GPS 使用
- PLProcessNetworkAgent_EventInterval_UsageDiff — 网络流量
- PLApplicationAgent_EventPoint_ApplicationExitReason — App 退出
- PLProcessMonitorAgent_EventPoint_ProcessExit — 进程退出

未使用高价值表：
- PLIOReportAgent_EventBackward_EnergyModel — SoC 各部件能耗
- PLScreenStateAgent_EventForward_ScreenState — 精确亮屏状态
- PLBatteryAgent_EventBackward_Adapter — 充电器功率
- PLBatteryAgent_EventInterval_Charging — 充电会话
- PLPerformanceAgent_EventPoint_SystemMemory — 系统内存/Swap
- PLWifiAgent_EventBackward_CumulativeProperties — WiFi TX/RX
- PLBatteryAgent_EventPoint_ChargingInfo — 充电功率预算
- PLAppTimeService_Aggregate_CellularCondition — 蜂窝信号
- PLCoalitionAgent_EventPoint_CoalitionMemory — 进程内存分布
- BatteryIntelligence_TimeTo80_1_2 — 充电到 80% 预测

</details>
