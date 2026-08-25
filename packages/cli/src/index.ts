#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { parseGitUrl } from './utils.js';
import { getRemoteHead, cloneAndDiff } from './git.js';
import { readState, updateState } from './state.js';
import { analyzeRepo } from './analyzer/index.js';
import { ReportSchema } from './report.js';
import { buildLlmPrompt, runLlmAnalysis, parseLlmResponse, collectFileContents } from './analyzer/llm.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const program = new Command();

program
  .name('omarchy-audit')
  .description('Audit Omarchy plugins for risky operations and obfuscation')
  .version('0.1.0')
  .argument('[url]', 'GitHub URL to audit')
  .option('--force', 'Force re-scan even if HEAD == lastScanned')
  .option('--json', 'Output JSON to stdout (for CI)')
  .option('--dry-run', 'Show diff without writing report')
  .option('--list', 'List audited plugins')
  .option('--diff', 'Show diff only (since last scan)')
  .option('--keep-history <n>', 'Keep N historical reports', '10')
  .option('--with-llm', 'Run AI review with opencode-go/muse-spark-1.2-contributor for deeper contextual analysis (requires opencode)')
  .option('--llm-model <model>', 'LLM model for AI review', 'opencode-go/muse-spark-1.2-contributor')
  .action(async (url: string | undefined, opts) => {
    if (opts.list) {
      const state = await readState();
      if (Object.keys(state).length === 0) {
        console.log('No plugins audited yet.');
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(state, null, 2));
      } else {
        for (const [slug, entry] of Object.entries(state)) {
          console.log(`${slug} -> ${entry.lastScanned.slice(0, 7)} (${entry.lastRisk}, score ${entry.lastScore}) ${entry.url}`);
        }
      }
      return;
    }

    if (!url) {
      console.error(pc.red('Error: provide GitHub URL'));
      console.error('Usage: omarchy-audit <github-url> [options]');
      process.exit(1);
    }

    let slug: string;
    let cleanUrl: string;
    try {
      const parsed = parseGitUrl(url);
      slug = parsed.slug;
      cleanUrl = parsed.url;
    } catch (e: any) {
      console.error(pc.red(e.message));
      process.exit(1);
    }

    console.log(pc.cyan(`Auditing ${cleanUrl} (${slug})...`));

    let head: string;
    try {
      head = await getRemoteHead(cleanUrl);
    } catch (e: any) {
      console.error(pc.red(e.message));
      process.exit(1);
    }
    console.log(`Remote HEAD: ${head.slice(0, 7)} (${head})`);

    const state = await readState();
    const last = state[slug]?.lastScanned;

    if (last === head && !opts.force) {
      console.log(pc.green('Up to date — already scanned. Use --force to re-scan.'));
      if (opts.json) console.log(JSON.stringify({ slug, head, upToDate: true }, null, 2));
      return;
    }

    if (opts.diff) {
      if (!last) {
        console.log('First scan — no previous commit. No diff to show.');
        return;
      }
      console.log(`Diff since ${last.slice(0, 7)}...`);
      const { tmpDir, filesChanged, commits } = await cloneAndDiff(cleanUrl, slug, last);
      console.log(`\nChanged files (${filesChanged.length}):`);
      for (const f of filesChanged) console.log(`${f.status}\t${f.path}`);
      console.log(`\nCommits (${commits.length}):`);
      for (const c of commits) console.log(`${c.sha.slice(0, 7)} ${c.author} - ${c.message}`);
      await fs.rm(tmpDir, { recursive: true, force: true });
      return;
    }

    console.log(`Cloning ${cleanUrl}...`);
    const { tmpDir, head: actualHead, filesChanged, commits } = await cloneAndDiff(cleanUrl, slug, last || null);
    console.log(`Analyzing ${filesChanged.length ? filesChanged.length : 'repository'} files...`);
    const analysis = await analyzeRepo(tmpDir, slug);

    let llmAnalysis: any = null;
    if (opts.withLlm || opts.withLlm === true) {
      console.log(pc.cyan(`Running AI review with ${opts.llmModel}...`));
      try {
        const fileContents = await collectFileContents(tmpDir, analysis.findings);
        const prompt = buildLlmPrompt({
          slug,
          commit: actualHead,
          fileTree: analysis.fileTree,
          findings: analysis.findings,
          fileContents,
        });
        const raw = await runLlmAnalysis(prompt, { model: opts.llmModel, dir: tmpDir });
        const parsedLlm = parseLlmResponse(raw);
        llmAnalysis = {
          model: opts.llmModel,
          generatedAt: new Date().toISOString(),
          overallRisk: parsedLlm.overallRisk,
          summary: parsedLlm.summary,
          findings: parsedLlm.findings,
        };
        console.log(pc.green(`AI review complete: ${llmAnalysis.overallRisk} — ${llmAnalysis.summary.slice(0, 120)}`));
        // Use LLM refined risk to adjust overall risk if LLM finds higher risk
        // Keep original static score but surface LLM overallRisk
      } catch (e: any) {
        console.error(pc.yellow(`AI review failed: ${e.message} — continuing with static analysis only`));
      }
    }

    const report: any = {
      slug,
      url: cleanUrl,
      commit: actualHead,
      commitShort: actualHead.slice(0, 7),
      commitUrl: `${cleanUrl}/commit/${actualHead}`,
      scannedAt: new Date().toISOString(),
      fromCommit: last || null,
      fromCommitShort: last ? last.slice(0, 7) : null,
      diff: {
        filesChanged,
        commits,
        stats: {
          added: filesChanged.filter((f) => f.status === 'A').length,
          modified: filesChanged.filter((f) => f.status === 'M').length,
          deleted: filesChanged.filter((f) => f.status === 'D').length,
        },
      },
      fileTree: analysis.fileTree,
      inventory: analysis.inventory,
      findings: analysis.findings,
      obfuscation: analysis.obfuscation,
      score: analysis.score,
      riskLevel: analysis.riskLevel,
      obfuscationFlag: analysis.obfuscationFlag,
      llmAnalysis,
    };

    const parsed = ReportSchema.parse(report);

    if (opts.json && !opts.dryRun) {
      console.log(JSON.stringify(parsed, null, 2));
    } else if (opts.json && opts.dryRun) {
      console.log(JSON.stringify(parsed, null, 2));
    }

    if (opts.dryRun) {
      console.log(pc.yellow('Dry run — not writing report.'));
      console.log(`Risk: ${pc.bold(parsed.riskLevel)} Score: ${parsed.score} Findings: ${parsed.findings.length} Obfuscation: ${parsed.obfuscation.length}`);
      if (parsed.obfuscationFlag) console.log(pc.red('Flag: Possible obfuscation detected!'));
      await fs.rm(tmpDir, { recursive: true, force: true });
      return;
    }

    const reportPath = path.resolve(process.cwd(), `data/reports/${slug}.json`);
    const altReportPath = path.resolve(process.cwd(), `../../data/reports/${slug}.json`);
    // try both locations depending on cwd (cli package vs root)
    const finalReportPath = (await fs.stat(path.dirname(reportPath)).then(() => true).catch(() => false))
      ? reportPath
      : altReportPath;

    // ensure we use root data dir: resolve from this file's location
    const rootDataReports = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../data/reports');
    const rootDataHistory = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../data/history');
    const rootStatePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../data/state.json');

    const actualReportPath = path.join(rootDataReports, `${slug}.json`);
    const actualHistoryPath = path.join(rootDataHistory, slug, `${actualHead}.json`);

    await fs.mkdir(path.dirname(actualReportPath), { recursive: true });
    await fs.mkdir(path.dirname(actualHistoryPath), { recursive: true });
    await fs.writeFile(actualReportPath, JSON.stringify(parsed, null, 2));
    await fs.writeFile(actualHistoryPath, JSON.stringify(parsed, null, 2));

    const keep = parseInt(opts.keepHistory, 10) || 10;
    const histDir = path.dirname(actualHistoryPath);
    const histFiles = (await fs.readdir(histDir).catch(() => [])).filter((f) => f.endsWith('.json')).sort();
    if (histFiles.length > keep) {
      for (const f of histFiles.slice(0, histFiles.length - keep)) {
        await fs.unlink(path.join(histDir, f));
      }
    }

    await updateState(
      slug,
      {
        url: cleanUrl,
        lastScanned: actualHead,
        lastScannedAt: parsed.scannedAt,
        lastRisk: parsed.riskLevel,
        lastScore: parsed.score,
      },
      rootStatePath
    );

    console.log(pc.green(`Report written to data/reports/${slug}.json`));
    console.log(`Risk: ${pc.bold(parsed.riskLevel)} Score: ${parsed.score} Findings: ${parsed.findings.length} Obfuscation: ${parsed.obfuscation.length}`);
    if (parsed.obfuscationFlag) console.log(pc.red('Flag: Possible obfuscation detected!'));
    console.log(`Historical copy: data/history/${slug}/${actualHead}.json`);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

program.parse();
