export type Finding = {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  pattern: string;
  file: string;
  line: number;
  column: number;
  snippet: string;
  description: string;
};

const patterns: {
  regex: RegExp;
  pattern: string;
  category: string;
  severity: Finding['severity'];
  description: string;
}[] = [
  { regex: /FolderListModel/, pattern: 'FolderListModel', category: 'fileOps', severity: 'medium', description: 'Reads directory via FolderListModel' },
  { regex: /StandardPaths/, pattern: 'StandardPaths', category: 'fileOps', severity: 'medium', description: 'Accesses system paths via StandardPaths' },
  { regex: /Util\.fileUrl|Qt\.resolvedUrl/, pattern: 'Util.fileUrl', category: 'fileOps', severity: 'medium', description: 'Resolves file URL' },
  { regex: /File\.read|readFile|open\(/, pattern: 'File.read', category: 'fileOps', severity: 'medium', description: 'Reads file content' },
  { regex: /XmlHttpRequest/, pattern: 'XmlHttpRequest', category: 'network', severity: 'high', description: 'Network request via XmlHttpRequest' },
  { regex: /\bfetch\s*\(/, pattern: 'fetch', category: 'network', severity: 'high', description: 'Network request via fetch' },
  { regex: /WebSocket/, pattern: 'WebSocket', category: 'network', severity: 'high', description: 'Network via WebSocket' },
  { regex: /Qt\.openUrlExternally/, pattern: 'Qt.openUrlExternally', category: 'network', severity: 'high', description: 'Opens external URL' },
  { regex: /<img[^>]+src\s*=\s*["']https?:/, pattern: 'img-src-http', category: 'network', severity: 'high', description: 'Remote image source' },
  { regex: /Process\s*\{[^}]*command/, pattern: 'Process', category: 'exec', severity: 'critical', description: 'Process execution via Quickshell Process' },
  { regex: /\beval\s*\(/, pattern: 'eval', category: 'exec', severity: 'critical', description: 'Dynamic code execution via eval' },
  { regex: /\bFunction\s*\(/, pattern: 'Function', category: 'exec', severity: 'critical', description: 'Dynamic code execution via Function' },
  { regex: /Shell\.exec|executeCommand|system\s*\(|spawn\s*\(/, pattern: 'Shell.exec', category: 'exec', severity: 'critical', description: 'Shell command execution' },
  { regex: /Loader\s*\{[^}]*source\s*:/, pattern: 'Loader', category: 'exec', severity: 'critical', description: 'Dynamic QML Loader source' },
  { regex: /Qt\.createQmlObject|Qt\.createComponent/, pattern: 'Qt.createComponent', category: 'exec', severity: 'critical', description: 'Dynamic QML component creation' },
  { regex: /writeFile|FileIO\.write/, pattern: 'writeFile', category: 'fsWrite', severity: 'high', description: 'File write operation' },
  { regex: /copy\(|remove\(|\.remove/, pattern: 'fs-remove', category: 'fsWrite', severity: 'high', description: 'File remove/copy operation' },
  { regex: /import\s+Quickshell/, pattern: 'import Quickshell', category: 'imports', severity: 'info', description: 'Imports Quickshell module' },
  { regex: /import\s+qs\./, pattern: 'import qs', category: 'imports', severity: 'info', description: 'Imports local qs module' },
  { regex: /ipcTarget|IpcHandler/, pattern: 'ipcTarget', category: 'ipc', severity: 'high', description: 'IPC handler exposure' },
];

export function analyzeFile(filePath: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // skip pure comment lines to reduce false positives from documentation
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
    for (const p of patterns) {
      const m = line.match(p.regex);
      if (m) {
        const key = `${p.pattern}:${filePath}`;
        // deduplicate same pattern per file (counts once per file)
        if (seen.has(key) && p.severity !== 'critical' && p.severity !== 'high') continue;
        seen.add(key);
        findings.push({
          severity: p.severity,
          category: p.category,
          pattern: p.pattern,
          file: filePath,
          line: i + 1,
          column: (m.index ?? 0) + 1,
          snippet: line.trim().slice(0, 120),
          description: p.description,
        });
      }
    }
  });
  return findings;
}
