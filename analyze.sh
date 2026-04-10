#!/usr/bin/env bash
set -euo pipefail

# 用法: bash analyze.sh <sysdiagnose.tar.gz> [output.html]
# 示例: bash analyze.sh ~/Downloads/sysdiagnose_xxx.tar.gz

if [ $# -lt 1 ]; then
  echo "用法: bash analyze.sh <sysdiagnose.tar.gz> [output.html]"
  echo "  bash analyze.sh ~/Downloads/sysdiagnose_2026.04.08_xxx.tar.gz"
  exit 1
fi

INPUT="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${2:-report-$(date +%Y%m%d).html}"

if [ ! -f "$INPUT" ]; then
  echo "❌ 文件不存在: $INPUT"
  exit 1
fi

echo "📦 解压中..."
WORK=$(mktemp -d)
trap "rm -rf '$WORK'" EXIT
tar xzf "$INPUT" -C "$WORK" 2>/dev/null || true
BASE=$(find "$WORK" -maxdepth 1 -type d -name "sysdiagnose_*" | head -1)
if [ -z "$BASE" ]; then
  echo "❌ 未找到 sysdiagnose 目录，确认文件是有效的诊断归档"
  exit 1
fi

echo "📊 提取数据..."
cd "$SCRIPT_DIR/scripts"
npm install --silent 2>/dev/null
node extract.mjs "$BASE" -o /tmp/sd-data-$$.json

echo "📝 生成报告..."
node report.mjs /tmp/sd-data-$$.json -o "$OUT"
rm -f /tmp/sd-data-$$.json

echo "✅ 完成: $OUT"
