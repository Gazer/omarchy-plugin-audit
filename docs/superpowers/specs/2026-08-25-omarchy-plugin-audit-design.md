# Design Spec: Omarchy Plugin Audit — CLI + Reporte Astro

**Fecha:** 2026-08-25
**Estado:** Draft aprobado (secciones 1-6 validadas)
**Decisión arquitectónica:** Monorepo Node + Astro integrado (Enfoque A)

---

## 1. Resumen / Objetivo

App simple para auditar plugins de Omarchy (repos git con QML/Qt/Quickshell, ej. `https://github.com/jankeesvw/omarchy-downloads`) antes de actualizar.

**Problema:** QML define lógica con acceso a FS, red y ejecución de procesos. Código potencialmente maligno si no se analiza. Usuario quiere saber antes de `omarchy update` qué cambió desde el último commit escaneado.

**Solución:** CLI Node `omarchy-audit <github-url>` que:
1. Trackea último commit escaneado en `data/state.json` (junto al reporte, versionado).
2. Hace diff `lastScanned..HEAD` para ver qué cambió.
3. Corre análisis estático (inventario + scoring + detección obfuscación) sobre `.qml/.js/.json/.sh`.
4. Genera `data/reports/<slug>.json` (snapshot overwrite) + `data/history/<slug>/<commit>.json` (histórico últimos N).
5. Astro genera sitio estático `dist/` con páginas `/` (índice) y `/plugins/<slug>/` (+ `/plugins/<slug>/<commit>/` histórico) hosteable en Cloudflare Pages como referencia con commit hash.

**Éxito:** Un comando audita un plugin, genera reporte legible con operaciones, archivos abiertos, llamadas de red, y flag de riesgo/obfuscación, con commit hash trazable.

---

## 2. Arquitectura General

### 2.1 Monorepo pnpm workspaces

```
omarchy_plugin_summary/  (root)
├── package.json          # workspaces: ["packages/*"], scripts root
├── pnpm-workspace.yaml
├── data/
│   ├── state.json                      # { "<slug>": { url, lastScanned, lastScannedAt, lastRisk } }
│   ├── reports/
│   │   └── <slug>.json                 # snapshot: último reporte (overwrite)
│   └── history/
│       └── <slug>/
│           └── <commit>.json           # histórico (últimos 10, para páginas por commit)
├── packages/
│   ├── cli/                            # Node CLI (TypeScript, ESM)
│   │   ├── src/
│   │   │   ├── index.ts                # commander entry
│   │   │   ├── git.ts                  # ls-remote, clone, diff
│   │   │   ├── analyzer/
│   │   │   │   ├── inventory.ts        # fileOps, network, processes, imports
│   │   │   │   ├── scoring.ts          # severidad + score
│   │   │   │   ├── obfuscation.ts      # heurísticas oculto
│   │   │   │   └── index.ts            # orquesta por archivo
│   │   │   ├── report.ts               # genera JSON schema
│   │   │   └── state.ts                # lee/escribe data/state.json
│   │   ├── fixtures/                   # qml benigno/maligno para tests
│   │   └── package.json
│   └── site/                           # Astro 4
│       ├── astro.config.mjs
│       ├── src/
│       │   ├── pages/
│       │   │   ├── index.astro         # lista plugins + badge riesgo
│       │   │   ├── plugins/[slug]/index.astro        # snapshot
│       │   │   └── plugins/[slug]/[commit].astro     # histórico
│       │   ├── components/
│       │   │   ├── RiskBadge.astro
│       │   │   ├── FindingsTable.astro
│       │   │   ├── DiffView.astro
│       │   │   └── FileTree.astro
│       │   └── content/ (lee data/reports/*.json via fs)
│       └── package.json
└── docs/superpowers/specs/
```

**Justificación data en raíz:** pedido explícito usuario, versionado junto al reporte, compartido entre CLI y Astro sin duplicar. Astro lo lee vía `fs.readFile` / `import`.

### 2.2 Stack

- **CLI:** Node 20 + TypeScript + `commander`, `simple-git`, `fast-glob`, `picocolors`, `zod` (validación schema)
- **Análisis:** regex heurístico + `fast-glob`, sin parser QML nativo pesado (AST-lite). Suficiente para Omarchy plugins (QML es declarativo + JS embebido).
- **Site:** Astro 4, `getStaticPaths` leyendo `data/reports/*.json` y `data/history/*/*.json`, Tailwind o CSS simple, deploy Cloudflare Pages (`wrangler` o `cloudflare-pages` adapter).
- **Testing:** Vitest (unit + fixtures), e2e contra repo real.
- **Pkg manager:** pnpm workspaces.

