import fg from 'fast-glob';
import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeFile } from './inventory.js';
import { scoreFindings } from './scoring.js';
import { detectObfuscation } from './obfuscation.js';

export async function analyzeRepo(tmpDir: string, _slug: string) {
  const patterns = ['**/*.{qml,js,json,sh}', '!**/.git/**', '!**/node_modules/**'];
  const files = await fg(patterns, { cwd: tmpDir, dot: false });

  const findings: ReturnType<typeof analyzeFile> = [];
  const obfuscation: ReturnType<typeof detectObfuscation> = [];
  const fileTree: { path: string; lines: number; size: number; type: 'qml' | 'js' | 'json' | 'other' | 'binary' }[] = [];

  for (const rel of files) {
    const abs = path.join(tmpDir, rel);
    let content = '';
    try {
      content = await fs.readFile(abs, 'utf8');
    } catch {
      content = '';
    }
    let size = 0;
    try {
      const stat = await fs.stat(abs);
      size = stat.size;
    } catch {
      size = 0;
    }
    const lines = content ? content.split('\n').length : 0;
    let type: 'qml' | 'js' | 'json' | 'other' | 'binary' = 'other';
    if (/\.(so|bin|o|a)$/.test(rel)) type = 'binary';
    else if (rel.endsWith('.qml')) type = 'qml';
    else if (rel.endsWith('.js')) type = 'js';
    else if (rel.endsWith('.json')) type = 'json';

    fileTree.push({ path: rel, lines, size, type });

    if (type === 'qml' || type === 'js' || type === 'other') {
      findings.push(...analyzeFile(rel, content));
      obfuscation.push(...detectObfuscation(rel, content));
    } else if (type === 'json') {
      findings.push(...analyzeFile(rel, content));
      obfuscation.push(...detectObfuscation(rel, content));
    }
  }

  // also check for binary files not caught by glob (e.g. .so without text extension is not in glob, but include via explicit glob)
  const binFiles = await fg(['**/*.{so,bin,o,a}', '!**/.git/**'], { cwd: tmpDir, dot: false });
  for (const rel of binFiles) {
    if (fileTree.some((f) => f.path === rel)) continue;
    const abs = path.join(tmpDir, rel);
    let size = 0;
    try {
      size = (await fs.stat(abs)).size;
    } catch {
      size = 0;
    }
    fileTree.push({ path: rel, lines: 0, size, type: 'binary' });
    obfuscation.push({ type: 'binary', file: rel, line: 1, snippet: rel, severity: 'high' });
  }

  // Inventory: separate expected imports (info, no risk) from risky operations
  const inventory = {
    fileOps: findings.filter((f) => f.category === 'fileOps' || f.category === 'fsWrite'),
    networkCalls: findings.filter((f) => f.category === 'network'),
    processes: findings.filter((f) => f.category === 'exec' || f.category === 'ipc'),
    imports: findings.filter((f) => f.category === 'imports'),
  };

  // Main findings for report: exclude expected imports (info) to reduce noise
  const riskFindings = findings.filter((f) => f.severity !== 'info');

  const allForScoring = [
    ...riskFindings.map((f) => ({ severity: f.severity })),
    ...obfuscation.map((o) => ({ severity: o.severity })),
  ] as { severity: 'critical' | 'high' | 'medium' | 'low' | 'info' }[];

  const scoring = scoreFindings(allForScoring);
  const obfuscationFlag = obfuscation.length >= 2 || obfuscation.some((o) => o.severity === 'critical');

  return {
    findings: riskFindings,
    obfuscation,
    fileTree,
    inventory,
    score: scoring.score,
    riskLevel: scoring.riskLevel,
    obfuscationFlag,
  };
}
