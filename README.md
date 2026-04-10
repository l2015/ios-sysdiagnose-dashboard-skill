# iPhone Sysdiagnose Analyzer

![Version](https://img.shields.io/badge/version-0.2.29-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Platform](https://img.shields.io/badge/platform-browser-lightgrey) ![Single File](https://img.shields.io/badge/single%20HTML-file-blue)

Analyze Apple device sysdiagnose diagnostic archives and generate interactive HTML reports. **Pure browser · single HTML file · no server required**.

> 📖 中文说明 → [`README_zh.md`](README_zh.md)

---

## Quick Start

**Option 1 · GitHub Pages** *(recommended — no download needed)*
> Open [l2015.github.io/ios-sysdiagnose-dashboard-skill](https://l2015.github.io/ios-sysdiagnose-dashboard-skill) and drag in your `.tar.gz`

**Option 2 · Local file**
```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git
# or Download ZIP → extract
```
Then open `index.html` in your browser and drag in your `.tar.gz` file.

Report output: `report-<date>.html`

## Requirements

No requirements — runs entirely in the browser. Works offline after first load.

## Features

| Module | Coverage |
|--------|---------|
| 🔋 Battery | Health %, charge cycles, capacity fade, temperature trend |
| 💾 NAND | Remaining life, PE cycle count, bad blocks, write amplification |
| 📱 Apps | Storage writes, screen-on time, memory peak, network traffic |
| 💥 Crashes | Jetsam, Safari, disk writes, CPU resource events |
| 📡 Device | Model, SoC, storage capacity, baseband version |

Supports iPhone / iPad / Watch / Vision Pro. Report auto-detects language (EN/ZH).

Full feature checklist → [`references/features.md`](references/features.md)

## Branches

| Branch | Type | Best for |
|--------|------|---------|
| `master` (default) | Node.js CLI | Developers, Linux servers, automation |
| `browser-app` | Single HTML | Quick browser use, no setup |
| `pwa` | PWA (offline capable) | Best UX, installable like an app |

## Project Structure

```
├── index.html               # Single-file browser app (drag .tar.gz here)
├── references/
│   └── features.md          # Feature checklist
├── _meta.json               # ClawHub metadata
└── package.json
```

> All data processing happens locally in the browser. Nothing is uploaded.

## Version

Current: **v0.2.29** — Pure browser single-file release

Full changelog → [`CHANGELOG.md`](CHANGELOG.md)

---

## License

MIT
