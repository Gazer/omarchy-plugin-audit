export type ObfuscationFinding = {
  type: string;
  file: string;
  line: number;
  snippet: string;
  decodedPreview?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
};

export function detectObfuscation(filePath: string, content: string): ObfuscationFinding[] {
  const findings: ObfuscationFinding[] = [];
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    // 1 base64 long
    const b64m = line.match(/[A-Za-z0-9+/]{80,}={0,2}/);
    // use 80 threshold then check 100 filtered to reduce false positives but keep spec 100
    if (b64m && b64m[0].length >= 100) {
      const raw = b64m[0];
      const ratio = raw.replace(/[^A-Za-z0-9+/=]/g, '').length / raw.length;
      if (ratio > 0.8) {
        let preview = '';
        try {
          preview = Buffer.from(raw.slice(0, 200), 'base64').toString('utf8').slice(0, 80);
        } catch {
          preview = '';
        }
        findings.push({
          type: 'base64',
          file: filePath,
          line: i + 1,
          snippet: line.trim().slice(0, 120),
          decodedPreview: preview,
          severity: 'high',
        });
      }
    }

    // 2 hex escapes
    const hexCount = (line.match(/\\x[0-9a-fA-F]{2}/g) || []).length;
    if (hexCount > 10) {
      findings.push({
        type: 'hex-escapes',
        file: filePath,
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        severity: 'medium',
      });
    }

    // 3 unicode escapes per line
    const uniCount = (line.match(/\\u[0-9a-fA-F]{4}/g) || []).length;
    if (uniCount > 15) {
      findings.push({
        type: 'unicode-escapes',
        file: filePath,
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        severity: 'medium',
      });
    }

    // 4 minified
    if (line.length > 300) {
      findings.push({
        type: 'minified',
        file: filePath,
        line: i + 1,
        snippet: line.slice(0, 120),
        severity: 'medium',
      });
    }

    // 5 eval dynamic
    if (
      /eval\s*\(.*\+/.test(line) ||
      /Function\s*\(.*\+/.test(line) ||
      /Qt\.createQmlObject\s*\(.*\+/.test(line) ||
      /Loader[^}]*source:\s*[a-zA-Z_$][a-zA-Z0-9_$]*[^"']/.test(line)
    ) {
      findings.push({
        type: 'eval-dynamic',
        file: filePath,
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        severity: 'critical',
      });
    }

    // 6 fromCharCode
    if (/fromCharCode|charCodeAt/.test(line)) {
      findings.push({
        type: 'fromCharCode',
        file: filePath,
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        severity: 'high',
      });
    }

    // 7 remote URL in QML
    if (/source:\s*["']https?:/.test(line) || /Qt\.createComponent\s*\(\s*["']https?:/.test(line)) {
      findings.push({
        type: 'remote-url',
        file: filePath,
        line: i + 1,
        snippet: line.trim().slice(0, 120),
        severity: 'high',
      });
    }
  });

  // file-level unicode aggregate
  const totalUni = (content.match(/\\u[0-9a-fA-F]{4}/g) || []).length;
  if (totalUni > 15 && !findings.some((f) => f.type === 'unicode-escapes')) {
    findings.push({
      type: 'unicode-escapes',
      file: filePath,
      line: 1,
      snippet: content.slice(0, 120),
      severity: 'medium',
    });
  }

  // binary detection
  if (/\.(so|bin|o|a)$/.test(filePath) || content.startsWith('#!/')) {
    findings.push({
      type: 'binary',
      file: filePath,
      line: 1,
      snippet: content.slice(0, 120),
      severity: 'high',
    });
  }

  return findings;
}
