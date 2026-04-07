# iPhone Sysdiagnose Analyzer

分析 iPhone sysdiagnose 诊断归档文件，提取电池健康、闪存状态、应用使用、崩溃日志等数据，生成自包含的 HTML 报告。

## 功能

- **电池**: 健康百分比、充电循环、容量衰减、温度趋势
- **NAND 闪存**: 剩余寿命、读写量（主机/闪存双视角）、PE 擦写次数、坏块、写入放大
- **应用排行**: 存储写入量、亮屏时间、内存峰值、网络流量、GPS 使用
- **崩溃日志**: Jetsam 内存压力、Safari 崩溃、磁盘写入超限、CPU 资源事件
- **设备信息**: 型号识别、SoC、磁盘容量、基带版本

输出单个自包含 HTML 文件，Apple HIG 风格深色主题，支持移动端响应式布局。

## 快速开始

```bash
# 安装依赖
pip install sysdiagnose  # SAF 分析框架

# 1. 解析 sysdiagnose 归档
sysdiag create your_sysdiagnose.tar.gz
CASE_ID=$(sysdiag cases | tail -1 | awk '{print $1}')
sysdiag -c "$CASE_ID" parse all

# 2. 解压原始数据
mkdir -p /tmp/sd && tar xzf your_sysdiagnose.tar.gz -C /tmp/sd
BASE=$(find /tmp/sd -maxdepth 1 -type d -name "sysdiagnose_*" | head -1)

# 3. 提取结构化数据
python3 scripts/extract.py "$BASE" "cases/$CASE_ID/parsed_data" -o data.json

# 4. 生成报告
python3 scripts/report.py data.json -o report.html
```

浏览器打开 `report.html` 即可查看。

## 环境要求

- Python 3.10+
- [SAF (Sysdiagnose Analysis Framework)](https://github.com/EC-DIGIT-CSIRC/sysdiagnose)
- `strings` 命令（macOS / Linux 自带）

## 项目结构

```
iphone-sysdiagnose/
├── SKILL.md                 # OpenClaw 技能定义
├── _meta.json               # ClawHub 元数据
├── pyproject.toml           # Python 打包配置
├── LICENSE                  # MIT
├── scripts/
│   ├── extract.py           # 数据提取（PowerLog + ASP + 崩溃日志）
│   └── report.py            # HTML 报告生成器
├── references/
│   └── features.md          # 完整可分析功能清单
└── tests/
    └── test_extract.py      # 基础测试
```

## CLI 参考

### extract.py

```
usage: extract.py [-h] [--max-points N] [-o OUTPUT] base_dir parsed_dir

参数:
  base_dir              解压后的 sysdiagnose 目录
  parsed_dir            SAF 解析数据目录

选项:
  --max-points N        时间序列最大数据点数（默认 200）
  -o, --output FILE     输出文件（默认 stdout）
```

### report.py

```
usage: report.py [-h] [-o OUTPUT] input

参数:
  input                 extract.py 输出的 JSON 文件（或 - 表示 stdin）

选项:
  -o, --output FILE     输出 HTML 文件（默认 stdout）
```

## 支持设备

已在 iOS 15-26 的 sysdiagnose 归档上测试。支持任何包含 PowerLog 数据的 iPhone / iPad 归档。

型号映射示例：
- iPhone14,2 → iPhone 13 Pro
- iPhone14,5 → iPhone 13
- iPhone15,2 → iPhone 14 Pro
- iPhone16,1 → iPhone 15 Pro

## 已知限制

- NAND 供应商/型号在用户级 sysdiagnose 中不可见（仅 Apple AST2 可见）
- PowerLog 表结构因 iOS 版本不同可能有差异（部分表可能为空）
- 报告文字根据设备语言自动切换（中文/英文）

## 开发

参考 `references/features.md` 查看完整的 PowerLog 表和待实现功能。欢迎 PR。

## 许可证

MIT