### 2.3 Diagrama flujo

```
[URL] -> git ls-remote HEAD
          |
          +-- HEAD == state[slug].lastScanned? --(yes, !force)--> "up to date"
          |
          +-- (no) -> git clone --depth 50 /tmp/omarchy-audit/<slug>
                     -> git diff lastScanned..HEAD --name-status
                     -> analyzer: glob **/*.{qml,js,json,sh} -> inventory + scoring + obfuscation
                     -> report.json (commit, diff, inventory, findings, obfuscation, score, risk, fileTree)
                     -> write data/reports/<slug>.json (overwrite)
                     -> copy to data/history/<slug>/<commit>.json (keep last 10)
                     -> update data/state.json
                     -> astro build -> dist/plugins/<slug>/ + dist/plugins/<slug>/<commit>/
                     -> wrangler deploy (Cloudflare)
```

---

## 3. Flujo CLI y Tracking Commits

### 3.1 Comandos

```bash
pnpm audit https://github.com/jankeesvw/omarchy-downloads
# o binario: omarchy-audit <url> [options]

Options:
  --force         Re-escanea aunque HEAD == lastScanned
  --json          Output JSON a stdout (para CI)
  --dry-run       Muestra diff sin escribir reporte
  --list          Lista plugins auditados (lee state.json)
  --diff <url>    Solo muestra git diff desde último escaneado, sin analizar
  --keep-history N  Mantiene N históricos (default 10)
```

URL parsing: `https://github.com/<owner>/<repo>(.git)?(#branch)?` → slug `<owner>-<repo>` (ej. `jankeesvw-omarchy-downloads`). Soporta `git@github.com:owner/repo.git`.

### 3.2 Git operaciones

1. **ls-remote rápido:** `git ls-remote <url> HEAD` → HEAD sha sin clonar. Si falla (privado, red), error claro.
2. **Comparación state:** `data/state.json[slug].lastScanned`. Si no existe → treat como first scan (`from = null`, diff = todos los archivos).
3. **Clone shallow:** `simple-git clone --depth 50 --single-branch <url> /tmp/omarchy-audit/<slug>-<rand>`. Depth 50 suficiente para diff; si `lastScanned` más viejo que 50, hacer `fetch --deepen` o full clone fallback.
4. **Diff:** `git diff --name-status <lastScanned>..HEAD` (si first scan, `git ls-files`). También `git log --oneline <lastScanned>..HEAD` para lista commits.
5. **Checkout:** ya en HEAD por clone depth, no necesita checkout extra.
6. **Cleanup:** borra tmp al final (o mantiene cache si `--cache`).

### 3.3 Estado (data/state.json)

```json
{
  "jankeesvw-omarchy-downloads": {
    "url": "https://github.com/jankeesvw/omarchy-downloads",
    "lastScanned": "3a483108f...",
    "lastScannedAt": "2026-08-25T10:00:00Z",
    "lastRisk": "low",
    "lastScore": 12
  }
}
```

Snapshot overwrite: `data/reports/<slug>.json` siempre es último. Histórico en `data/history/<slug>/<commit>.json` con prune a N=10 (borra más antiguo al escribir nuevo).

Concurrencia: CLI corre serial por slug, lock file `/tmp/omarchy-audit.lock` si se invoca en CI paralelo.

---

## 4. Análisis Estático — Inventario + Scoring

### 4.1 Categorías

