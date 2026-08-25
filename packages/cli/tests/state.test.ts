import { describe, it, expect } from 'vitest';
import { readState } from '../src/state.js';

describe('readState', () => {
  it('returns empty object when file missing', async () => {
    const s = await readState('/tmp/nonexistent-state-xyz.json');
    expect(s).toEqual({});
  });
});
