#!/usr/bin/env node
/**
 * MOAT-3「多系统单控制面」演示（护城河 2.2 收口实证）：
 * 一个独立治理控制平面同时管 N 个异构业务系统的 AI——
 *   System A「Node 商城」→ sidecar A（:3200）
 *   System B「Java CRM」→ sidecar B（:3201）   ← 语言无关，任意 OpenAI 兼容 client
 *   两个 sidecar 都上报/受控于同一个治理台（:3100，独立治理库）
 *
 * 演示要点：
 *   1. 统一审计：一次治理库查询同时看到两个系统的 AI 活动（x-user-id 归因可区分）
 *   2. 共享治理语义：两系统的写工具都按同一协议风险级（R3）触发确认门控
 *   3. 跨系统确认：两个系统的工具调用各自批准后执行，决策全部进同一治理审计链
 *   4. 语言无关：System B 标记为 Java 业务系统——sidecar 只认 OpenAI 兼容协议，不关心业务语言
 *
 * 用法：
 *   node scripts/demo-multi-system.mjs
 * 环境变量（可选）：GOV_PORT=3100 SIDECAR_PORT_A=3200 SIDECAR_PORT_B=3201 MOCK_PORT=4390
 * 前置：`npm run build`（spawn dist/governance 与 dist/governance-sidecar）。
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
const PORT_A = parseInt(process.env.SIDECAR_PORT_A || '3200', 10);
const PORT_B = parseInt(process.env.SIDECAR_PORT_B || '3201', 10);
const MOCK_PORT = parseInt(process.env.MOCK_PORT || '4390', 10);
const GOV_KEY = 'moat3-demo-governance-key';
const JWT_SECRET = 'adoption-test-jwt-secret-0123456789abcdef';
const AUDIT_HMAC_KEY = 'ab'.repeat(32);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, '..');
const TEMP_DB = resolve(tmpdir(), `moat3-demo-${process.pid}.sqlite`);

const line = (t) => console.log(`\n── ${t} ──`);

async function waitFor(url, label, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(3000) }); if (r.ok) return true; } catch { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`  ⚠ 等待超时：${label}`);
  return false;
}

function waitPort(port, timeoutMs = 60000) {
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

/** mock 上游 LLM：按提示词返回对应工具的 tool_call（模拟真实 LLM 函数调用） */
function startMockUpstream(port) {
  const server = createServer((req, res) => {
    let b = '';
    req.on('data', (d) => (b += d));
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(b || '{}'); } catch { /* 忽略 */ }
      const ask = (body.messages || []).at(-1)?.content || '';
      let toolCalls = [];
      if (ask.includes('发货')) toolCalls = [{ id: 'c1', type: 'function', function: { name: 'send_email', arguments: JSON.stringify({ to: 'ops@mall.example', subject: '发货通知' }) } }];
      if (ask.includes('改合同')) toolCalls = [{ id: 'c2', type: 'function', function: { name: 'update_contract', arguments: JSON.stringify({ id: 42, amount: 99000 }) } }];
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        id: 'cmpl-mock', object: 'chat.completion', model: body.model || 'mock',
        choices: [{ index: 0, message: { role: 'assistant', content: '', ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: toolCalls.length ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 },
      }));
    });
  });
  return new Promise((resolveReady) => server.listen(port, () => resolveReady(server)));
}

