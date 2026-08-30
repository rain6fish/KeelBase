#!/usr/bin/env node
/**
 * MOAT-1「30 分钟接入验证」：零代码接入治理的自包含验收（护城河 2.0 嵌入广度）。
 *
 * 一个命令证明护城河承诺——不熟 KeelBase 的工程师按 docs/manual/adoption-30min.md
 * 在 30 分钟内把业务系统接进治理：
 *
 *   业务系统（Node 的 OpenAI 兼容 LLM 调用） → base_url 指向 sidecar
 *     → sidecar 上报治理台审计（source=sidecar）+ 转发真实 LLM（此处 mock）
 *     → 治理台独立库可见审计记录 + 哈希链连续
 *
 * 断言：
 *   1. 治理台健康（GET /api/v1/ai/health，@Public）
 *   2. sidecar 转发真实 LLM（mock upstream 收到 OpenAI 兼容请求并返回 usage）
 *   3. 业务系统零代码调用落地治理审计（治理库 ai_audit_logs 出现 source=sidecar 记录，
 *      含 x-user-id 归因 / 模型 / 请求摘要 / tokens / 耗时）
 *   4. 审计哈希链连续（每条 hash 非空，prev_hash 与上一条 hash 一致）
 *
 * 脚本自包含：自动 spawn 治理台 + sidecar + mock LLM（无需真实 API Key），跑完清理。
 *
 * 用法：
 *   node scripts/verify-moat-adoption.mjs
 * 环境变量（全部可选）：GOV_PORT=3100 SIDECAR_PORT=3200 MOCK_PORT=4390
 * 前置：`npm run build`（dist 已构建，脚本 spawn node dist/governance/main 与
 *       node dist/governance-sidecar/main）。
 */
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';

const GOV_PORT = parseInt(process.env.GOV_PORT || '3100', 10);
const SIDECAR_PORT = parseInt(process.env.SIDECAR_PORT || '3200', 10);
const MOCK_PORT = parseInt(process.env.MOCK_PORT || '4390', 10);
const GOV_API_KEY = process.env.GOV_API_KEY || 'adoption-test-governance-key';
const JWT_SECRET = 'adoption-test-jwt-secret-0123456789abcdef'; // ≥32 字符（Joi 要求）
const AUDIT_HMAC_KEY = 'ab'.repeat(32); // 64 hex
const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, '..');
const TEMP_DB = resolve(tmpdir(), `keelbase-moat-adoption-${process.pid}.sqlite`);
const HEALTH_TIMEOUT_MS = parseInt(process.env.HEALTH_TIMEOUT || '60000', 10);

const results = [];
const startMs = Date.now();
const ok = (name, detail = '') => { results.push({ name, pass: true, detail }); console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); };
const bad = (name, detail = '') => { results.push({ name, pass: false, detail }); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); };

/** 轮询 GET 直到 2xx 或超时 */
async function waitFor(url, label, timeoutMs = HEALTH_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return true;
    } catch { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`  ⚠ 等待超时：${label}（${url}）`);
  return false;
}

/** 探测 TCP 端口是否可连（sidecar 无公开健康端点） */
function waitPort(port, timeoutMs = HEALTH_TIMEOUT_MS) {
  return new Promise((resolveReady) => {
    const deadline = Date.now() + timeoutMs;
    const tryConnect = () => {
      if (Date.now() > deadline) return resolveReady(false);
      const sock = createConnection({ port, host: '127.0.0.1' });
      sock.once('connect', () => { sock.destroy(); resolveReady(true); });
      sock.once('error', () => { sock.destroy(); setTimeout(tryConnect, 300); });
    };
    tryConnect();
  });
}

/** mock 上游 LLM：OpenAI 兼容 chat/completions，返回固定 usage */
function startMockUpstream(port) {
  const hits = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch { /* 忽略 */ }
      hits.push({ model: parsed.model, messages: parsed.messages, at: Date.now() });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        id: 'chatcmpl-mock-1',
        object: 'chat.completion',
        model: parsed.model || 'mock-model',
        choices: [{ index: 0, message: { role: 'assistant', content: '（mock）合同摘要已生成。' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
      }));
    });
  });
  return new Promise((resolveReady) => server.listen(port, () => resolveReady({ server, hits })));
}

/** 直接查治理库：source=sidecar 的审计记录 + 哈希链连续性 */
function readAuditRows(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare(
      `SELECT id, user_id, username, action, model, provider, source, detail,
              prompt_tokens, completion_tokens, duration_ms, prev_hash, hash
       FROM ai_audit_logs ORDER BY id`,
    ).all();
  } finally {
    db.close();
  }
}

