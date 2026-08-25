import { describe, it, expect } from 'vitest';
import { analyzeRepo } from '../src/analyzer/index.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('analyzeRepo', () => {
  it('analyzes tmp repo', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-audit-'));
    await fs.writeFile(path.join(dir, 'Test.qml'), `import Quickshell\nProcess { command: ["ls"] }`);
    await fs.writeFile(path.join(dir, 'helper.js'), `fetch("http://example.com")`);
    const res = await analyzeRepo(dir, 'test');
    expect(res.findings.some((f) => f.pattern === 'Process')).toBe(true);
    expect(res.findings.some((f) => f.pattern === 'fetch')).toBe(true);
    expect(res.fileTree.length).toBe(2);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