| Categoría | Patrones (regex) | Severidad base | Ejemplo |
|-----------|------------------|----------------|---------|
| **File Open** | `FolderListModel`, `FileIO`, `StandardPaths`, `Util\.fileUrl`, `Qt\.resolvedUrl`, `File\.read`, `open\(`, `readFile` | medium (3) | `DownloadsStore.folderUrl` |
| **Network** | `XmlHttpRequest`, `fetch\(`, `WebSocket`, `Qt\.openUrlExternally`, `<img[^>]+src="http`, `http\.request`, `socket` | high (6) | `Text` con `img src` remoto |
| **Exec** | `Process\s*\{[^}]*command`, `exec\(`, `Shell\.exec`, `Qt\.createProcess`, `system\(`, `spawn`, `eval\(`, `Function\(`, `Loader\s*\{[^}]*source:` dinámico | critical (10) | `Process { command: [...] }` |
| **FS Write** | `writeFile`, `copy\(`, `remove\(`, `mkdir`, `rm\s`, `\.remove`, `\.write` | high (7) | `FileIO.write` |
| **Imports/Perms** | `import Quickshell`, `import qs\.`, `Hyprland`, `IpcHandler`, `Shell`, `DS` | low (2) info | `import Quickshell` |
| **IPC/Shell** | `ipcTarget`, `shell\.summon`, `executeCommand`, `runCommand` | high (6) | `ipcTarget: "jankeesvw.downloads"` |

Scoring: suma ponderada. `riskLevel`:
- `safe` 0-4
- `low` 5-9
- `medium` 10-19
- `high` 20-34
- `critical` 35+ o cualquier `critical` finding

Findings: `{ severity, category, pattern, file, line, column, snippet (≤120 chars), description }`.

### 4.2 File Tree

`fast-glob` sobre repo clonado, excluye `.git`, `node_modules`, `*.png`, etc. Lista con `size`, `lines`, `isQml`, `isJs`, `isBinary`.

---

## 5. Detección Obfuscación / Código Oculto

Heurísticas (cada una con threshold):

1. **Base64 larga:** regex `[A-Za-z0-9+/]{100,}={0,2}`, valida ratio base64 >0.8, decodifica y check si contiene `eval`, `http`, `exec`. Score +8.
2. **Hex escapes:** `\\x[0-9a-fA-F]{2}` count >10 en una línea o >30 por archivo. Score +5.
3. **Unicode escapes:** `\\u[0-9a-fA-F]{4}` count >15 por archivo. Score +4.
4. **Minificado:** línea >300 chars y ratio `;` o `}` alto, o `entropy <3.5` y longitud >200. Score +6.
5. **Eval dinámico:** `eval\(.*\+`, `Function\(.*\+`, `Qt\.createQmlObject\(.*\+`, `Loader.*source:\s*[a-zA-Z_$]` (no string literal). Score +10 critical.
6. **fromCharCode:** `fromCharCode|charCodeAt|String\.fromCharCode` Score +7.
7. **Comentarios ocultan código:** `//.*\\n\s*[a-zA-Z]`, `/*[^*]*\*/` con código dentro, `<!--`. Score +3.
8. **Binarios ocultos:** `.so`, `.bin`, `.sh`, `.py` ejecutables, `chmod +x`, `#!/bin`. Lista como `binary` finding.
9. **URL remota en QML:** `source:\s*["']https?://`, `Qt.createComponent\(\s*["']https?` Score +8.

Regla: `obfuscationFlag = obfuscationFindings.length >=2 || maxObfuscationScore >=10` → banner "Posible ofuscación" en reporte.

Cada hallazgo: `{ type, file, line, snippet, decodedPreview?, severity }`.

---

## 6. Modelo de Datos y Sitio Astro

### 6.1 Report JSON schema (zod)

```ts
type Report = {
  slug: string;               // "jankeesvw-omarchy-downloads"
  url: string;
  commit: string;             // full sha
  commitShort: string;        // 7 chars
  commitUrl: string;          // https://github.com/.../commit/<sha>
  scannedAt: string;          // ISO
  fromCommit: string | null;  // lastScanned o null first scan
  fromCommitShort: string | null;
  diff: {
    filesChanged: { status: "A"|"M"|"D"|"R", path: string }[];
    commits: { sha: string, message: string, author: string, date: string }[];
    stats: { added: number, modified: number, deleted: number };
  };
  fileTree: { path: string, lines: number, size: number, type: "qml"|"js"|"json"|"other"|"binary" }[];
  inventory: {
    fileOps: Finding[];
    networkCalls: Finding[];
    processes: Finding[];
    imports: Finding[];
  };
  findings: Finding[];
  obfuscation: ObfuscationFinding[];
  score: number;
  riskLevel: "safe"|"low"|"medium"|"high"|"critical";
  obfuscationFlag: boolean;
};
```

Validación `zod` en CLI antes de escribir.

