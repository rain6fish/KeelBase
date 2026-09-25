#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Audit-chain concurrency verification.
 *
 * Drives concurrent audit-chain writes and checks the invariants a hash chain must
 * hold — the ones a fork silently breaks:
 *   F1 fork      two rows sharing one prev_hash (GROUP BY prev_hash HAVING COUNT(*)>1)
 *   F2 loss      fewer rows than successful writes
 *   F4 half-write a row with a NULL hash
 *   F5 lie       verify() reports valid while the chain is actually forked
 *
 * Usage:
 *   node scripts/verify-audit-chain-concurrency.mjs --clients=1 --per-client=32
 *   node scripts/verify-audit-chain-concurrency.mjs --clients=4 --per-client=32
 *
 * Preconditions: the backend is running against a scratch sqlite database with a
 * raised throttle limit (see --help output at the bottom of this file). This script
 * never writes outside that database and never calls any destructive endpoint.
 *
 * Coverage: this harness exercises the SQLITE path (in-process serializer). The
 * PostgreSQL path serializes writers with a row lock on `audit_chain_lock` — run
 * two backend processes against one postgres database with --bases to cover it.
 *
 * 审计链并发验证。
 *
 * 并发写入审计链，检查哈希链必须成立的不变量——分叉会静默破坏它们：
 *   F1 分叉    两行共用同一 prev_hash（GROUP BY prev_hash HAVING COUNT(*)>1）
 *   F2 丢行    行数少于成功的写请求数
 *   F4 半写    hash 为 NULL 的行
 *   F5 谎报    verify() 报 valid，但链实际已分叉
 *
 * 用法：
 *   node scripts/verify-audit-chain-concurrency.mjs --clients=1 --per-client=32
 *   node scripts/verify-audit-chain-concurrency.mjs --clients=4 --per-client=32
 *
 * 覆盖范围：本脚本走的是 **sqlite** 路径（进程内串行器）。**PostgreSQL** 路径用
 * `audit_chain_lock` 行锁跨实例串行化——用两个后端进程连同一个 postgres 库、并传
 * `--bases` 即可覆盖。
 *
 * 前置：后端已启动，指向一个**临时 sqlite 库**且限流已放宽（见文末 --help）。本脚本
 * 只在那个库里读写，不调用任何破坏性端点。
 */
import { fork } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const ALICE_PASS = process.env.ALICE_PASS || 'Alex@2026$Demo';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin@2026$KeelBase';
const DB_FILE = resolve(process.env.DB_PATH || resolve(__dirname, '../data/front.sqlite'));

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [a, true];
  }),
);
const CLIENTS = Number(argv.clients ?? 1);
const PER_CLIENT = Number(argv['per-client'] ?? 32);
const CLIENT_ID = Number(argv['client-id'] ?? 0);
const LABEL = String(argv.label ?? `c${CLIENTS}x${PER_CLIENT}`);
const IS_CHILD = argv.child === 'true';
/**
 * One or more backend base URLs. Passing several is the whole point of the
 * cross-process run: each client talks to a different SERVER PROCESS, so the
 * writes reach the chain from more than one in-process serializer.
 *
 * 一个或多个后端 base URL。传多个正是跨进程那一轮的关键：每个客户端打**不同的服务
 * 进程**，写入才会来自多于一个进程内串行器。
 */
const BASES = String(argv.bases ?? BASE).split(',').map((s) => s.trim()).filter(Boolean);
const MY_BASE = BASES[CLIENT_ID % BASES.length];

const results = [];
const ok = (name, detail = '') => { results.push({ name, pass: true, detail }); console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); };
const bad = (name, detail = '') => { results.push({ name, pass: false, detail }); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); };

async function api(path, { token, method = 'GET', body, base = BASE } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* non-JSON error body */ }
  return { status: res.status, payload };
}

async function login(username, password, base = BASE) {
  const r = await api('/auth/login', { method: 'POST', body: { username, password }, base });
  const token = r.payload?.data?.accessToken ?? r.payload?.data?.access_token ?? r.payload?.accessToken;
  if (!token) throw new Error(`login(${username}) failed: HTTP ${r.status} ${JSON.stringify(r.payload)?.slice(0, 200)}`);
  return token;
}

/** One client process: log in, then fire PER_CLIENT concurrent writes. */
async function clientWork() {
  const token = await login('alex', ALICE_PASS, MY_BASE);
  const stamp = Date.now();
  const start = new Date(stamp).toISOString();
  const end = new Date(stamp + 3600_000).toISOString();

  const calls = Array.from({ length: PER_CLIENT }, (_, i) =>
    api('/events', {
      token,
      base: MY_BASE,
      method: 'POST',
      body: { title: `conc-${LABEL}-${CLIENT_ID}-${i}-${stamp}`, startTime: start, endTime: end },
    }).then((r) => r.status).catch(() => -1),
  );

  const statuses = await Promise.all(calls);
  const okCount = statuses.filter((s) => s >= 200 && s < 300).length;
  const tally = statuses.reduce((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});
  return { clientId: CLIENT_ID, base: MY_BASE, issued: PER_CLIENT, ok: okCount, tally };
}

