# iPhone Sysdiagnose Analyzer

> OpenClaw Skill · 版本 0.2.0

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
# 克隆项目
git clone https://github.com/<you>/iphone-sysdiagnose.git
cd iphone-sysdiagnose/scripts
npm install

# 解压 sysdiagnose 归档
WORK=$(mktemp -d)
tar xzf your-sysdiagnose.tar.gz -C "$WORK"
BASE=$(find "$WORK" -maxdepth 1 -type d -name "sysdiagnose_*" | head -1)

# 提取数据
node extract.mjs "$BASE" -o data.json

# 生成报告
node report.mjs data.json -o report.html

# 清理
rm -rf "$WORK"
```

打开 `report.html` 即可查看报告。

## 环境要求

- Node.js 18+
- `strings` 命令（macOS / Linux 自带）

## 作为 OpenClaw Skill 使用

安装后，用户只需上传 sysdiagnose 文件，AI 自动完成：

1. 解压归档
2. 提取数据（PowerLog + ASP SMART + 崩溃日志）
3. 生成 HTML 报告

### 安装

```bash
git clone https://github.com/<you>/iphone-sysdiagnose.git ~/.openclaw/skills/iphone-sysdiagnose
cd ~/.openclaw/skills/iphone-sysdiagnose/scripts && npm install
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
iphone-sysdiagnose/
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

### v0.2.0
- 从 Python 重写为 JavaScript (Node.js)
- 单一依赖：better-sqlite3（无需 Python 环境）
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

## 许可证

MIT
