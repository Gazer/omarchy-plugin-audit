# Omarchy Plugin Audit

> Audit Omarchy plugins before you update. Track the last scanned commit, see what changed, and get a readable security report with commit hash — static + optional AI.

Omarchy plugins are git repos that ship QML/Qt + JavaScript running inside your shell (Quickshell/Hyprland). That logic can open files, call the network, and execute processes — potentially malicious if not reviewed. This tool gives you a **semi-static report** (`Astro` site you can self-host) per plugin and commit, so you can decide before `omarchy update`.

**All reports and pages are in English. CLI is in English.**

Live example: `https://github.com/jankeesvw/omarchy-downloads` (bar widget that shows recent downloads, `FolderListModel` + `StandardPaths`, no network/process).

---

## Features

- **Git-aware:** `git ls-remote HEAD` → compare with `data/state.json` (last scanned commit stored alongside reports), `git diff lastScanned..HEAD` to show what changed before you update
- **Static analysis (QML/JS):**
  - File ops: `FolderListModel`, `StandardPaths`, `Util.fileUrl`, `File.read`
  - Network: `XmlHttpRequest`, `fetch`, `WebSocket`, `Qt.openUrlExternally`, remote `<img src>`
  - Execution: `Process { command: [...] }`, `Shell.exec`, `eval`/`Function`, `Loader`, `Qt.createComponent`
  - FS writes, `ipcTarget`/`IpcHandler` (validated `if` → `medium`, unvalidated → `high`)
  - Obfuscation: long base64, `\x`/`\u` escapes, minified lines, `eval` with `+`, `fromCharCode`, remote URLs, binaries
  - Scoring: `critical 10, high 5, medium 2, low 1, info 0` → `safe/low/medium/high/critical`; `Possible obfuscation` if ≥2 or any `critical`
  - Expected imports (`import Quickshell`, `import qs.*`) are `info` and shown separately, not counted as risk
- **AI review (optional):** `opencode run -m opencode-go/muse-spark-1.2-contributor` in the cloned plugin folder (`--dir tmpDir`, streaming to `stderr`, no timeout). Refines each static finding in context — e.g., `Qt.resolvedUrl("mx-ctl")` flagged as *Resolves file URL* is re-evaluated as *resolves executable later used in `statusProc.command = ["bash","-c",..., root.ctl, deviceName]`* with `refinedSeverity`, `reasoning`, `relatedCode`, `executableContext`, plus `whatItDoes` and a Mermaid `sequenceDiagram`.
- **Static site:** `Astro 4` + `Tailwind` reads `data/reports/*.json` and `data/history/*/*.json`, renders `/` (overview with static vs AI risk), `/plugins/<slug>/` (hero, What it does, AI Review, sequence diagram, refined findings, collapsed Details), `/plugins/<slug>/<commit>/` (history). Deploys to `Cloudflare Pages` (`dist/`).

---

## Quick Start

```bash
pnpm install
pnpm --filter @omarchy-audit/cli build
node packages/cli/dist/index.js https://github.com/jankeesvw/omarchy-downloads
# → data/reports/jankeesvw-omarchy-downloads.json
# → data/state.json (lastScanned)

pnpm --filter @omarchy-audit/site build
# → dist/ (publish to Cloudflare Pages)
```

Requires `Node 20`, `pnpm 9`, `git`, and `opencode` only if you use `--with-llm` (`opencode` on `PATH`, model `opencode-go/muse-spark-1.2-contributor` available).

---

## CLI

```bash
omarchy-audit <github-url> [options]

Options:
  --force              Force re-scan even if HEAD == lastScanned
  --json               Output JSON to stdout (for CI)
  --dry-run            Show diff without writing report
  --list               List audited plugins
  --diff               Show git diff since last scan without analyzing
  --keep-history <n>   Keep N historical reports (default 10)
  --with-llm           Run AI review with opencode-go/muse-spark-1.2-contributor (requires opencode, streams to stderr, no timeout)
  --llm-model <model>  LLM model for AI review (default: opencode-go/muse-spark-1.2-contributor)
  --help
```

**Examples:**

```bash
# First scan (stores commit hash)
node packages/cli/dist/index.js https://github.com/jankeesvw/omarchy-downloads

# See what changed since last scan before updating
node packages/cli/dist/index.js https://github.com/jankeesvw/omarchy-downloads --diff

# Re-scan (e.g., after analyzer update)
node packages/cli/dist/index.js https://github.com/jankeesvw/omarchy-downloads --force

# List tracked plugins
node packages/cli/dist/index.js --list
node packages/cli/dist/index.js --list --json

# JSON for CI
node packages/cli/dist/index.js https://github.com/jankeesvw/omarchy-downloads --json > report.json

# Deep contextual analysis — checks if Qt.resolvedUrl("mx-ctl") is actually an executable later executed
node packages/cli/dist/index.js https://github.com/gastonmira/omarchy-mx-master --with-llm
node packages/cli/dist/index.js https://github.com/gastonmira/omarchy-mx-master --with-llm --force --dry-run  # preview without writing

# Private repo (set token in env, not in repo)
GH_TOKEN=ghp_xxx node packages/cli/dist/index.js https://github.com/you/private-plugin --with-llm
```

State is versioned: `data/state.json` + `data/reports/<slug>.json` (snapshot overwrite) + `data/history/<slug>/<commit>.json` (keeps last 10).

---

## Reports

`data/reports/<slug>.json` (validated with `zod`):

