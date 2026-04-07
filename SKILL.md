---
name: iphone-sysdiagnose
version: 0.2.0
description: >
  Analyze iPhone sysdiagnose (.tar.gz) diagnostic archives. Extracts battery health (cycle count, capacity, trend),
  NAND flash SMART data (lifespan, writes, reads, bad blocks, PE cycles, WAF), app metrics (screen time, NAND writes, memory, network),
  crash logs (Jetsam, Safari, disk writes, CPU), app exit analysis (Jetsam kill ranking), and device info.
  Generates a self-contained Apple HIG-style dark theme HTML report with interactive charts and Chinese/English i18n.
  Use when: user provides a sysdiagnose file, asks about iPhone diagnostics, battery health, storage analysis,
  app crash analysis, memory pressure, or wants an iOS device health report.
metadata:
  openclaw:
    emoji: "📱"
    requires:
      bins: ["strings"]
      node: ">=18"
    install:
      - id: npm
        kind: npm
        dir: "{baseDir}/scripts"
        label: "Install dependencies (npm install in scripts/)"
---

# iPhone Sysdiagnose Analyzer

## Requirements

- Node.js 18+
- `strings` command (pre-installed on macOS and Linux)
- `better-sqlite3` (install via `cd {baseDir}/scripts && npm install`)

## Setup (one-time)

```bash
cd {baseDir}/scripts && npm install
```

## Pipeline

### 1. Extract archive

```bash
WORK=$(mktemp -d)
tar xzf "<input>.tar.gz" -C "$WORK"
BASE=$(find "$WORK" -maxdepth 1 -type d -name "sysdiagnose_*" | head -1)
```

### 2. Extract structured data

```bash
node {baseDir}/scripts/extract.mjs "$BASE" -o data.json
```

### 3. Generate HTML report

```bash
node {baseDir}/scripts/report.mjs data.json -o ~/.openclaw/workspace/iphone-report.html
```

### 4. Cleanup

```bash
rm -rf "$WORK"
```

## Quick One-Liner

```bash
WORK=$(mktemp -d) && tar xzf "<input>.tar.gz" -C "$WORK" && BASE=$(find "$WORK" -maxdepth 1 -type d | head -1) && node {baseDir}/scripts/extract.mjs "$BASE" -o /tmp/sd-data.json && node {baseDir}/scripts/report.mjs /tmp/sd-data.json -o ~/.openclaw/workspace/iphone-report.html && rm -rf "$WORK"
```

## Extracted Data

| Category | Source | Fields |
|----------|--------|--------|
| Battery | PowerLog | health %, cycles, capacity, trend, temp, voltage |
| NAND | ASP SMART | remaining lifespan, host/NAND read/write, PE cycles, bad blocks, WAF |
| Apps | PowerLog | NAND writers, screen time, energy, CPU, memory, network, GPS |
| Crashes | .ips files | Jetsam, Safari, disk writes, CPU resource, SFA |
| App Exits | PowerLog | Jetsam kill ranking per app |
| Device | PowerLog | model, SoC, disk, baseband |

## Notes

- App names auto-translated for Chinese devices (e.g., `com.taobao.fleamarket` → 淘宝)
- Language auto-detected from app bundle IDs
- NAND vendor/model not available in customer sysdiagnose (Apple internal only)
- Cumulative stats (uptime, Jetsam kills) since last "Erase All Content"
