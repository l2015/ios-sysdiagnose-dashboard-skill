# iPhone Sysdiagnose Analyzer

> OpenClaw Skill · 版本 0.1.4

分析 iPhone sysdiagnose 诊断归档文件，提取电池健康、闪存状态、应用使用、崩溃日志等数据，生成自包含的 HTML 报告。

## 功能

- **电池**: 健康百分比、充电循环、容量衰减、温度趋势
- **NAND 闪存**: 剩余寿命、读写量（主机/闪存双视角）、PE 擦写次数、坏块、写入放大
- **应用排行**: 存储写入量、亮屏时间、内存峰值、网络流量
- **崩溃分析**: Jetsam 内存回收、Safari 崩溃、磁盘写入超限、CPU 资源事件
- **应用退出**: Jetsam 内存回收排行（哪个 App 被系统杀得最多）
- **设备信息**: 型号识别、SoC、磁盘容量、基带版本

## 使用方式

### 作为 OpenClaw Skill

安装后，用户只需上传 sysdiagnose 文件，AI 自动完成：

1. 解压归档
2. 提取数据（PowerLog + ASP SMART + 崩溃日志）
3. 生成 HTML 报告

无需用户手动操作任何命令行。

### 手动使用

```bash
# 提取数据（SAF 可选，不装也能提取崩溃日志和 PowerLog 数据）
python3 scripts/extract.py /path/to/sysdiagnose_dir -o data.json

# 生成报告
python3 scripts/report.py data.json -o report.html
```

## 环境要求

- Python 3.10+
- `strings` 命令（macOS / Linux 自带）
- [SAF](https://github.com/EC-DIGIT-CSIRC/sysdiagnose)（可选，提供额外解析能力）

## 项目结构

```
iphone-sysdiagnose/
├── SKILL.md                 # OpenClaw 技能定义
├── _meta.json               # ClawHub 元数据
├── pyproject.toml           # Python 打包配置
├── LICENSE                  # MIT
├── scripts/
│   ├── __init__.py
│   ├── extract.py           # 数据提取
│   └── report.py            # HTML 报告生成
├── references/
│   └── features.md          # 完整可分析功能清单
└── tests/
    └── test_extract.py      # 基础测试
```

## 更新日志

### v0.1.4
- 崩溃分析：直接解析 `.ips` 文件，不再依赖 SAF
- 新增 Jetsam 内存回收排行（PowerLog 应用退出原因表）
- 术语说明全部重写，通俗化（WAF 用擦黑笔字类比、PE 解释剩余次数）
- 修复 `short_name` 前缀匹配导致 PassbookUIService 显示为 Safari

### v0.1.3
- 报告头部增加日期含义标注（日志记录 vs 报告生成 vs 分析器版本）
- 电池详情补充容量损耗和标称容量，对齐闪存卡片行数
- 运行时间改为显示"累计通电/开机次数"，明确不是连续不关机
- CSS hover 提示改为 JS 弹窗，支持移动端 tap

### v0.1.2
- 修复时间戳类型错误（Unix 不是 CFAbsoluteTime）
- 闪存改为显示剩余健康百分比
- 增加闪存实际读写量（区别于主机读写）
- 移除屏幕亮度图表
- 响应式布局（768px / 480px 断点）

### v0.1.1
- 报告完全重写，Apple HIG 深色主题
- 中文自动检测（根据 App bundle ID）
- App 名称映射（淘宝、抖音、微信等）
- 电量/亮度曲线增加时间轴和 hover 交互
- 内存单位修正（bytes 而非 KB）

### v0.1.0
- 初始版本：18 个数据提取类别
- 基础 HTML 报告
- CLI 支持

## 已知限制

- NAND 供应商/型号在用户级 sysdiagnose 中不可见
- PowerLog 表结构因 iOS 版本不同可能有差异
- 累计数据（通电时间、Jetsam 次数等）自上次"抹掉所有内容"起算

## 许可证

MIT