```json
{
  "slug": "jankeesvw-omarchy-downloads",
  "commit": "3a4831032fccc24173533f7adeda4bffb5dcb664",
  "commitShort": "3a48310",
  "commitUrl": "https://github.com/.../commit/3a48310",
  "scannedAt": "2026-08-25T...",
  "fromCommit": null,
  "diff": { "filesChanged": [{"status":"A","path":"Panel.qml"}], "commits": [...] },
  "fileTree": [{"path":"Panel.qml","lines":145}],
  "inventory": { "fileOps": [...], "networkCalls": [...], "processes": [...], "imports": [...] },
  "findings": [{"severity":"medium","pattern":"FolderListModel","file":"DownloadsStore.qml","line":224}],
  "obfuscation": [],
  "score": 8,
  "riskLevel": "medium",
  "obfuscationFlag": false,
  "llmAnalysis": {
    "model": "opencode-go/muse-spark-1.2-contributor",
    "overallRisk": "medium",
    "summary": "...",
    "whatItDoes": "Shows recent downloads...",
    "sequenceDiagram": "sequenceDiagram\n  User->>Panel: ...",
    "findings": [{"refinedSeverity":"high","reasoning":"Resolves mx-ctl executable...","relatedCode":"statusProc.command = [...]"}]
  }
}
```

### Scoring

| Severity | Weight | Example |
|----------|--------|---------|
| critical | 10 | `Process { command: [...] }`, `eval(` |
| high | 5 | `fetch(`, `ipcTarget` (unvalidated), `writeFile` |
| medium | 2 | `FolderListModel`, `StandardPaths`, `ipcTarget` (validated) |
| low | 1 | — |
| info | 0 | `import Quickshell` (expected, shown separately) |

Overall `riskLevel`: `safe 0`, `low 4-7`, `medium 8-14`, `high 15-24`, `critical 25+` or any `critical` finding. `obfuscationFlag` if ≥2 obfuscation findings or any `critical`.

---

## Site

Astro site (`packages/site`) is static, no server needed.

- `/` — overview table: **Static risk** vs **AI risk** (when available), score, last commit, scanned date. Shows both — trust static for determinism, AI for context.
- `/plugins/<slug>/` — hero with risk (AI if exists else static, plus `static: X → AI: Y` pill when they differ), `What this plugin does`, AI Review card, Mermaid sequence diagram, refined findings as cards, `Process/Network` 2-col, `Changed files`, `Obfuscation`, collapsed `Details` (`Files opened`, `Expected imports`, `File tree`, `Raw table`).
- `/plugins/<slug>/<commit>/` — historical view.

```bash
pnpm --filter @omarchy-audit/site build   # → dist/
pnpm --filter @omarchy-audit/site dev --host 0.0.0.0 --port 4321  # preview http://localhost:4321/
pnpm --filter @omarchy-audit/site build && npx wrangler pages publish dist --project-name=omarchy-plugin-audit
```

`wrangler.toml` / `packages/site/wrangler.toml` configured for Cloudflare Pages (`dist`).

---

## Architecture

```
data/
  state.json                           # { slug: { url, lastScanned, lastRisk, lastScore } }
  reports/<slug>.json                  # snapshot (overwrite)
  history/<slug>/<commit>.json         # last 10
packages/cli/ (Node 20, TS, ESM)
  src/utils.ts         # parseGitUrl
  src/git.ts           # ls-remote (GIT_TERMINAL_PROMPT=0, no prompt), clone --depth 50, diff
  src/state.ts         # read/write state (tries multiple candidates)
  src/report.ts        # zod schemas (Report, LlmAnalysis)
  src/analyzer/inventory.ts  # regex patterns, dedup per file, skip // comments, IPC payload validation check
  src/analyzer/scoring.ts    # weights + thresholds
  src/analyzer/obfuscation.ts # base64, hex, unicode, minified, eval-dynamic, fromCharCode, remote-url, binary
  src/analyzer/index.ts      # fg glob, fileTree, inventory, riskFindings (exclude info), scoring
  src/analyzer/llm.ts        # buildLlmPrompt, runLlmAnalysis (opencode run --format json --auto --dir tmpDir, streaming stderr, no timeout), parseLlmResponse, collectFileContents
  src/index.ts         # commander, --with-llm, --diff, --list
packages/site/ (Astro 4 + Tailwind)
  src/pages/index.astro
  src/pages/plugins/[slug]/index.astro
  src/pages/plugins/[slug]/[commit].astro
  src/components/LlmAnalysis.astro  # whatItDoes + sequenceDiagram (mermaid@10) + refined cards
```

---

## Development

```bash
pnpm install
pnpm --filter @omarchy-audit/cli build
pnpm --filter @omarchy-audit/cli test   # vitest 18 tests
pnpm --filter @omarchy-audit/site build
pnpm --filter @omarchy-audit/site dev
```

Fixtures in `packages/cli/fixtures/` (`clean.qml`, `obfuscated.qml`, `panel-sample.qml`). No secrets in repo — `grep` for `GH_TOKEN` only shows env var name, not values; `data/` only has public plugin commits.

---

## License

MIT — see `LICENSE` if present.

---

## Why?

Omarchy (Hyprland-based) distributes plugins as git repos. Before `omarchy update` you want to know: *what files does it open? does it call the network? does it execute processes? is there hidden/obfuscated code? what changed since I last checked?* This repo gives you a one-command audit and a hostable report with commit hash for reference.
