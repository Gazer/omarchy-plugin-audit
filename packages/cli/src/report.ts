import { z } from 'zod';

export const FindingSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  category: z.string(),
  pattern: z.string(),
  file: z.string(),
  line: z.number(),
  column: z.number(),
  snippet: z.string(),
  description: z.string(),
});

export const ObfuscationFindingSchema = z.object({
  type: z.string(),
  file: z.string(),
  line: z.number(),
  snippet: z.string(),
  decodedPreview: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
});

export const ReportSchema = z.object({
  slug: z.string(),
  url: z.string(),
  commit: z.string(),
  commitShort: z.string(),
  commitUrl: z.string(),
  scannedAt: z.string(),
  fromCommit: z.string().nullable(),
  fromCommitShort: z.string().nullable(),
  diff: z.object({
    filesChanged: z.array(z.object({ status: z.string(), path: z.string() })),
    commits: z.array(z.object({ sha: z.string(), message: z.string(), author: z.string(), date: z.string() })),
    stats: z.object({ added: z.number(), modified: z.number(), deleted: z.number() }),
  }),
  fileTree: z.array(
    z.object({
      path: z.string(),
      lines: z.number(),
      size: z.number(),
      type: z.enum(['qml', 'js', 'json', 'other', 'binary']),
    })
  ),
  inventory: z.object({
    fileOps: z.array(FindingSchema),
    networkCalls: z.array(FindingSchema),
    processes: z.array(FindingSchema),
    imports: z.array(FindingSchema),
  }),
  findings: z.array(FindingSchema),
  obfuscation: z.array(ObfuscationFindingSchema),
  score: z.number(),
  riskLevel: z.enum(['safe', 'low', 'medium', 'high', 'critical']),
  obfuscationFlag: z.boolean(),
});

export type Finding = z.infer<typeof FindingSchema>;
export type ObfuscationFinding = z.infer<typeof ObfuscationFindingSchema>;
export type Report = z.infer<typeof ReportSchema>;
