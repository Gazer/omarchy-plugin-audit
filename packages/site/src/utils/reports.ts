import fs from 'node:fs/promises';
import path from 'node:path';

export type Report = any;

export async function getReports(): Promise<Report[]> {
  const dir = path.resolve(process.cwd(), '../../data/reports');
  // also try relative to site src
  const candidates = [
    dir,
    path.resolve(process.cwd(), 'data/reports'),
    path.resolve(process.cwd(), '../data/reports'),
    path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../data/reports'),
  ];
  let files: string[] = [];
  let base = dir;
  for (const c of candidates) {
    try {
      files = await fs.readdir(c);
      base = c;
      break;
    } catch {}
  }
  const reports: Report[] = [];
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(base, f), 'utf8'));
      reports.push(data);
    } catch {}
  }
  return reports;
}

export async function getHistory(slug: string): Promise<Report[]> {
  const candidates = [
    path.resolve(process.cwd(), `../../data/history/${slug}`),
    path.resolve(process.cwd(), `data/history/${slug}`),
    path.resolve(path.dirname(new URL(import.meta.url).pathname), `../../../../data/history/${slug}`),
  ];
  for (const c of candidates) {
    try {
      const files = await fs.readdir(c);
      const reports: Report[] = [];
      for (const f of files.filter((x) => x.endsWith('.json')).sort().reverse()) {
        const data = JSON.parse(await fs.readFile(path.join(c, f), 'utf8'));
        reports.push(data);
      }
      return reports;
    } catch {}
  }
  return [];
}
