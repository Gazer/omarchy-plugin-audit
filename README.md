# Omarchy Plugin Audit

Audit Omarchy plugins (git repos with QML/Qt) before updating. Tracks last scanned commit, diffs changes, and generates a static report with commit hash.

**All reports and pages are in English.**

## Quick Start

```bash
pnpm install
pnpm --filter @omarchy-audit/cli build
node packages/cli/dist/index.js https://github.com/jankeesvw/omarchy-downloads
# Report: data/reports/jankeesvw-omarchy-downloads.json
# State: data/state.json

pnpm --filter @omarchy-audit/site build
# Static site: dist/
```

## CLI

```bash
omarchy-audit <github-url> [options]

Options:
  --force            Force re-scan even if HEAD == lastScanned
  --json             Output JSON to stdout (for CI)
  --dry-run          Show diff without writing report
  --list             List audited plugins
  --diff             Show git diff since last scan without analyzing
  --keep-history <n> Keep N historical reports (default 10)
  --help
```

Examples:

```bash
# First scan
node packages/cli/dist/index.js https://github.com/jankeesvw/omarchy-downloads

# Check what changed since last scan (before updating)
node packages/cli/dist/index.js https://github.com/jankeesvw/omarchy-downloads --diff

# Re-scan
node packages/cli/dist/index.js https://github.com/jankeesvw/omarchy-downloads --force

# List tracked plugins
node packages/cli/dist/index.js --list

# JSON output for CI
node packages/cli/dist/index.js https://github.com/jankeesvw/omarchy-downloads --json > report.json
```

State is stored in `data/state.json` (versioned alongside reports). Each run writes `data/reports/<slug>.json` (snapshot overwrite) and `data/history/<slug>/<commit>.json` (keeps last 10).

## What the Report Covers

- **Operations summary:** file open (`FolderListModel`, `StandardPaths`, `File.read`), file writes
- **Network calls:** `XmlHttpRequest`, `fetch`, `WebSocket`, `Qt.openUrlExternally`, remote `<img src>`
- **Process execution:** `Process { command: ... }`, `Shell.exec`, `eval`, `Function`, `Loader`
- **Imports/IPC:** `import Quickshell`, `ipcTarget`
- **Obfuscation checks:** long base64, hex escapes, unicode escapes, minified lines, `eval` with dynamic strings, `fromCharCode`, remote URLs, binaries
- **Scoring:** critical (10), high (5), medium (2), low (1), info (0) → risk `safe/low/medium/high/critical`; flag `Possible obfuscation` if ≥2 findings or any critical obfuscation

Example: `jankeesvw/omarchy-downloads` scores `medium` (13) — no network/process, only `FolderListModel` + `StandardPaths` + `ipcTarget`.

## Site

Astro static site reads `data/reports/*.json` and `data/history/*/*.json`:

- `/` — overview table (plugin, last commit, scanned date, risk badge, score)
- `/plugins/<slug>/` — latest report (commit hash linked to GitHub, diff since last scan, operations, file tree)
- `/plugins/<slug>/<commit>/` — historical commit view

```bash
pnpm --filter @omarchy-audit/site build   # outputs to dist/
pnpm --filter @omarchy-audit/site dev     # local preview
```

Deploy to Cloudflare Pages:

```bash
pnpm deploy
# or: npx wrangler pages publish dist --project-name=omarchy-plugin-audit
```

See `packages/site/wrangler.toml` and root `wrangler.toml`.

## Testing

```bash
pnpm --filter @omarchy-audit/cli test
```

Fixtures: `clean.qml`, `obfuscated.qml`, `panel-sample.qml` in `packages/cli/fixtures/`.

## Structure

```
data/
  state.json
  reports/<slug>.json
  history/<slug>/<commit>.json
packages/cli/    # Node CLI
packages/site/   # Astro site
dist/            # built site
```
