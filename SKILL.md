---
name: iphone-sysdiagnose
version: 0.1.4
description: >
  Analyze iPhone sysdiagnose (.tar.gz) diagnostic archives. Extracts battery health (cycle count, capacity, trend),
  NAND flash SMART data (lifespan, writes, reads, bad blocks, PE cycles, WAF), app metrics (screen time, NAND writes, memory, network),
  crash logs (Jetsam, Safari, disk writes, CPU), app exit analysis (Jetsam kill ranking), and device info.
  Generates a self-contained Apple HIG-style dark theme HTML report with interactive charts and Chinese/English i18n.
  Use when: user provides a sysdiagnose file, asks about iPhone diagnostics, battery health, storage analysis,
  app crash analysis, memory pressure, or wants an iOS device health report.
---

# iPhone Sysdiagnose Analyzer

## Requirements

- Python 3.10+
- `strings` command (pre-installed on macOS and Linux)
- SAF framework (`pip install sysdiagnose`) — optional, enhances analysis

## Pipeline

### 1. Extract archive

```bash
WORK=$(mktemp -d)
tar xzf "<input>.tar.gz" -C "$WORK"
BASE=$(find "$WORK" -maxdepth 1 -type d -name "sysdiagnose_*" | head -1)
```

### 2. Extract structured data

```bash
# Without SAF (crashes + PowerLog + ASP SMART)
python3 scripts/extract.py "$BASE" -o data.json

# With SAF (adds VPN, system info)
sysdiag create "<input>.tar.gz"
CASE_ID=$(sysdiag cases | tail -1 | awk '{print $1}')
sysdiag -c "$CASE_ID" parse all
python3 scripts/extract.py "$BASE" "cases/$CASE_ID/parsed_data" -o data.json
```

### 3. Generate HTML report

```bash
python3 scripts/report.py data.json -o report.html
```

### 4. Cleanup

```bash
rm -rf "$WORK"
```

## Extracted Data

See `references/features.md` for full feature list. Key categories:

- **Battery**: health %, cycles, capacity, trend chart, temperature, voltage
- **NAND**: remaining lifespan %, host read/write, NAND read/write, PE cycles, bad blocks, WAF
- **Apps**: NAND writers, screen time, energy, CPU, memory, network
- **Crashes**: Jetsam events, Safari crashes, disk write exceedance, CPU resource, SFA security
- **App Exits**: Jetsam memory kill ranking per app
- **Device**: model, SoC, disk, partitions, baseband

## Notes

- App names auto-translated for Chinese devices (e.g., `com.taobao.fleamarket` → 淘宝)
- Language auto-detected from app bundle IDs
- Report shows analyzer version, log range, and generation timestamp
- NAND vendor/model not available in customer sysdiagnose (Apple internal only)
- Cumulative stats (uptime, Jetsam kills) are since last "Erase All Content"