### 6.2 Astro

- `astro.config.mjs`: `output: "static"`, `adapter` no necesario para Cloudflare static (o `@astrojs/cloudflare` si SSR no).
- `src/pages/index.astro`: lee `data/state.json` + `data/reports/*.json`, tabla con columns: plugin, último commit (link), fecha, risk badge (color), score, link a `/plugins/<slug>/`.
- `src/pages/plugins/[slug]/index.astro`: `getStaticPaths` de `data/reports/*.json`, renderiza reporte snapshot. Componentes: `RiskBadge`, `FindingsTable` (filtrable por severidad), `DiffView` (lista archivos cambiados), `ObfuscationAlert`, `FileTree`.
- `src/pages/plugins/[slug]/[commit].astro`: histórico, `getStaticPaths` de `data/history/*/*.json`.
- Estilo: minimal, sin JS pesado, tablas con severidad colores (safe=gris, low=verde, medium=amarillo, high=naranja, critical=rojo).
- Cada página muestra header con commit hash linkeado a GitHub + badge riesgo + timestamp.

### 6.3 Deploy Cloudflare

- `wrangler pages publish dist` o `cloudflare` adapter.
- `public/_redirects` si necesario.
- CI GitHub Action opcional: `on: schedule: cron: "0 6 * * *"` + `workflow_dispatch`, corre `pnpm audit --all` (itera state.json), luego `pnpm --filter site build` + deploy.

---

## 7. Error Handling

- `git ls-remote` falla: "No se pudo alcanzar <url> — verifica URL o acceso red" (exit 1).
- Repo privado sin auth: detecta `403/401` en ls-remote, sugiere `GH_TOKEN`.
- `state.json` corrupto: backup a `state.json.bak`, recrea vacío, warning.
- `data/reports/<slug>.json` inválido (zod fail): no lo lee Astro, muestra "reporte corrupto" y ofrece re-scan.
- QML no parseable: fallback a regex line-by-line, no crashea.
- Clone shallow insuficiente (lastScanned no en history): `git fetch --unshallow` o `--depth 1000` retry, luego full clone.
- Tmp lleno: error con path y sugerencia `--tmp-dir`.

---

## 8. Testing

- **Unit (vitest, packages/cli):**
  - `inventory.test.ts`: fixtures `Panel.qml`, `DownloadsStore.qml` → espera `FolderListModel`, `StandardPaths`, `FloatingWindow` findings.
  - `scoring.test.ts`: casos safe/low/high/critical.
  - `obfuscation.test.ts`: fixtures `obfuscated.qml` (base64 200 chars, `eval(atob(...))`, `Loader source: dynamicUrl`) → flag true; `clean.qml` → false.
  - `git.test.ts`: mock simple-git para ls-remote/diff.
  - `state.test.ts`: read/write/prune history.
- **E2E:**
  - `e2e/audit.test.ts`: corre CLI real contra `jankeesvw/omarchy-downloads` tmp, verifica reporte generado, score esperado low (solo FolderListModel, sin red/exec), no obfuscation.
  - Snapshot de report JSON.

---

## 9. Roadmap Implementación (para plan)

1. Scaffold monorepo pnpm + packages/cli (commander, git, state)
2. Implementar git.ts + state.ts + report schema
3. Analyzer inventory + scoring (regex patterns)
4. Obfuscation detector
5. CLI orquestación (clone, diff, analyze, write)
6. Astro site (index + [slug] + [commit] pages, components)
7. Fixtures y tests vitest + e2e
8. Deploy Cloudflare (wrangler config, build scripts)
9. CI cron opcional

---

## 10. Alternativas Consideradas

- **B (CLI desacoplado):** descartado para MVP, posible evolución si >20 plugins.
- **C (grep simple):** insuficiente para obfuscación, descartado.
- **Parser QML nativo (tree-sitter-qml):** evaluado, overhead alto, regex suficiente para heurística; se puede migrar luego si falsos positivos altos.

---

## 11. Riesgos

- Regex puede fallar con QML multilínea complejo → mitigado con tests fixtures reales.
- Shallow clone con diff fallido → fallback fetch.
- Cloudflare Pages límite 20k archivos → no aplica (pocos plugins).

---

*Spec validado por secciones con usuario 2026-08-25. Siguiente paso: `writing-plans` skill para plan de implementación.*
