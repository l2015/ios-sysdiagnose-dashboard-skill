# iPhone Sysdiagnose Analyzer

![Version](https://img.shields.io/badge/version-0.2.20c-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![OpenClaw Skill](https://img.shields.io/badge/OpenClaw-Skill-orange) ![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)

Analyze Apple device sysdiagnose (.tar.gz) archives and generate interactive HTML reports.

> 📖 中文说明 → [`README_zh.md`](README_zh.md)

---

## ⚡ Quick Start

**Step 1 — Install the skill:**
Ask OpenClaw to install the iPhone sysdiagnose analyzer from this repo:
https://github.com/l2015/ios-sysdiagnose-dashboard-skill

**Step 2 — Analyze your file:**
Drop the sysdiagnose .tar.gz file path into the chat — OpenClaw handles the rest automatically.

---

## 🖥️ Alternative: Web Browser (no install)

Don't want the CLI? Open the report in your browser directly:

```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git
# Open browser-app/index.html and drag in your .tar.gz file
```

**browser-app** branch = same engine, pure browser, no Node.js needed.

---

## 💻 Manual CLI (power users)

### Requirements

- Node.js 18+
- bash (Linux/macOS/WSL)
- No native dependencies

### One-liner

```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git
cd ios-sysdiagnose-dashboard-skill
bash analyze.sh your-sysdiagnose.tar.gz
```

Report output: `report-<date>.html`

### Manual steps

```bash
# Install dependencies
cd scripts && npm install && cd ..

# Step 1: Extract archive
tar xzf your-sysdiagnose.tar.gz -C /tmp
BASE=$(find /tmp/sysdiagnose_* -maxdepth 1 -type d | head -1)

# Step 2: Extract structured data
node scripts/extract.mjs "$BASE" -o data.json

# Step 3: Generate report
node scripts/report.mjs data.json -o report.html
```

---

## ✅ Features

| Module | Coverage |
|--------|---------|
| 🔋 Battery | Health %, cycles, capacity fade, temperature trend |
| 💾 NAND | Remaining life, PE cycles, bad blocks, WAF |
| 📱 Apps | Storage writes, screen-on time, memory peak, network traffic |
| 💥 Crashes | Jetsam, Safari, disk writes, CPU resource |
| 📡 Device | Model, SoC, storage capacity, baseband |

Supports iPhone / iPad / Watch / Vision Pro. Report auto-detects language (EN/ZH).

## Branches

| Branch | Type | Best for |
|--------|------|----------|
| `master` (default) | Node.js CLI | Developers, Linux servers, automation |
| `browser-app` | Single HTML | Quick browser use, no setup |
| `pwa` | PWA (offline capable) | Best UX, installable like an app |

---

## Version

Current: **v0.2.20c** — `analyze.sh` one-liner, battery trend default 24h

Full changelog → [`CHANGELOG.md`](CHANGELOG.md)

---

## License

MIT
