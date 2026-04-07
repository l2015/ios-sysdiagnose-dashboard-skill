---
name: iphone-sysdiagnose
version: 0.1.0
description: >
  Analyze iPhone sysdiagnose (.tar.gz) diagnostic archives. Extracts battery health (cycle count, capacity, trend),
  NAND flash SMART data (lifespan, writes, reads, bad blocks), app metrics (screen time, energy, NAND writes, memory, GPS),
  crash logs (Jetsam, Safari, disk writes, CPU), VPN/network extensions, and device info.
  Generates a self-contained bento-grid HTML report with SVG sparklines.
  Use when: user provides a sysdiagnose file, asks about iPhone diagnostics, battery health, storage analysis,
  app crash analysis, or wants an iOS device health report.
---

# iPhone Sysdiagnose Analyzer

## Requirements

- Python 3.10+
- SAF framework: `pip install sysdiagnose`
- `strings` (from util-linux, pre-installed on most systems)

## Pipeline

### 1. Extract archive and parse with SAF

```bash
WORK=$(mktemp -d)
tar xzf "<input>.tar.gz" -C "$WORK"
BASE=$(find "$WORK" -maxdepth 1 -type d -name "sysdiagnose_*" | head -1)

sysdiag create "<input>.tar.gz"
CASE_ID=$(sysdiag cases | tail -1 | awk '{print $1}')
sysdiag -c "$CASE_ID" parse all
```

### 2. Extract structured data

```bash
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

- **Battery**: health %, cycles, capacity, trend chart, temperature
- **NAND**: lifespan %, read/write TB, PE cycles, bad blocks, power-on hours
- **Apps**: NAND writers, screen time, energy, CPU, memory, GPS, network
- **Crashes**: Jetsam, Safari, disk writes, CPU resource, SFA
- **Network**: VPN extensions, WiFi diagnostics
- **Device**: model, SoC, disk, partitions

## Notes

- Bundle IDs are converted to short names automatically (e.g., `com.apple.mobilesafari` -> `mobilesafari`)
- Time series are downsampled to `--max-points` (default 200) for manageable JSON size
- NAND vendor/model not available in customer sysdiagnose (Apple internal only)
- iPhone model mapping: iPhone14,2 = iPhone 13 Pro, iPhone15,2 = iPhone 14 Pro, etc.
