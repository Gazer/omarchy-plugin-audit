import { describe, it, expect } from 'vitest';
import { scoreFindings } from '../src/analyzer/scoring.js';

describe('scoring', () => {
  it('safe when empty', () => expect(scoreFindings([])).toEqual({ score: 0, riskLevel: 'safe' }));
  it('critical when exec present', () => {
    const { riskLevel } = scoreFindings([
      { severity: 'critical' } as any,
    ]);
    expect(riskLevel).toBe('critical');
  });
  it('high for network + write', () => {
    const f = [
      { severity: 'high' } as any,
      { severity: 'high' } as any,
    ];
    const { riskLevel, score } = scoreFindings(f);
    expect(score).toBe(10);
    expect(riskLevel).toBe('medium');
  });
  it('low for single medium', () => {
    const { riskLevel } = scoreFindings([{ severity: 'medium' } as any]);
    expect(riskLevel).toBe('low');
  });
});
