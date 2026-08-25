import { simpleGit } from 'simple-git';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function getRemoteHead(url: string): Promise<string> {
  const git = simpleGit();
  const out = await git.listRemote([url, 'HEAD']);
  const sha = out.split(/\s+/)[0]?.trim();
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`Failed to reach ${url} — check URL or network access`);
  }
  return sha;
}

export async function cloneAndDiff(
  url: string,
  slug: string,
  fromSha: string | null
): Promise<{
  tmpDir: string;
  head: string;
  filesChanged: { status: string; path: string }[];
  commits: { sha: string; message: string; author: string; date: string }[];
}> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `omarchy-audit-${slug}-`));
  const git = simpleGit();
  await git.clone(url, tmpDir, ['--depth', '50', '--single-branch']);
  const g = simpleGit(tmpDir);
  const head = (await g.revparse(['HEAD'])).trim();

  let filesChanged: { status: string; path: string }[] = [];
  let commits: { sha: string; message: string; author: string; date: string }[] = [];

  if (fromSha) {
    try {
      const diff = await g.diff(['--name-status', `${fromSha}..HEAD`]);
      filesChanged = diff
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [s, ...rest] = l.split('\t');
          return { status: s, path: rest.join('\t') };
        });
      const log = await g.log({ from: fromSha, to: 'HEAD' });
      commits = log.all.map((c) => ({
        sha: c.hash,
        message: c.message,
        author: c.author_name,
        date: c.date,
      }));
    } catch {
      // fallback: deepen or unshallow
      await g.fetch(['--unshallow']).catch(() => g.fetch(['--depth', '1000']));
      const diff = await g.diff(['--name-status', `${fromSha}..HEAD`]);
      filesChanged = diff
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [s, ...rest] = l.split('\t');
          return { status: s, path: rest.join('\t') };
        });
      const log = await g.log({ from: fromSha, to: 'HEAD' });
      commits = log.all.map((c) => ({
        sha: c.hash,
        message: c.message,
        author: c.author_name,
        date: c.date,
      }));
    }
  } else {
    const files = await g.raw(['ls-files']);
    filesChanged = files
      .split('\n')
      .filter(Boolean)
      .map((p) => ({ status: 'A', path: p }));
    const log = await g.log();
    commits = log.all.slice(0, 10).map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  return { tmpDir, head, filesChanged, commits };
}
