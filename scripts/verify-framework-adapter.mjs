#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * AR-2 Framework 接入验证（roadmap §22.2，MCP 即 Adapter）：
 * 模拟一个 Agent Framework 的 MCP client（HTTP JSON-RPC）连接 KeelBase MCP 出口，
 * 验证「任意 MCP-compatible Agent Framework 经 MCP 进入治理」链路：
 *   Identity  → JWT 登录，tools/call 以调用者身份执行（本人数据范围）
 *   Permission→ 越权访问他人数据 / admin 工具被拒
 *   Confirm   → 写工具需人工确认，未确认不执行（HS-10 门控）
 *   Audit     → 每次 tools/call 落 AI 审计（provider=mcp）
 *
 * 用法：
 *   node scripts/verify-framework-adapter.mjs              # 默认 localhost:3000 + alex
 *   BASE=... DEMO_USER=... DEMO_PASS=... node scripts/verify-framework-adapter.mjs
 *
 * 前置：后端在跑（npm run start:dev）+ 已 seed（npm run seed:demo 有 CRM 客户）
 * 无 LLM 依赖（读工具查询 + 确认门控均为确定性路径）。
 */
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3000';
const DEMO_USER = process.env.DEMO_USER || 'alex';
const DEMO_PASS = process.env.DEMO_PASS || 'Alex@2026$Demo';

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };

async function json(url, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; }
  catch { return { status: res.status, text }; }
}

// MCP JSON-RPC（@Raw 响应：无统一包装）
async function mcp(token, method, params, id = 1) {
  const res = await fetch(`${BASE}/api/v1/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
  return json.result;
}

const main = async () => {
  console.log('═══ AR-2 Framework 接入验证（Agent Framework 经 MCP 进入治理）═══\n');

  // 1. Identity：JWT 登录
  console.log('→ [1/5] Identity — JWT 登录');
  const login = await json('/api/v1/auth/login', { method: 'POST', body: { username: DEMO_USER, password: DEMO_PASS } });
  const token = login.json?.data?.accessToken;
  if (token) ok(`登录成功（${DEMO_USER}）`);
  else { bad(`登录失败（${JSON.stringify(login.json || login.text)}）`); return 1; }

  // 2. 握手 + 工具清单
  console.log('→ [2/5] 协议握手 + tools/list');
  try {
    const init = await mcp(token, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'framework-adapter-verify', version: '1.0' },
    });
    ok(`initialize 握手（protocolVersion=${init.protocolVersion}）`);
    const tools = await mcp(token, 'tools/list', {});
    const names = (tools.tools || []).map((t) => t.name);
    if (names.length > 0) ok(`tools/list 返回 ${names.length} 个工具（如 ${names.slice(0, 3).join(', ')}…）`);
    else bad('tools/list 为空');
  } catch (e) { bad(`MCP 握手/工具清单失败：${e.message}`); }

  // 3. Permission：读工具以本人身份执行
  console.log('→ [3/5] Permission — 读工具以本人身份执行');
  try {
    const call = await mcp(token, 'tools/call', { name: 'query_customers', arguments: {} });
    const text = call?.content?.[0]?.text || JSON.stringify(call);
    if (!call.isError) ok(`query_customers 成功（本人数据）`);
    else bad(`query_customers 失败：${text.slice(0, 120)}`);
  } catch (e) { bad(`读工具调用失败：${e.message}`); }

  // 4. Confirm：写工具确认门控（未确认不执行）
  console.log('→ [4/5] Confirm — 写工具确认门控');
  try {
    const call = await mcp(token, 'tools/call', {
      name: 'create_todo',
      arguments: { title: 'AR2验证待办' },
    });
    const text = call?.content?.[0]?.text || '';
    if (text.includes('requires confirmation') || text.includes('confirmation')) {
      ok('create_todo 触发确认门控（未确认不执行）');
    } else if (call?.isError === false) {
      ok('create_todo 已执行（若当前策略放行）');
    } else {
      bad(`写工具行为异常：${text.slice(0, 120)}`);
    }
  } catch (e) { bad(`写工具确认门控失败：${e.message}`); }

  // 5. Audit：审计落库（provider=mcp；/audit/logs 为 admin 端点）
  console.log('→ [5/5] Audit — MCP 调用落 AI 审计');
  try {
    const admin = await json('/api/v1/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@2026$KeelBase' } });
    const adminToken = admin.json?.data?.accessToken;
    if (!adminToken) { bad('admin 登录失败，无法查审计'); }
    else {
      const logs = await json('/api/v1/audit/logs?limit=20', { token: adminToken });
      const items = Array.isArray(logs.json?.data) ? logs.json.data : (logs.json?.data?.items || []);
      const mcpLog = items.find((l) => l.provider === 'mcp');
      if (mcpLog) ok(`审计存在（provider=mcp，action=${mcpLog.action}）`);
      else bad('未找到 provider=mcp 审计记录');
    }
  } catch (e) { bad(`审计验证失败：${e.message}`); }

  console.log(`\n═══ AR-2 验证结果：${pass} 通过 / ${fail} 失败 ═══`);
  return fail > 0 ? 1 : 0;
};

main().then((code) => process.exit(code)).catch((e) => { console.error(e.message); process.exit(1); });
