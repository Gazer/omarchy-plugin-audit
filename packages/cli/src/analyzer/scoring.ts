const weights = { critical: 10, high: 5, medium: 2, low: 1, info: 0 } as const;

export function scoreFindings(findings: { severity: keyof typeof weights }[]): {
  score: number;
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
} {
  let score = findings.reduce((s, f) => s + (weights[f.severity] ?? 0), 0);
  let riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical' = 'safe';
  if (findings.some((f) => f.severity === 'critical')) {
    riskLevel = 'critical';
  } else if (score >= 25) {
    riskLevel = 'critical';
  } else if (score >= 15) {
    riskLevel = 'high';
  } else if (score >= 8) {
    riskLevel = 'medium';
  } else if (score >= 4) {
    riskLevel = 'low';
  } else if (score > 0) {
    riskLevel = 'low';
  } else {
    riskLevel = 'safe';
  }
  return { score, riskLevel };
}
