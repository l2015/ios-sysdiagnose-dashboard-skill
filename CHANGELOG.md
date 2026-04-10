# Changelog

> [!NOTE]
> This project uses three branches: `master` (Node.js CLI), `browser-app` (single HTML), `pwa` (PWA — current active branch).

## [v0.3.1] — 2026-04-10

**pwa branch** — Memory-safe interval sampling (fixes OOM on large iPhone Safari / PWA data >200MB)

## [v0.3.0] — 2026-04-08

**pwa branch** — PWA support: `manifest.json` + Service Worker; external deps in `lib/` (zero network dependency); GitHub Pages config (`404.html`, `.nojekyll`)

## [v0.2.29] — 2026-04-08

**browser-app branch** — Pure browser single-file cleanup; Node.js CLI source removed

## [v0.2.28] — 2026-04-08

- Fixed电量趋势 (`_trendData`) display bug
- Fixed crash log path resolution

## [v0.2.27] — 2026-04-08

**Critical data extraction fixes**

- Fixed browser tar parser `longName` fatal bug (GNU long filename loss → all VFS paths wrong)
- PowerLog fallback: search by path first, then by `.PLSQL` extension
- PowerLog missing → UI warning bar
- Restored 4 missing extraction functions: brightness trend, energy, CPU, process exits
- Debug mode redesign: 6-module status panel + raw log on click
- `build.js` script tag escape: now escapes both `<script>` and `</script>`
- Crash diagnostics enhanced: console outputs actual file count in directory

## [v0.2.22] — 2026-04-08

**build.js extraction bug fixes**

- Helper extraction: bracket-aware counting (`opts = {}` no longer truncated)
- `generateReport` extraction: fixed CLI code (`process.argv`) leaking into browser bundle → ReferenceError
- Removed `CHART_JS` reference, browser uses `CHART_JS_DATA` separate injection

## [v0.2.20] — 2026-04-08

- New `analyze.sh` one-liner script
- Battery trend default: 24h; hover tooltip fixed after range switch

## [v0.2.17] — 2026-04-08

**Multi-device support**

- Dynamic device info from `remotectl_dumpstate.txt` (no more hardcoded SoC mappings)
- Dynamic PowerLog column detection via `PRAGMA table_info` (iPad no longer returns empty)
- App display name auto-inferred from bundle ID (no more ~40-entry map)
- Report title/footer adapts to device type (iPhone/iPad/Watch)
- Timezone-based language detection (no more hardcoded Chinese App prefix list)
- Fixed path trailing `/` causing timezone parsing failure

## [v0.2.15] — 2026-04-08

- Removed `strings` command dependency, pure JS implementation

## [v0.2.14] — 2026-04-08

- better-sqlite3 → sql.js (pure JS, no native compilation, cross-platform)

## [v0.2.0] — 2026-04-08

- Python → Node.js rewrite; single dependency sql.js

## [v0.1.0] — 2026-04-08

- Initial release: 18 data extraction categories
