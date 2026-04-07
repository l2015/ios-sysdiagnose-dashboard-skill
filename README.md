# iPhone Sysdiagnose Analyzer

Analyze iPhone sysdiagnose diagnostic archives — battery health, NAND flash lifespan, app usage, crash logs — and generate a beautiful HTML report.

Also works as an [OpenClaw](https://github.com/openclaw/openclaw) skill for automated analysis.

## Features

| Category | Data |
|----------|------|
| **Battery** | Health %, cycle count, capacity degradation, temperature, voltage, trend chart |
| **NAND Flash** | Remaining lifespan, host/NAND read/write, PE erase cycles, bad blocks, write amplification |
| **App Ranking** | NAND writes, screen time, energy, CPU, peak memory, network traffic |
| **Crashes** | Jetsam memory kills, Safari crashes, disk write throttling, CPU resource events |
| **App Exits** | Jetsam kill ranking (which app gets killed most) |
| **Device** | Model, SoC, storage, baseband |

## Quick Start

```bash
# Clone and install
git clone https://github.com/<you>/iphone-sysdiagnose.git
cd iphone-sysdiagnose/scripts
npm install

# Extract your sysdiagnose archive
WORK=$(mktemp -d)
tar xzf your-sysdiagnose.tar.gz -C "$WORK"
BASE=$(find "$WORK" -maxdepth 1 -type d -name "sysdiagnose_*" | head -1)

# Run analysis
node extract.mjs "$BASE" -o data.json
node report.mjs data.json -o report.html

# Cleanup
rm -rf "$WORK"
```

Open `report.html` in your browser. Done.

## Requirements

- **Node.js** 18+
- **`strings`** command (pre-installed on macOS and Linux)

No Python, no pip, no native compilation. Just Node.

## Output

Apple HIG-style dark theme HTML report with:

- 5 KPI cards (battery health, cycles, NAND remaining, crashes, app exits)
- Battery detail card with capacity breakdown
- NAND flash health card with PE cycles, WAF, bad blocks
- Interactive battery trend chart (hover/tap for values)
- Crash analysis by category
- Jetsam memory kill ranking
- App NAND write ranking, screen time, peak memory, network usage
- Responsive layout (desktop, tablet, mobile)
- Chinese/English auto-detection based on installed apps

## OpenClaw Skill

This project doubles as an [OpenClaw](https://docs.openclaw.ai) skill. Install it and the AI will automatically:

1. Extract the uploaded sysdiagnose archive
2. Run data extraction
3. Generate and return the HTML report

No manual steps needed.

### Install as Skill

```bash
# Clone into your skills directory
git clone https://github.com/<you>/iphone-sysdiagnose.git ~/.openclaw/skills/iphone-sysdiagnose

# Install dependencies
cd ~/.openclaw/skills/iphone-sysdiagnose/scripts && npm install
```

Then just upload a `.tar.gz` sysdiagnose file in your OpenClaw chat.

## Project Structure

```
iphone-sysdiagnose/
├── SKILL.md                # OpenClaw skill definition
├── _meta.json              # ClawHub metadata
├── scripts/
│   ├── package.json        # better-sqlite3 dependency
│   ├── extract.mjs         # Data extraction from PowerLog + ASP SMART + crash logs
│   └── report.mjs          # HTML report generator
└── references/
    └── features.md         # Full PowerLog table reference (60+ tables)
```

## How It Works

The sysdiagnose archive contains several data sources:

| Source | Location | What |
|--------|----------|------|
| **PowerLog** | `logs/powerlogs/*.PLSQL` | SQLite database with battery, app, system metrics |
| **ASP SMART** | `ASPSnapshots/asptool_snapshot.log` | NAND flash health data |
| **Crash logs** | `crashes_and_spins/*.ips` | Jetsam, Safari, disk write, CPU crashes |

`extract.mjs` reads these sources and outputs a structured JSON file. `report.mjs` turns that JSON into a self-contained HTML file (no external dependencies, works offline).

## Development

```bash
cd scripts
npm install           # Install dependencies
node extract.mjs /path/to/sysdiagnose -o test.json   # Test extraction
node report.mjs test.json -o test.html               # Test report
```

## Known Limitations

- NAND vendor/model not visible in customer sysdiagnose (Apple internal only)
- PowerLog table schema varies across iOS versions
- Cumulative stats (uptime, Jetsam kills) are since last "Erase All Content and Settings"
- Requires the `strings` system command for ASP SMART parsing

## License

MIT
