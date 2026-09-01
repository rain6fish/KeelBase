#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 同步 GitHub issues → Gitee（用户通知时手动执行一次，不做定时）。
 *
 * 幂等：Gitee issue 标题带 `[GH#N]` 前缀关联 GitHub issue 号；已存在的跳过创建、仅同步状态。
 * Gitee quirks（源自 gitee-cli / 实测）：
 *   - 创建 = POST /repos/{owner}/issues（路径无 {repo} 段），form 字段 repo=<仓库名> 指定目标仓库
 *   - 状态变更 = PATCH /repos/{owner}/issues/{number}，JSON body {repo, title, state}，title 必须回显当前标题
 *
 * 用法：
 *   node scripts/sync-issues-to-gitee.mjs            # 同步全部（open + closed）
 *   node scripts/sync-issues-to-gitee.mjs --closed-only   # 只同步已完成的（closed）
 * 前置：
 *   - GitHub：gh 已登录（读 issues）
 *   - Gitee：~/.gitee-release-token 含 GITEE_TOKEN=（issues 作用域）
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const GH_REPO = 'rain6fish/KeelBase';
const GITEE_OWNER = 'rain6fish';
const GITEE_NAME = 'KeelBase';
const BASE = 'https://gitee.com/api/v5';

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
    const url = `${BASE}/repos/${GITEE_OWNER}/${GITEE_NAME}/issues?access_token=${token}&state=all&per_page=100&page=${page}`;
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
  const m = /^\[GH#(\d+)\]/.exec(title || '');
  return m ? Number(m[1]) : null;
}

/** 创建 issue：POST /repos/{owner}/issues + form repo/title/body */
async function createIssue(token, title, body) {
  const form = new URLSearchParams();
  form.set('repo', GITEE_NAME);
  form.set('title', title);
  form.set('body', body ?? '');
  const res = await fetch(`${BASE}/repos/${GITEE_OWNER}/issues?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  return res.json();
}

/** 状态变更：PATCH /repos/{owner}/issues/{number} + JSON {repo, title, state}（title 回显当前） */
async function setGiteeState(token, number, state) {
  const cur = await fetch(`${BASE}/repos/${GITEE_OWNER}/${GITEE_NAME}/issues/${number}?access_token=${token}`).then((r) =>
    r.json(),
  );
  if (!cur.title) throw new Error(`无法读取 Gitee issue ${number}: ${JSON.stringify(cur).slice(0, 150)}`);
  const res = await fetch(`${BASE}/repos/${GITEE_OWNER}/issues/${number}?access_token=${token}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo: GITEE_NAME, title: cur.title, state }),
  });
  return res.json();
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
        const created = await createIssue(
          token,
          title,
          `${issue.body || ''}\n\n> 来源：https://github.com/${GH_REPO}/issues/${ghNum}`,
        );
        if (!created.number) {
          bad(`创建 #${ghNum}`, JSON.stringify(created).slice(0, 200));
          continue;
        }
        if (ghState === 'closed') {
          const upd = await setGiteeState(token, created.number, 'closed');
          if (upd.state === 'closed') ok(`创建 #${ghNum}（closed）`, `Gitee #${created.number}`);
          else bad(`创建 #${ghNum}（closed）`, `创建成功但关闭失败: ${JSON.stringify(upd).slice(0, 150)}`);
        } else {
          ok(`创建 #${ghNum}（open）`, `Gitee #${created.number}`);
        }
      } else {
        const giteeState = String(existing.state).toLowerCase();
        if (giteeState !== ghState) {
          const target = ghState === 'closed' ? 'closed' : 'open';
          const upd = await setGiteeState(token, existing.number, target);
          if (String(upd.state).toLowerCase() === target) ok(`同步状态 #${ghNum}`, `Gitee #${existing.number} → ${target}`);
          else bad(`同步状态 #${ghNum}`, JSON.stringify(upd).slice(0, 150));
        } else {
          ok(`已存在 #${ghNum}`, `Gitee #${existing.number}（${existing.state}）`);
        }
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