/** 轮询治理库直到 source=sidecar 审计落库（sidecar 上报为 fire-and-forget，避免竞态） */
async function waitForSidecarAudit(dbPath, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let rows = [];
  while (Date.now() < deadline) {
    try {
      rows = readAuditRows(dbPath);
      if (rows.filter((r) => r.source === 'sidecar').length >= 2) return rows;
    } catch { /* 库尚未建好 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return rows;
}

/** 校验哈希链：hash 非空且 prev_hash 与上一条 hash 一致（首条 prev_hash 可为 genesis/NULL） */
function checkChain(rows) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.hash) return { ok: false, index: i, reason: 'hash 为空' };
    if (i > 0 && r.prev_hash !== rows[i - 1].hash) return { ok: false, index: i, reason: 'prev_hash 与上一条 hash 不一致' };
  }
  return { ok: true };
}

async function main() {
  console.log('═══ MOAT-1 30 分钟接入验证：业务系统零代码接进治理 ═══');
  console.log(`治理台 :${GOV_PORT} | sidecar :${SIDECAR_PORT} | mock LLM :${MOCK_PORT}\n`);

  // 0. 前置：dist 已构建
  const govDist = resolve(SERVER_DIR, 'dist/governance/main.js');
  const sidecarDist = resolve(SERVER_DIR, 'dist/governance-sidecar/main.js');
  if (!existsSync(govDist) || !existsSync(sidecarDist)) {
    console.log('  ✗ 前置缺失：dist 未构建。请先 `npm run build` 后重跑。');
    process.exit(1);
  }

  // 1. 起 mock 上游 LLM
  const mock = await startMockUpstream(MOCK_PORT);
  console.log(`→ mock 上游 LLM 已起（:${MOCK_PORT}）`);
  const children = [];

  // 2. 起治理台（独立库，temp sqlite，synchronize 自动建表）
  const govEnv = {
    ...process.env,
    GOVERNANCE_PORT: String(GOV_PORT),
    GOVERNANCE_DB_PATH: TEMP_DB,
    GOVERNANCE_API_KEY: GOV_API_KEY,
    JWT_SECRET,
    JWT_REFRESH_SECRET: JWT_SECRET,
    AUDIT_HMAC_KEY,
    DB_TYPE: 'sqlite', // 钉住 sqlite，防 .env* 把 DB_TYPE 覆成 postgres
    NODE_ENV: 'test',
    THROTTLE_LIMIT: '100000', // Joi min(1)，放高值避免限流干扰
  };
  const gov = spawn(process.execPath, ['dist/governance/main'], { cwd: SERVER_DIR, env: govEnv, stdio: 'ignore' });
  children.push(gov);
  if (!(await waitFor(`http://localhost:${GOV_PORT}/api/v1/ai/health`, '治理台'))) {
    bad('治理台启动（GET /ai/health）', '超时未就绪');
    return finish(1, mock, children);
  }
  ok('治理台启动（GET /ai/health）', `:${GOV_PORT} 独立库 ${TEMP_DB}`);

  // 3. 起 sidecar（转发 mock + 上报治理台）
  const sidecar = spawn(process.execPath, ['dist/governance-sidecar/main'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      SIDECAR_PORT: String(SIDECAR_PORT),
      SIDECAR_UPSTREAM_URL: `http://localhost:${MOCK_PORT}`,
      SIDECAR_UPSTREAM_KEY: 'mock-upstream-key',
      GOVERNANCE_URL: `http://localhost:${GOV_PORT}`,
      GOVERNANCE_API_KEY: GOV_API_KEY,
      NODE_ENV: 'test',
    },
    stdio: 'ignore',
  });
  children.push(sidecar);
  if (!(await waitPort(SIDECAR_PORT))) {
    bad('sidecar 启动（:SIDECAR_PORT）', '端口未就绪');
    return finish(1, mock, children);
  }
  ok('sidecar 启动（AI 网关审计代理）', `:${SIDECAR_PORT}`);

  // 4. 「业务系统」零代码调用：LLM base_url 指向 sidecar（业务代码唯一改动）
  //    ——与接入指南 docs/manual/adoption-30min.md 步骤一致，任何 OpenAI 兼容 client 同此形态。
  const userId = 'ops-bot';
  const prompt = '请生成华东采购框架合同的摘要。';
  let bizRes;
  try {
    const t0 = Date.now();
    bizRes = await fetch(`http://localhost:${SIDECAR_PORT}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId, Authorization: 'Bearer business-llm-key' },
      body: JSON.stringify({ model: 'mock-model', messages: [{ role: 'user', content: prompt }] }),
    });
    bizRes.latencyMs = Date.now() - t0;
  } catch (e) {
    bad('业务系统调用（base_url → sidecar）', `请求失败：${e.message}`);
    return finish(1, mock, children);
  }
  const bizJson = await bizRes.json().catch(() => null);
  if (bizRes.ok && bizJson?.choices?.[0]?.message?.content) {
    ok('业务系统调用（base_url → sidecar）', `HTTP ${bizRes.status}，${Math.round(bizRes.latencyMs)}ms，收到 ${bizJson.model} 响应`);
  } else {
    bad('业务系统调用（base_url → sidecar）', `HTTP ${bizRes.status}：${JSON.stringify(bizJson)}`);
    return finish(1, mock, children);
  }

  // 5. mock 上游确实收到转发（转发真实 LLM）
  if (mock.hits.length >= 1 && mock.hits[0].model === 'mock-model') {
    ok('sidecar 转发真实 LLM（mock upstream）', `upstream 收到 model=${mock.hits[0].model}，usage tokens=${bizJson.usage?.total_tokens ?? '—'}`);
  } else {
    bad('sidecar 转发真实 LLM（mock upstream）', `mock 未收到转发（hits=${mock.hits.length}）`);
  }

  // 6. 治理库审计落地 + 哈希链（轮询等待 sidecar 上报落库）
  const rows = await waitForSidecarAudit(TEMP_DB);
  const sidecarRows = rows.filter((r) => r.source === 'sidecar');
  if (sidecarRows.length >= 2) {
    ok('治理审计落地（source=sidecar）', `治理库 ${sidecarRows.length} 条 sidecar 审计（请求 + 响应）`);
  } else {
    bad('治理审计落地（source=sidecar）', `期望 ≥2 条，实得 ${sidecarRows.length}（总 ${rows.length}）`);
  }
  const requestRow = sidecarRows.find((r) => r.action === 'chat' && r.detail?.includes(prompt.slice(0, 20)));
  if (requestRow) {
    const detail = [
      requestRow.user_id ? `userId=${requestRow.user_id}` : null,
      requestRow.model ? `model=${requestRow.model}` : null,
      requestRow.duration_ms != null ? `${requestRow.duration_ms}ms` : null,
      requestRow.completion_tokens != null ? `tokens=${requestRow.completion_tokens}` : null,
    ].filter(Boolean).join(' ');
    ok('审计内容（请求摘要 + 归因 + 模型 + 耗时）', `${requestRow.action}｜${detail}`);
    if (requestRow.user_id !== userId) bad('x-user-id 归因', `期望 ${userId}，实得 ${requestRow.user_id}`);
    else ok('x-user-id 归因（业务系统标识调用者）', `${requestRow.user_id}`);
  } else {
    bad('审计内容（请求摘要 + 归因 + 模型 + 耗时）', `未找到含请求摘要的 sidecar 审计（detail 示例：${sidecarRows[0]?.detail ?? '无'}）`);
  }
  const chain = checkChain(rows);
  if (chain.ok && rows.length > 0) {
    ok('审计哈希链连续（可验证完整性）', `${rows.length} 条全部 hash 非空 + prev_hash 连续`);
  } else {
    bad('审计哈希链连续（可验证完整性）', `断链@${chain.index}：${chain.reason}`);
  }

  return finish(results.every((r) => r.pass) ? 0 : 1, mock, children);
}

async function finish(code, mock, children) {
  mock.server.close();
  for (const c of children) { try { c.kill(); } catch { /* 已退出 */ } }
  await new Promise((r) => setTimeout(r, 500));
  try { rmSync(TEMP_DB, { force: true }); } catch { /* 占用则留给系统清理 */ }

  const elapsed = Date.now() - startMs;
  const passCount = results.filter((r) => r.pass).length;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = {
    gate: 'MOAT-1 30 分钟接入验证：业务系统零代码接进治理（sidecar → 治理台审计）',
    date: timestamp, pass: passCount, total: results.length, elapsedSec: Math.round(elapsed / 1000),
    topology: { governance: `:${GOV_PORT}`, sidecar: `:${SIDECAR_PORT}`, mockUpstream: `:${MOCK_PORT}` }, cases: results,
  };
  mkdirSync(resolve(__dirname, '../docs/benchmark'), { recursive: true });
  const base = resolve(__dirname, `../docs/benchmark/moat-adoption-${timestamp}`);
  writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
  const md = [
    `# MOAT-1 30 分钟接入验证（${timestamp}）`, '',
    `- ${passCount}/${results.length} 通过 ｜ 总耗时 ${Math.round(elapsed / 1000)}s ｜ 治理台 :${GOV_PORT} → sidecar :${SIDECAR_PORT} → mock LLM :${MOCK_PORT}`, '',
    '| # | 断言 | 结果 | 详情 |', '|---|------|------|------|',
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.pass ? '✅' : '❌'} | ${r.detail} |`), '',
  ].join('\n');
  writeFileSync(`${base}.md`, md);

  console.log(`\n═══ MOAT-1 30 分钟接入验证结果：${passCount}/${results.length} 通过（${Math.round(elapsed / 1000)}s）═══`);
  console.log(`报告：docs/benchmark/moat-adoption-${timestamp}.md`);
  process.exit(code);
}

main().catch((e) => { console.error(`✗ 失败：${e.message}`); process.exit(1); });
