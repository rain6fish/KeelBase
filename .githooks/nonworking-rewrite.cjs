#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// 非工作时间时间映射：rebase / cherry-pick 重写后的 committer 修正（post-rewrite hook 核心）
// 背景：git rebase 会保留 author date、把 committer date 重置为「rebase 运行的当前系统时间」，
//       且 rebase 触发 post-rewrite（不触发 post-commit）。若 rebase 发生在工作日 05-19 点，
//       重写 commit 的 committer 会落在工作时间（author 仍是映射后的晚间时间）。
// 规则：从 stdin 读 <old-sha> <new-sha> 重写对；凡新 commit 的 committer 落在工作日 05-19，
//       将其 committer 时间修正为 author date（author 已是映射后的非工作时间）。
//       若某 commit 本身无需修正但其父被修正，则该 commit 一并重建以保持父引用一致。
// 实现：读 commit 对象 → 逐层重建 → hash-object 写新对象 → 更新当前分支引用。
//       hash-object / update-ref 不触发任何 hook，无递归风险；reflog 保留旧历史可恢复。
'use strict';
const fs = require('fs');
const { spawnSync } = require('child_process');

// spawnSync 直传参数数组，不经 shell（Windows 上 execSync 走 cmd.exe 不认 POSIX 引号）
function git(args, opts = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8', input: opts.input });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'git failed').trim());
  return (r.stdout || '').trim();
}

function parseIdent(s) {
  const m = s.match(/^(.*) <(.*)> (\d+) ([+-]\d{4})$/);
  return m ? { ts: m[3], tz: m[4] } : null;
}

function parseCommit(sha) {
  const raw = git(['cat-file', 'commit', sha]);
  const nl = raw.indexOf('\n\n');
  const headerStr = nl === -1 ? raw : raw.slice(0, nl);
  const message = nl === -1 ? '' : raw.slice(nl + 2);
  const meta = {
    tree: null,
    parents: [],
    author: null,
    committer: null,
    authorRaw: null,
    committerRaw: null,
    extraHeader: [],
    message,
  };
  for (const line of headerStr.split('\n')) {
    if (line.startsWith('tree ')) meta.tree = line.slice(5);
    else if (line.startsWith('parent ')) meta.parents.push(line.slice(7));
    else if (line.startsWith('author ')) { meta.authorRaw = line.slice(7); meta.author = parseIdent(line.slice(7)); }
    else if (line.startsWith('committer ')) { meta.committerRaw = line.slice(10); meta.committer = parseIdent(line.slice(10)); }
    else if (line.startsWith(' ') && meta.extraHeader.length) meta.extraHeader[meta.extraHeader.length - 1] += '\n' + line;
    else meta.extraHeader.push(line);
  }
  return meta;
}

function localParts(ts, tz) {
  const sign = tz.startsWith('-') ? -1 : 1;
  const offMin = sign * (parseInt(tz.slice(1, 3), 10) * 60 + parseInt(tz.slice(3, 5), 10));
  const d = new Date((+ts + offMin * 60) * 1000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, day: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}

// 工作日(Mon-Fri) 05:00-19:00（本地时区，tz 显式换算）
function isDaytime(ts, tz) {
  const p = localParts(ts, tz);
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.day)).getUTCDay();
  if (!(dow >= 1 && dow <= 5)) return false;
  const mm = p.h * 60 + p.mi;
  return mm >= 300 && mm < 1140;
}

function buildCommit(meta, newParents, authorTime) {
  const header = ['tree ' + meta.tree];
  for (const p of newParents) header.push('parent ' + p);
  header.push('author ' + meta.authorRaw);
  if (authorTime) {
    const cm = meta.committerRaw.match(/^(.*) <(.*)> \d+ [+-]\d{4}$/);
    header.push(`committer ${cm[1]} <${cm[2]}> ${authorTime.ts} ${authorTime.tz}`);
  } else {
    header.push('committer ' + meta.committerRaw);
  }
  for (const line of meta.extraHeader) header.push(line);
  return header.join('\n') + '\n\n' + meta.message;
}

// ---------- main ----------
const input = fs.readFileSync(0, 'utf8');
const pairs = input
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => l.split(/\s+/).slice(0, 2));

if (!pairs.length) process.exit(0);

const needFix = new Map();
for (const [, nw] of pairs) {
  if (needFix.has(nw)) continue;
  try {
    const meta = parseCommit(nw);
    if (meta.committer && isDaytime(meta.committer.ts, meta.committer.tz)) needFix.set(nw, meta);
  } catch (e) { /* 对象缺失等，跳过 */ }
}
if (!needFix.size) process.exit(0);

const rebuilt = new Map();
function rebuild(sha) {
  if (rebuilt.has(sha)) return rebuilt.get(sha);
  let meta;
  try { meta = parseCommit(sha); } catch (e) { rebuilt.set(sha, sha); return sha; }
  let changed = needFix.has(sha);
  const newParents = meta.parents.map((p) => {
    const np = rebuild(p);
    if (np !== p) changed = true;
    return np;
  });
  if (!changed) { rebuilt.set(sha, sha); return sha; }
  const authorTime = needFix.has(sha) && meta.author ? meta.author : null;
  const content = buildCommit(meta, newParents, authorTime);
  const newSha = git(['hash-object', '-t', 'commit', '-w', '--stdin'], { input: content });
  rebuilt.set(sha, newSha);
  return newSha;
}

let head;
try { head = git(['rev-parse', 'HEAD']); } catch (e) { process.exit(0); }
const newHead = rebuild(head);

if (newHead !== head) {
  let branch = '';
  try { branch = git(['symbolic-ref', '-q', 'HEAD']); } catch (e) { branch = ''; }
  if (branch && branch.startsWith('refs/')) git(['update-ref', branch, newHead]);
  else git(['update-ref', 'HEAD', newHead]);
  process.stderr.write(`[post-rewrite] ${needFix.size} 个重写 commit 的 committer 落在工作时间，已修正为 author date\n`);
}
process.exit(0);
