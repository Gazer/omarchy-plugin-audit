import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export type LlmFindingReview = {
  file: string;
  line: number;
  pattern: string;
  originalSeverity: string;
  refinedSeverity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  isBenign: boolean;
  isMalicious: boolean;
  reasoning: string;
  relatedCode?: string;
  executableContext?: string;
};

export type LlmAnalysis = {
  model: string;
  generatedAt: string;
  summary: string;
  findings: LlmFindingReview[];
  overallRisk: 'safe' | 'low' | 'medium' | 'high' | 'critical';
};

const MODEL = 'opencode-go/muse-spark-1.2-contributor';

export function buildLlmPrompt(opts: {
  slug: string;
  commit: string;
  fileTree: { path: string; lines: number }[];
  findings: { file: string; line: number; pattern: string; severity: string; description: string; snippet: string }[];
  fileContents: Record<string, string>;
}): string {
  const { slug, commit, fileTree, findings, fileContents } = opts;

  const findingsBlock = findings
    .map(
      (f, i) =>
        `${i + 1}. [${f.severity.toUpperCase()}] ${f.pattern} — ${f.description}\n   File: ${f.file}:${f.line}\n   Snippet: "${f.snippet}"`
    )
    .join('\n');

  const filesBlock = Object.entries(fileContents)
    .map(([file, content]) => {
      const truncated = content.split('\n').slice(0, 120).join('\n');
      return `--- FILE: ${file} ---\n${truncated}\n--- END FILE ---`;
    })
    .join('\n\n');

  return `You are a security analyst for Omarchy plugins (QML/Qt/Quickshell). These plugins run inside the user's shell with high privileges (file, network, process).
IMPORTANT: Do not call any tools or read external files. Use ONLY the file contents provided below. No tool calls needed. Analyze directly and return JSON.

Plugin: ${slug} Commit: ${commit}
File tree: ${fileTree.map((f) => f.path).join(', ')}

Static findings (from regex, may be noisy or lack context):
${findingsBlock || '(no findings)'}

Full file contents (truncated to 120 lines per file, provided for you — do not read more):
${filesBlock}

Task:
For EACH static finding, analyze its surrounding code (within the file) and determine:
- Is the finding benign or actually risky in context?
- Example: "Resolves file URL" with Qt.resolvedUrl("mx-ctl") may look like just resolving a path, but if that path is later used as an executable in Process { command: [...] } or Quickshell.execDetached([ctl, ...]), it is actually locating an executable that will be run. Check how the resolved value is used elsewhere in the file(s).
- Similarly, imports like "import Quickshell" are expected and should be marked benign/info.
- IPC handlers with if checks are validated vs unvalidated.
- Provide a refinedSeverity (critical/high/medium/low/info), isBenign, isMalicious, and reasoning (1-2 sentences, English).
- If the finding relates to an executable (e.g., mx-ctl, mx-buttons), describe the executableContext: what it does and whether args appear sanitized.

Also provide an overallRisk summary for the plugin.

Return ONLY valid JSON, no markdown, no explanation outside JSON, with this exact shape:
{
  "overallRisk": "safe|low|medium|high|critical",
  "summary": "1-3 sentence overall assessment in English",
  "findings": [
    {
      "file": "Panel.qml",
      "line": 42,
      "pattern": "Util.fileUrl",
      "originalSeverity": "medium",
      "refinedSeverity": "high",
      "isBenign": false,
      "isMalicious": false,
      "reasoning": "Resolves mx-ctl executable which is later executed via statusProc.command with user-controlled deviceName; risk depends on mx-ctl and sanitization, not just file resolution",
      "relatedCode": "statusProc.command = [\"bash\", \"-c\", \"...\", root.ctl, root.deviceName]",
      "executableContext": "mx-ctl wraps solaar for Logitech MX Master, takes action from user settings"
    }
  ]
}
Be precise, reference relatedCode lines if you find usage elsewhere. If you cannot determine, set refinedSeverity equal to original and isBenign false with reasoning "needs manual review".
`;
}

export async function runLlmAnalysis(prompt: string, opts?: { model?: string; timeoutMs?: number }): Promise<string> {
  const model = opts?.model || MODEL;
  const timeoutMs = opts?.timeoutMs; // undefined = no timeout, wait as long as needed

  return new Promise((resolve, reject) => {
    const args = ['run', '-m', model, '--format', 'json', '--auto', prompt];
    const child = spawn('opencode', args, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    let timer: NodeJS.Timeout | undefined;
    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`LLM analysis timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    child.stdout.on('data', (d) => {
      const chunk = d.toString();
      stdout += chunk;
      // Stream LLM output for visibility — parse json events and forward text
      try {
        const lines = chunk.split('\n').filter(Boolean);
        for (const line of lines) {
          const obj = JSON.parse(line);
          if (obj.type === 'text' && obj.part?.text) {
            process.stderr.write(obj.part.text);
          } else if (obj.type === 'step_start') {
            process.stderr.write('\n[llm] thinking...\n');
          } else if (obj.type === 'step_finish') {
            const tok = obj.part?.tokens;
            if (tok) process.stderr.write(`\n[llm] finished — tokens ${tok.total} cost $${tok.cost?.toFixed(4) || '?'}\n`);
          }
        }
      } catch {
        // fallback: raw chunk
        process.stderr.write(chunk);
      }
    });
    child.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      process.stderr.write(`[llm:stderr] ${chunk}`);
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code !== 0 && !stdout) {
        reject(new Error(`opencode run failed (exit ${code}): ${stderr.slice(0, 500)}`));
        return;
      }
      // Parse JSON lines, extract text parts
      const lines = stdout.split('\n').filter(Boolean);
      let text = '';
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'text' && obj.part?.text) text += obj.part.text;
          else if (obj.type === 'text' && obj.text) text += obj.text;
        } catch {
          // ignore non-JSON lines
        }
      }
      if (!text) {
        // fallback: raw stdout may contain JSON directly
        text = stdout;
      }
      resolve(text.trim());
    });
  });
}

export function parseLlmResponse(raw: string): { overallRisk: string; summary: string; findings: LlmFindingReview[] } {
  // Extract JSON from markdown fences if present
  let jsonStr = raw.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  // Find first { to last }
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  const parsed = JSON.parse(jsonStr);
  return {
    overallRisk: parsed.overallRisk || 'medium',
    summary: parsed.summary || '',
    findings: (parsed.findings || []).map((f: any) => ({
      file: f.file,
      line: f.line,
      pattern: f.pattern,
      originalSeverity: f.originalSeverity,
      refinedSeverity: f.refinedSeverity,
      isBenign: !!f.isBenign,
      isMalicious: !!f.isMalicious,
      reasoning: f.reasoning || '',
      relatedCode: f.relatedCode || '',
      executableContext: f.executableContext || '',
    })),
  };
}

export async function collectFileContents(tmpDir: string, findings: { file: string }[]): Promise<Record<string, string>> {
  const uniqueFiles = [...new Set(findings.map((f) => f.file))];
  // also include Panel.qml and main files even if not in findings, up to 4
  const extra = ['Panel.qml', 'DownloadsStore.qml', 'Model.js', 'mx-ctl', 'mx-buttons'];
  for (const e of extra) if (!uniqueFiles.includes(e)) uniqueFiles.push(e);
  const limited = uniqueFiles.slice(0, 4);
  const contents: Record<string, string> = {};
  for (const rel of limited) {
    try {
      const abs = path.join(tmpDir, rel);
      const text = await fs.readFile(abs, 'utf8');
      contents[rel] = text;
    } catch {
      // ignore missing
    }
  }
  return contents;
}
