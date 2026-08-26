#!/usr/bin/env node
/**
 * 同步 GitHub issues → Gitee（用户通知时手动执行一次，不做定时）。
 *
 * 幂等：Gitee issue 标题带 `[GH#N]` 前缀关联 GitHub issue 号；已存在的跳过创建、仅同步状态。
 * 用法：
 *   node scripts/sync-issues-to-gitee.mjs            # 同步全部（open + closed）
 *   node scripts/sync-issues-to-gitee.mjs --closed-only   # 只同步已完成的（closed）
 * 前置：
 *   - GitHub：gh 已登录（读 issues）
 *   - Gitee：~/.gitee-release-token 含 GITEE_TOKEN=（issues:write）
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const GH_REPO = 'rain6fish/KeelBase';
const GITEE_REPO = 'rain6fish/KeelBase';

function giteeToken() {
  const p = path.join(homedir(), '.gitee-release-token');
  const lines = readFileSync(p, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (s.startsWith('GITEE_TOKEN=')) {
      const v = s.slice('GITEE_TOKEN='.length).trim();
      if (v) return v;
    }
  }
  throw new Error(`~/.gitee-release-token 中未找到 GITEE_TOKEN=`);
}

async function ghIssues() {
  const { execSync } = await import('node:child_process');
  const out = execSync(
    `gh issue list --repo ${GH_REPO} --state all --limit 100 --json number,title,body,state,createdAt,url`,
    { encoding: 'utf8' },
  );
  return JSON.parse(out);
}

async function giteeIssues(token) {
  let page = 1;
  const all = [];
  for (;;) {
    const url = `https://gitee.com/api/v5/repos/${GITEE_REPO}/issues?access_token=${token}&state=all&per_page=100&page=${page}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error(`Gitee issues 读取失败: ${JSON.stringify(data).slice(0, 200)}`);
    all.push(...data);
    if (data.length < 100) break;
    page += 1;
  }
  return all;
}

function ghNumberFromTitle(title) {
  const m = /^\[GH#(\d+)\]/.exec(title);
  return m ? Number(m[1]) : null;
}

async function main() {
  const token = giteeToken();
  const gh = await ghIssues();
  const gitee = await giteeIssues(token);
  const giteeByGh = new Map();
  for (const g of gitee) {
    const n = ghNumberFromTitle(g.title);
    if (n != null) giteeByGh.set(n, g);
  }

  const results = [];
  const ok = (name, detail = '') => { results.push({ name, pass: true, detail }); console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); };
  const bad = (name, detail = '') => { results.push({ name, pass: false, detail }); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); };

  const closedOnly = process.argv.includes('--closed-only');
  if (closedOnly) console.log('模式：仅同步已完成的（closed）');

  for (const issue of gh) {
    const ghNum = issue.number;
    const ghState = String(issue.state).toLowerCase();
    if (closedOnly && ghState !== 'closed') {
      console.log(`  - 跳过 #${ghNum}（${issue.state}）`);
      continue;
    }
    const existing = giteeByGh.get(ghNum);
    const title = `[GH#${ghNum}] ${issue.title}`;
    try {
      if (!existing) {
        const url = `https://gitee.com/api/v5/repos/${GITEE_REPO}/issues?access_token=${token}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            body: `${issue.body || ''}\n\n> 来源：https://github.com/${GH_REPO}/issues/${ghNum}`,
          }),
        });
        const created = await res.json();
        if (!res.ok || !created.number) {
          bad(`创建 #${ghNum}`, JSON.stringify(created).slice(0, 200));
          continue;
        }
        if (ghState === 'closed') {
          await fetch(
            `https://gitee.com/api/v5/repos/${GITEE_REPO}/issues/${created.number}?access_token=${token}`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'closed' }) },
          );
          ok(`创建 #${ghNum}（closed）`, `Gitee #${created.number}`);
        } else {
          ok(`创建 #${ghNum}（open）`, `Gitee #${created.number}`);
        }
      } else if (String(existing.state).toLowerCase() !== ghState) {
        await fetch(
          `https://gitee.com/api/v5/repos/${GITEE_REPO}/issues/${existing.number}?access_token=${token}`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: ghState }) },
        );
        ok(`同步状态 #${ghNum}`, `Gitee #${existing.number} → ${ghState}`);
      } else {
        ok(`已存在 #${ghNum}`, `Gitee #${existing.number}（${issue.state}）`);
      }
    } catch (e) {
      bad(`同步 #${ghNum}`, e.message);
    }
  }

  const pass = results.filter((r) => r.pass).length;
  console.log(`\n═══ GitHub→Gitee issue 同步：${pass}/${results.length} ═══`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => { console.error(`✗ 失败：${e.message}`); process.exit(1); });