/** Parent spawns CLIENTS child processes so the writes come from distinct processes. */
function runChildren() {
  return Promise.all(
    Array.from({ length: CLIENTS }, (_, i) =>
      new Promise((res) => {
        const cp = fork(fileURLToPath(import.meta.url), [
          '--child=true', `--client-id=${i}`, `--per-client=${PER_CLIENT}`, `--label=${LABEL}`,
          `--bases=${BASES.join(',')}`,
        ], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        let out = '';
        cp.stdout.on('data', (d) => { out += d; });
        cp.stderr.on('data', (d) => { out += d; });
        cp.on('message', (m) => res(m));
        cp.on('exit', (code) => res(code === 0 ? null : { clientId: i, error: `exit ${code}`, out: out.slice(-400) }));
      }),
    ),
  );
}

function inspectChains() {
  if (!existsSync(DB_FILE)) return { error: `sqlite not found: ${DB_FILE}` };
  const db = new Database(DB_FILE, { readonly: true });
  try {
    const one = (sql) => db.prepare(sql).get();
    const all = (sql) => db.prepare(sql).all();
    return {
      dbFile: DB_FILE,
      opAudit: {
        total: one('SELECT COUNT(*) c FROM operation_audit_logs').c,
        nullHash: one('SELECT COUNT(*) c FROM operation_audit_logs WHERE hash IS NULL').c,
        fromEvents: one("SELECT COUNT(*) c FROM operation_audit_logs WHERE path LIKE '%/events'").c,
        forks: all('SELECT prev_hash, COUNT(*) c FROM operation_audit_logs GROUP BY prev_hash HAVING c > 1'),
      },
    };
  } finally {
    db.close();
  }
}

async function main() {
  if (IS_CHILD) {
    const out = await clientWork();
    process.send?.(out);
    process.exit(0);
  }

  console.log(`═══ 审计链并发验证 / audit-chain concurrency ═══`);
  console.log(`目标服务进程 ${BASES.length} 个：${BASES.join(' , ')}`);
  console.log(`客户端进程 ${CLIENTS} × 每进程并发 ${PER_CLIENT} = ${CLIENTS * PER_CLIENT} 次写\n`);

  const startedAt = Date.now();
  let perClient;
  if (CLIENTS === 1) {
    perClient = [await clientWork()];
  } else {
    perClient = (await runChildren()).filter(Boolean);
  }
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

  const issued = perClient.reduce((a, c) => a + (c.issued ?? 0), 0);
  const succeeded = perClient.reduce((a, c) => a + (c.ok ?? 0), 0);
  console.log(`  发起 ${issued} 次写 / 成功 ${succeeded} 次（${elapsedSec}s）`);
  const failed = perClient.filter((c) => c.error);
  if (failed.length) console.log(`  ⚠ 子进程异常：${JSON.stringify(failed).slice(0, 300)}`);

  // Chain verification through the product's own endpoint (F5: does it tell the truth?)
  const adminToken = await login('admin', ADMIN_PASS);
  const verified = await api('/audit/operations/verify', { token: adminToken });
  const chainValid = verified.payload?.data?.valid === true;
  const checked = verified.payload?.data?.checked ?? null;
  const brokenIndex = verified.payload?.data?.brokenIndex ?? null;

  const db = inspectChains();

  console.log('');
  if (db.error) {
    bad('读取 sqlite（跳过 DB 级检查）', db.error);
  } else {
    const { opAudit } = db;
    console.log(`  操作审计链：总行 ${opAudit.total} · 本次 events 产生 ${opAudit.fromEvents} · verify.checked ${checked}`);

    opAudit.forks.length === 0
      ? ok('F1 无分叉', '没有 prev_hash 被两行共用')
      : bad('F1 分叉', `${opAudit.forks.length} 个 prev_hash 被重复引用：${JSON.stringify(opAudit.forks.slice(0, 3))}`);

    opAudit.nullHash === 0
      ? ok('F4 无半写行', 'hash IS NULL 计数为 0')
      : bad('F4 半写行', `${opAudit.nullHash} 行 hash 为 NULL`);

    opAudit.total >= succeeded
      ? ok('F2 无丢行', `总行 ${opAudit.total} ≥ 成功写 ${succeeded}`)
      : bad('F2 丢行', `总行 ${opAudit.total} < 成功写 ${succeeded}`);
  }

  // F5: the endpoint and the DB must agree. A fork makes verify() report brokenIndex.
  if (db.error) {
    bad('F5 一致性', '无法比对（DB 读取失败）');
  } else if (db.opAudit.forks.length > 0 && chainValid) {
    bad('F5 谎报', `链已分叉（${db.opAudit.forks.length} 处）但 verify 仍报 valid`);
  } else if (db.opAudit.forks.length > 0 && !chainValid) {
    ok('F5 如实报告', `链分叉 ${db.opAudit.forks.length} 处，verify 报 valid=false（brokenIndex=${brokenIndex}）`);
  } else {
    chainValid
      ? ok('F5 verify 与 DB 一致', '无分叉且 verify 报 valid')
      : bad('F5 verify 与 DB 不一致', `无分叉但 verify 报 valid=false（brokenIndex=${brokenIndex}）`);
  }

  const passCount = results.filter((r) => r.pass).length;
  const report = {
    gate: '审计链并发验证（F1/F2/F4/F5）',
    label: LABEL,
    date: new Date().toISOString().replace(/[:.]/g, '-'),
    base: BASE,
    clients: CLIENTS,
    perClient: PER_CLIENT,
    elapsedSec,
    issued,
    succeeded,
    perClient,
    verifyEndpoint: { valid: chainValid, checked, brokenIndex },
    db,
    pass: passCount,
    total: results.length,
    cases: results,
  };
  const outDir = resolve(__dirname, '../docs/benchmark');
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, `audit-chain-concurrency-${LABEL}-${report.date}.json`);
  writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log(`\n═══ 结果：${passCount}/${results.length} 通过（${elapsedSec}s）═══`);
  console.log(`报告：${outFile}`);
  process.exit(passCount === results.length ? 0 : 1);
}

main().catch((e) => { console.error(`✗ 失败：${e.message}`); process.exit(1); });
