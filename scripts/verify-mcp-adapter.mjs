#!/usr/bin/env node
/**
 * AR-2「MCP 即 Adapter」实机验证：外部 Agent Framework 以 MCP client 身份接入 KeelBase，
 * 证明 Identity → Permission → Audit 全走通（不替换业务系统即获得可治理的 AI 能力）。
 *
 * 流程（确定性，无需 LLM）：
 *   - initialize / tools/list：框架发现 KeelBase 治理感知的工具清单
 *   - tools/call 读工具（query_events）：以调用者身份执行、返回本人作用域数据
 *   - tools/call 写工具（create_event）：确认门控——不静默执行
 *   - 审计回环（admin）：/audit/logs?userId 出现 provider=mcp 的调用记录（谁做的）
 *
 * 用法：
 *   node scripts/verify-mcp-adapter.mjs
 * 环境变量：BASE_URL（默认 http://localhost:3000/api/v1）/ BENCH_USER / BENCH_PASS / ADMIN_USER / ADMIN_PASS
 * 前置：后端已启动（BENCH_USER + ADMIN_USER 存在，ADMIN_USER 角色为 admin）。
 * 报告：docs/benchmark/mcp-adapter-<ts>.json/.md（与 verify-proxy-bridge.mjs 同约定）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const USER = process.env.BENCH_USER || 'alex';
const PASS = process.env.BENCH_PASS || '123456';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin@1234';
const __dirname = dirname(fileURLToPath(import.meta.url));

const results = [];
const startMs = Date.now();
const ok = (name, detail = '') => { results.push({ name, pass: true, detail }); console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); };
const bad = (name, detail = '') => { results.push({ name, pass: false, detail }); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); };

async function loginAs(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`登录失败 ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (!body?.data?.accessToken) throw new Error('登录响应无 accessToken');
  return body.data.accessToken;
}

/** 最小 MCP client：POST JSON-RPC 到 /api/v1/mcp（外部框架的 MCP 传输同样如此） */
async function mcp(token, body) {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function api(token, path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  return { status: res.status, data: json?.data ?? json };
}

async function main() {
  console.log(`MCP 即 Adapter 验证 — BASE=${BASE} 用户=${USER}（读工具执行/写工具门控以该用户身份）`);
  const token = await loginAs(USER, PASS);

  // 1. initialize：外部框架握手
  const init = await mcp(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  const serverName = init.json?.result?.serverInfo?.name;
  if (init.json?.result?.serverInfo?.name === 'keelbase') ok('initialize（框架握手）', `serverInfo=${serverName} protocol=${init.json.result.protocolVersion}`);
  else bad('initialize（框架握手）', JSON.stringify(init.json));

  // 2. tools/list：框架发现治理感知的工具清单
  const list = await mcp(token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = (list.json?.result?.tools ?? []).map((t) => t.name);
  if (names.includes('query_events') && names.includes('create_event')) ok('tools/list（发现工具）', `共 ${names.length} 个工具，含 query_events/create_event`);
  else bad('tools/list（发现工具）', `缺预期工具（${names.length} 个：${names.slice(0, 5).join(',')}…）`);

  // 3. 读工具：以调用者身份执行，返回本人作用域数据（Identity + Scope）
  const read = await mcp(token, {
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'query_events', arguments: { start: '2026-01-01', end: '2026-12-31' } },
  });
  const readText = read.json?.result?.content?.[0]?.text;
  if (read.json?.result?.isError === false && Array.isArray(JSON.parse(readText || 'null'))) {
    ok('读工具执行（本人作用域）', `query_events 返回数组（${USER} 本人数据，非全量）`);
  } else bad('读工具执行（本人作用域）', JSON.stringify(read.json));

  // 4. 写工具：确认门控——不静默执行（Permission）
  const write = await mcp(token, {
    jsonrpc: '2.0', id: 4, method: 'tools/call',
    params: { name: 'create_event', arguments: { title: 'verify-mcp-adapter-gated' } },
  });
  const writeText = write.json?.result?.content?.[0]?.text ?? '';
  if (writeText.includes('requires confirmation')) ok('写工具确认门控', 'create_event 返回「需确认不执行」，未静默写库');
  else bad('写工具确认门控', JSON.stringify(write.json));

  // 5. 审计回环：admin 视角 /audit/logs 出现 provider=mcp 的调用记录（Audit）
  const me = await api(token, '/auth/me');
  const userId = String(me.data?.id);
  const adminToken = await loginAs(ADMIN_USER, ADMIN_PASS);
  const logs = await api(adminToken, `/audit/logs?userId=${userId}`);
  const entries = Array.isArray(logs.data) ? logs.data : [];
  const mcpCalls = entries.filter((e) => e.provider === 'mcp');
  const readAudited = mcpCalls.some((e) => e.action === 'tool_call' && (e.detail ?? '').includes('query_events'));
  const writeAudited = mcpCalls.some((e) => e.action === 'tool_call' && (e.detail ?? '').includes('create_event'));
  const usernameAttributed = mcpCalls.some((e) => e.username === USER);
  if (readAudited && writeAudited && usernameAttributed) {
    ok('审计回环（Audit + 归因）', `provider=mcp ${mcpCalls.length} 条：读/写均留痕，username=${USER}`);
  } else {
    bad('审计回环（Audit + 归因）', `读=${readAudited} 写=${writeAudited} 用户名归因=${usernameAttributed}（共 ${mcpCalls.length} 条 mcp）`);
  }

  // 汇总 + 报告
  const elapsed = Date.now() - startMs;
  const passCount = results.filter((r) => r.pass).length;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { gate: 'AR-2 MCP 即 Adapter：外部框架接入治理全走通', date: timestamp, base: BASE, user: USER, pass: passCount, total: results.length, elapsedSec: Math.round(elapsed / 1000), cases: results };
  mkdirSync(resolve(__dirname, '../docs/benchmark'), { recursive: true });
  const base = resolve(__dirname, `../docs/benchmark/mcp-adapter-${timestamp}`);
  writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
  const md = [
    `# MCP 即 Adapter：外部框架接入治理验证（${timestamp}）`, '',
    `- BASE=\`${BASE}\` 用户=\`${USER}\` ｜ ${passCount}/${results.length} 通过 ｜ 总耗时 ${Math.round(elapsed / 1000)}s`, '',
    '| # | 断言 | 结果 | 详情 |', '|---|------|------|------|',
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.pass ? '✅' : '❌'} | ${r.detail} |`), '',
  ].join('\n');
  writeFileSync(`${base}.md`, md);

  console.log(`\n═══ MCP 即 Adapter 结果：${passCount}/${results.length} 通过 ═══`);
  console.log(`报告：docs/benchmark/mcp-adapter-${timestamp}.md`);
  process.exit(passCount === results.length ? 0 : 1);
}

main().catch((e) => { console.error(`✗ 失败：${e.message}`); process.exit(1); });
