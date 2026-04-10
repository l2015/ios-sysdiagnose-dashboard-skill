# iPhone Sysdiagnose Analyzer

![Version](https://img.shields.io/badge/version-0.3.1-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![PWA](https://img.shields.io/badge/PWA-ready-purple) ![Offline](https://img.shields.io/badge/offline-100%25-yellow) ![Platform](https://img.shields.io/badge/platform-browser-lightgrey)

Analyze Apple device sysdiagnose diagnostic archives and generate interactive HTML reports. **No server required · runs 100% in browser · installable as PWA**.

---

## Quick Start

**Option 1 · GitHub Pages** *(recommended — no download needed)*
> Open [l2015.github.io/ios-sysdiagnose-dashboard-skill](https://l2015.github.io/ios-sysdiagnose-dashboard-skill) and drag in your `.tar.gz`

**Option 2 · Local file**
```bash
git clone https://github.com/l2015/ios-sysdiagnose-dashboard-skill.git
# or Download ZIP → extract
# double-click index.html, then drag in .tar.gz
```

**Option 3 · Install as PWA** *(works offline, add to desktop/home screen)*
> Click the install icon in your browser's address bar after opening index.html

---

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

---

## Project Structure

```
├── index.html               # Entry point — drag .tar.gz here (build artifact, do not edit manually)
├── manifest.json            # PWA manifest
├── sw.js                    # Service Worker (offline cache)
├── lib/                     # Browser dependencies (pako / sql.js / WASM)
├── icons/                   # PWA icons
└── references/
    └── features.md          # Feature checklist
```

> All data processing happens locally in the browser. Nothing is uploaded.

---

## Branches

| Branch | Type | Best for |
|--------|------|---------|
| `master` (default) | Node.js CLI | Developers, Linux servers, automation |
| `browser-app` | Single HTML | Quick browser use, no setup |
| `pwa` | PWA (offline capable) | Best UX, installable like an app |

---

## Version

Current: **v0.3.1** — Memory-safe interval sampling (fixes OOM on large iPhone Safari / PWA data >200MB)

Full changelog → [`CHANGELOG.md`](CHANGELOG.md)

---

## License

MIT
