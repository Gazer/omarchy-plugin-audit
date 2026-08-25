import fs from 'node:fs/promises';
import path from 'node:path';

export type StateEntry = {
  url: string;
  lastScanned: string;
  lastScannedAt: string;
  lastRisk: string;
  lastScore: number;
};
export type State = Record<string, StateEntry>;

function defaultPath(): string {
  // data/state.json relative to repo root (two levels up from packages/cli/dist)
  try {
    const fileDir = path.dirname(new URL(import.meta.url).pathname);
    const candidate = path.resolve(fileDir, '../../../data/state.json');
    return candidate;
  } catch {
    return path.resolve(process.cwd(), 'data/state.json');
  }
}

export async function readState(p?: string): Promise<State> {
  const candidates = p
    ? [p]
    : [
        defaultPath(),
        path.resolve(process.cwd(), 'data/state.json'),
        path.resolve(process.cwd(), '../../data/state.json'),
      ];
  for (const cand of candidates) {
    try {
      const raw = await fs.readFile(cand, 'utf8');
      return JSON.parse(raw) as State;
    } catch {}
  }
  return {} as State;
}

export async function writeState(state: State, p: string = defaultPath()): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(state, null, 2));
}

export async function updateState(
  slug: string,
  patch: StateEntry,
  p?: string
): Promise<void> {
  const target = p || defaultPath();
  const s = await readState(target);
  s[slug] = patch;
  await writeState(s, target);
}