async function main() {
  console.log('═══ MOAT-3 多系统单控制面：一个治理台管 N 个异构业务系统 ═══');
  console.log(`治理台 :${GOV_PORT} | sidecar A（Node 商城）:${PORT_A} | sidecar B（Java CRM）:${PORT_B} | mock LLM :${MOCK_PORT}\n`);

  // 0. 前置
  if (!existsSync(resolve(SERVER_DIR, 'dist/governance/main.js')) || !existsSync(resolve(SERVER_DIR, 'dist/governance-sidecar/main.js'))) {
    console.log('  ✗ 前置缺失：dist 未构建。请先 `npm run build` 后重跑。');
    process.exit(1);
  }

  // 1. 治理控制平面（独立治理库）
  const gov = spawn(process.execPath, ['dist/governance/main'], {
    cwd: SERVER_DIR,
    env: { ...process.env, GOVERNANCE_PORT: String(GOV_PORT), GOVERNANCE_DB_PATH: TEMP_DB, GOVERNANCE_API_KEY: GOV_KEY, JWT_SECRET, JWT_REFRESH_SECRET: JWT_SECRET, AUDIT_HMAC_KEY, DB_TYPE: 'sqlite', NODE_ENV: 'test', THROTTLE_LIMIT: '100000' },
    stdio: 'ignore',
  });
  const mock = await startMockUpstream(MOCK_PORT);
  await waitFor(`http://localhost:${GOV_PORT}/api/v1/ai/health`, '治理台');
  console.log('✓ 治理控制平面已起（独立库，/api/v1/ai/health OK）');
  line('接入系统 A（Node 商城）与系统 B（Java CRM）——各配一个 sidecar，都指向同一治理台');

  // System A / System B sidecar（SIDECAR_TOOLS 各自声明工具风险级）
  const sidecars = [];
  for (const [port, name, tools] of [
    [PORT_A, 'A', JSON.stringify([{ name: 'send_email', riskLevel: 'R3' }])],
    [PORT_B, 'B', JSON.stringify([{ name: 'update_contract', riskLevel: 'R3' }])],
  ]) {
    const sc = spawn(process.execPath, ['dist/governance-sidecar/main'], {
      cwd: SERVER_DIR,
      env: { ...process.env, SIDECAR_PORT: String(port), SIDECAR_UPSTREAM_URL: `http://localhost:${MOCK_PORT}`, SIDECAR_UPSTREAM_KEY: 'k', GOVERNANCE_URL: `http://localhost:${GOV_PORT}`, GOVERNANCE_API_KEY: GOV_KEY, SIDECAR_TOOLS: tools, NODE_ENV: 'test' },
      stdio: 'ignore',
    });
    sidecars.push(sc);
    await waitPort(port);
    console.log(`  ✓ sidecar ${name} 已起（:${port}）— 业务系统 LLM base URL → ${name === 'A' ? 'Node 商城' : 'Java CRM'} 的 sidecar`);
  }

  // 2. 两个系统各自发一次 AI 调用（都触发写工具）
  line('系统 A（Node 商城）：AI 请求「请发货并邮件通知客户」（写工具 send_email，R3）');
  const callA = await chat(PORT_A, 'mall-bot', '请发货并邮件通知客户');
  const confA = callA.choices[0].message.confirmation;
  console.log(`  → 返回确认标记：token=${confA.token.slice(0, 8)}… tools=${confA.tools.join(',')}（R3 需确认，未放行）`);

  line('系统 B（Java CRM）：AI 请求「更新合同金额」（写工具 update_contract，R3）');
  const callB = await chat(PORT_B, 'crm-bot', '请改合同金额');
  const confB = callB.choices[0].message.confirmation;
  console.log(`  → 返回确认标记：token=${confB.token.slice(0, 8)}… tools=${confB.tools.join(',')}（R3 需确认，未放行）`);

  // 3. 两个系统分别批准
  line('系统 A 批准 + 系统 B 批准（各自取回工具调用执行）');
  const apA = await confirm(PORT_A, confA.token, 'approve', 'mall-bot');
  const apB = await confirm(PORT_B, confB.token, 'approve', 'crm-bot');
  console.log(`  ✓ 系统 A 执行工具：${apA.choices[0].message.tool_calls[0].function.name}`);
  console.log(`  ✓ 系统 B 执行工具：${apB.choices[0].message.tool_calls[0].function.name}`);

  // 4. 统一审计：一次治理库查询看到两个系统的 AI 活动
  line('统一审计视图（同一治理库，按 user_id 区分系统）');
  const rows = await readAudit(TEMP_DB);
  const bySystem = (uid) => rows.filter((r) => r.user_id === uid);
  const sysA = bySystem('mall-bot');
  const sysB = bySystem('crm-bot');
  console.log(`  系统 A（mall-bot）审计 ${sysA.length} 条：${sysA.map((r) => `${r.action}(${short(r.detail)})`).join(' → ')}`);
  console.log(`  系统 B（crm-bot）审计 ${sysB.length} 条：${sysB.map((r) => `${r.action}(${short(r.detail)})`).join(' → ')}`);
  const chainOk = checkChain(rows);
  console.log(`  哈希链：${rows.length} 条全部连续（${chainOk.ok ? '✅' : '❌ 断链'}）——两个系统的决策进同一证据链`);

  // 5. 汇总 + 报告
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = {
    gate: 'MOAT-3 多系统单控制面演示', date: timestamp,
    topology: { governance: `:${GOV_PORT}`, systemA: `:${PORT_A} (Node 商城, mall-bot)`, systemB: `:${PORT_B} (Java CRM, crm-bot)`, mockLLM: `:${MOCK_PORT}` },
    unifiedAudit: { systemA: sysA.length, systemB: sysB.length, chainValid: chainOk.ok },
  };
  mkdirSync(resolve(__dirname, '../docs/benchmark'), { recursive: true });
  writeFileSync(resolve(__dirname, `../docs/benchmark/moat3-multisystem-${timestamp}.json`), JSON.stringify(report, null, 2));

  mock.close(); gov.kill(); for (const sc of sidecars) sc.kill();
  await new Promise((r) => setTimeout(r, 400));
  try { rmSync(TEMP_DB, { force: true }); } catch { /* 占用则留给系统 */ }

  console.log(`\n═══ 演示完成：一个治理控制平面（:${GOV_PORT}）同时管住了 ${2} 个异构业务系统的 AI（统一审计 + 共享门控 + 跨系统决策进同一哈希链）═══`);
  console.log(`报告：docs/benchmark/moat3-multisystem-${timestamp}.json`);
  process.exit(0);
}

async function chat(port, userId, content) {
  const r = await fetch(`http://localhost:${port}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify({ model: 'mock', messages: [{ role: 'user', content }] }),
  });
  return r.json();
}

async function confirm(port, token, decision, userId) {
  const r = await fetch(`http://localhost:${port}/v1/confirmations/${token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify({ decision }),
  });
  return r.json();
}

async function readAudit(dbPath) {
  // 治理进程可能持有写锁：busy_timeout + 有限重试，避免偶发 database is locked
  for (let attempt = 0; attempt < 5; attempt++) {
    let db;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      db.exec('PRAGMA busy_timeout = 3000;');
      return db.prepare('SELECT id, user_id, action, detail, prev_hash, hash FROM ai_audit_logs ORDER BY id').all();
    } catch {
      if (db) { try { db.close(); } catch { /* 忽略 */ } }
      if (attempt === 4) throw new Error('audit 库读取失败（busy）');
      awaitSleep(300);
    }
  }
}

function awaitSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function checkChain(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].hash) return { ok: false };
    if (i > 0 && rows[i].prev_hash !== rows[i - 1].hash) return { ok: false };
  }
  return { ok: true };
}

function short(detail) {
  const s = String(detail ?? '');
  return s.length > 34 ? `${s.slice(0, 34)}…` : s;
}

main().catch((e) => { console.error(`✗ 失败：${e.message}`); process.exit(1); });
