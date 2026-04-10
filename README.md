# iPhone Sysdiagnose Analyzer

![Version](https://img.shields.io/badge/version-0.2.20c-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![OpenClaw Skill](https://img.shields.io/badge/OpenClaw-Skill-orange) ![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)

Analyze Apple device sysdiagnose diagnostic archives and generate interactive HTML reports. **OpenClaw Skill · Node.js CLI · cross-platform**.

> 📖 中文说明 → [`README_zh.md`](README_zh.md)

---

## Quick Start

**One-liner** *(recommended)*
```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git
cd ios-sysdiagnose-dashboard-skill
bash analyze.sh your-sysdiagnose.tar.gz
```

Report output: `report-<date>.html`

**Manual steps**
```bash
cd scripts && npm install
node extract.mjs <extracted-sysdiagnose-dir> -o data.json
node report.mjs data.json -o report.html
```

## Requirements

- Node.js 18+
- No native dependencies — pure JavaScript (sql.js)

## Features

| Module | Coverage |
|--------|---------|
| 🔋 Battery | Health %, charge cycles, capacity fade, temperature trend |
| 💾 NAND | Remaining life, PE cycle count, bad blocks, write amplification |
| 📱 Apps | Storage writes, screen-on time, memory peak, network traffic |
| 💥 Crashes | Jetsam, Safari, disk writes, CPU resource events |
| 📡 Device | Model, SoC, storage capacity, baseband version |

Supports iPhone / iPad / Watch / Vision Pro. Report auto-detects language (EN/ZH).

## OpenClaw Skill

After installation, upload a sysdiagnose archive and the AI automatically:

1. Extracts the archive
2. Parses PowerLog (SQLite) + ASP SMART + crash logs
3. Generates the HTML report

### Install

```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git ~/.openclaw/skills/ios-sysdiagnose-dashboard-skill
cd ~/.openclaw/skills/ios-sysdiagnose-dashboard-skill/scripts && npm install
```

## Project Structure

```
├── analyze.sh               # One-liner analysis script
├── SKILL.md                 # OpenClaw Skill definition
├── _meta.json               # ClawHub metadata
├── package.json
├── LICENSE
├── scripts/
│   ├── extract.mjs          # Data extraction
│   └── report.mjs           # HTML report generation
└── references/
    └── features.md          # Feature checklist
```

## Version

Current: **v0.2.20c** — `analyze.sh` one-liner, battery trend default 24h

Full changelog → [`CHANGELOG.md`](CHANGELOG.md)

---

## License

MIT
