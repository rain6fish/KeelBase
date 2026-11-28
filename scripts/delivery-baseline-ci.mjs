#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Read the CI status of the three active repositories at their pinned commits.
 *
 * This is the first reading `scripts/delivery-baseline.sh` takes: the CTO ruling of 2026-11-28 makes
 * "the three active repositories are green on the same commit" the first of five falsifiable criteria,
 * and a reading that a person copies out of a browser tab is not reproducible. This script asks the
 * GitHub REST API for the runs of a named commit — one reading per repository, no guessing from the
 * default branch.
 *
 * The JDK 25 leg is reported, never counted. Q4's ruling (2026-11-28) turns that leg's environment
 * failure into a structured "unverified" reading; a green 25 leg still does not make code green, so the
 * line says which leg it was and the exit status ignores it. That is the honest shape: the 17 leg is
 * the code claim, the 25 leg is an environment reading.
 *
 * Exit codes: 0 = every required workflow is success at the pinned commit; 1 = at least one is not;
 * 2 = the reading could not be taken (network/API failure) — never read as a pass.
 *
 * 读三个活跃仓在各自钉住提交上的 CI 状态。
 *
 * 这是 `scripts/delivery-baseline.sh` 的第一项读数：2026-11-28 的 CTO 裁决把「三个活跃仓在同一提交上
 * 绿」定为五条可证伪判据的第一条，而一个从浏览器标签页抄下来的读数不可复现。本脚本按**具名提交**向
 * GitHub REST API 问运行记录 —— 每个仓一条读数，不从默认分支猜。
 *
 * JDK 25 腿只报告、不计入。Q4 的裁决（2026-11-28）把该腿的环境失败变成结构化的「未核验」读数；
 * 25 腿即使是绿的，也不构成代码绿，故那行说清是哪条腿，退出状态不看它。这是诚实的形状：17 腿是
 * 代码主张，25 腿是环境读数。
 *
 * 退出码：0 = 每个必需工作流在钉住的提交上都 success；1 = 至少一个不是；2 = 读不到（网络/API 失败）
 * —— 绝不当成通过。
 */
import { writeFileSync } from 'node:fs';

const REPOS = [
  { name: 'KeelBase', repo: 'rain6fish/KeelBase', workflows: ['CI'] },
  { name: 'KeelBase4J', repo: 'rain6fish/KeelBase4J', workflows: ['CI'] },
  { name: 'KeelBase-Vue-Pro', repo: 'rain6fish/KeelBase-Vue-Pro', workflows: ['CI', 'Real-stack scenario gates'] },
];

const args = process.argv.slice(2);
const opt = (name, fallback = '') => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const outFile = opt('--out');
const shaFor = (repoName) => opt(`--${repoName.toLowerCase()}`) || opt(`--${repoName}`);

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'keelbase-delivery-baseline' };
if (token) headers.Authorization = `Bearer ${token}`;

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function isJdk25Job(name) {
  return /JDK\s*25|java\s*25|\(\s*25\s*\)/i.test(name) || /25\.0\.\d/.test(name);
}

const lines = [];
const readings = { takenAt: new Date().toISOString(), repos: [] };
let failures = 0;
let unreadable = 0;

for (const { name, repo, workflows } of REPOS) {
  const sha = shaFor(name);
  const entry = { name, repo, sha, workflows: [], jdk25: [] };
  readings.repos.push(entry);
  if (!sha) {
    lines.push(`${name}: no pinned commit given — unverified`);
    entry.error = 'no pinned commit given';
    unreadable += 1;
    continue;
  }
  lines.push(`${name} @ ${sha.slice(0, 12)}`);
  let runs;
  try {
    runs = (await api(`/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`)).workflow_runs || [];
  } catch (err) {
    lines.push(`  could not read CI runs — unverified (${err.message})`);
    entry.error = err.message;
    unreadable += 1;
    continue;
  }
  if (runs.length === 0) {
    lines.push('  no CI run exists for this commit — not green');
    entry.error = 'no CI run for this commit';
    failures += 1;
    continue;
  }
  for (const wf of workflows) {
    const matches = runs.filter((r) => r.name === wf).sort((a, b) => b.id - a.id);
    const run = matches[0];
    if (!run) {
      lines.push(`  ${wf}: no run — not green`);
      entry.workflows.push({ workflow: wf, status: 'missing' });
      failures += 1;
      continue;
    }
    const state = run.status === 'completed' ? run.conclusion : run.status;
    entry.workflows.push({ workflow: wf, status: state, runId: run.id, url: run.html_url,
      event: run.event, createdAt: run.created_at, headSha: run.head_sha });
    lines.push(`  ${wf}: ${state} · ${run.html_url}`);
    if (state !== 'success') failures += 1;

    try {
      const jobs = (await api(`/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`)).jobs || [];
      const legs = jobs.filter((j) => isJdk25Job(j.name));
      for (const leg of legs) {
        const legState = leg.status === 'completed' ? leg.conclusion : leg.status;
        entry.jdk25.push({ job: leg.name, status: legState, runId: run.id });
        lines.push(`    JDK 25 leg "${leg.name}": ${legState} — reported, not counted as code green (Q4 ruling)`);
      }
      const seventeen = jobs.filter((j) => /17/.test(j.name) && !isJdk25Job(j.name));
      for (const leg of seventeen) {
        const legState = leg.status === 'completed' ? leg.conclusion : leg.status;
        entry.workflows.push({ workflow: `${wf} / ${leg.name}`, status: legState, runId: run.id });
        if (legState !== 'success') failures += 1;
        lines.push(`    17 leg "${leg.name}": ${legState}${legState === 'success' ? '' : ' — not green'}`);
      }
    } catch (err) {
      lines.push(`    job list unreadable — leg split unverified (${err.message})`);
      entry.jobsError = err.message;
      unreadable += 1;
    }
  }
}

const text = `${lines.join('\n')}\n`;
process.stdout.write(text);
if (outFile) {
  writeFileSync(outFile, `${JSON.stringify(readings, null, 2)}\n`);
}
if (unreadable > 0) process.exit(2);
process.exit(failures > 0 ? 1 : 0);
