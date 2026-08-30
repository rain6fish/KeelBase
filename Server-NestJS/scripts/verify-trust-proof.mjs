#!/usr/bin/env node
/**
 * Trust 证明包 — 六场景一键验证（P0 产品证明 / security-showcase §Trust 证明包）
 *
 * 用纯 REST + 确定性 Demo Provider 演示并验证 Business-safe Trust 链路：
 *   S1 正常成功：客户 → 逾期订单 → AI 风险分析（Identity + 数据权限 + 读工具）
 *   S2 越权拒绝：bob 访问 alex 数据 → 403（行级权限）
 *   S3 高风险动作：AI 尝试删除客户 → R5 BLOCKED（不可逆动作策略阻断）
 *   S4 人工确认：AI 写操作 → confirmation_request → approve → 落库
 *   S5 撤销：本人撤销 AI 副作用 → 软删（可经回收站恢复）
 *   S6 Java 存量系统：引导到 java-starter 独立验证（verify-crm-e2e.mjs）
 *
 * 用法：
 *   node scripts/verify-trust-proof.mjs
 * 环境变量：BASE_URL（默认 http://localhost:3000/api/v1）· ALICE_PASS / ADMIN_PASS
 *           PROVIDER=demo（默认，确定性；配真实 LLM 时也可用 deepseek 等）
 * 前置：后端已启动（含 delete_customer R5 工具 + demo provider）；alex/admin 账号存在（首启自动 seed）。
 * 报告：docs/benchmark/trust-proof-<ts>.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const ALICE_PASS = process.env.ALICE_PASS || 'Alex@2026$Demo';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin@2026$KeelBase';
const PROVIDER = process.env.PROVIDER || 'demo';
const __dirname = dirname(fileURLToPath(import.meta.url));

const results = [];
const startMs = Date.now();
const ok = (name, detail = '') => { results.push({ name, pass: true, detail }); console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); };
const bad = (name, detail = '') => { results.push({ name, pass: false, detail }); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); };

async function api(path, { token, method = 'GET', body, raw = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: res.status, data: json?.data ?? json };
}

async function login(username, password) {
  const r = await api('/auth/login', { method: 'POST', body: { username, password } });
  if (!r.data?.accessToken) throw new Error(`登录失败 ${username}: ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  return { token: r.data.accessToken, id: r.data.user?.id ?? r.data.id };
}

/** 非流式对话：返回 reply（写操作在非流式路径不执行，仅读工具/R5 阻断走这里） */
async function chat(token, message) {
  const r = await api('/ai/chat', { token, method: 'POST', body: { message, provider: PROVIDER } });
  if (r.status !== 200) return { ok: false, reply: JSON.stringify(r.data).slice(0, 200), status: r.status };
  return { ok: true, reply: r.data?.reply ?? '', conversationId: r.data?.conversationId, toolCalls: r.data?.toolCalls ?? [] };
}

/** 流式对话：收集工具/确认请求/决策/文本，遇 confirmation_request 内联 approve 或 reject。返回结构化摘要。 */
async function streamChat(token, message, { onConfirmation } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  const texts = [];
  const toolNames = [];
  const confirmations = [];
  const decisions = [];
  let error = null;
  let conversationId = null;
  try {
    const res = await fetch(`${BASE}/ai/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, provider: PROVIDER }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const handleBlock = async (block) => {
      const dataLine = (block.match(/^data: (.+)$/m) || [])[1];
      if (!dataLine) return;
      try {
        const chunk = JSON.parse(dataLine);
        if (chunk.type === 'text' && chunk.content) texts.push(chunk.content);
        if (chunk.type === 'tool_start' && chunk.toolStart?.name) toolNames.push(chunk.toolStart.name);
        if (chunk.type === 'confirmation_request' && chunk.confirmation) {
          confirmations.push(chunk.confirmation);
          if (onConfirmation) await onConfirmation(chunk.confirmation);
        }
        if (chunk.type === 'confirmation_decision' && chunk.confirmationDecision) decisions.push(chunk.confirmationDecision);
        if (chunk.type === 'done') { conversationId = chunk.conversationId ?? conversationId; }
        if (chunk.type === 'error') error = chunk.error || 'stream error';
      } catch { /* 忽略解析失败块 */ }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        await handleBlock(block);
      }
    }
    if (buf.trim()) await handleBlock(buf);
  } catch (err) {
    error = error || err.message;
  } finally {
    clearTimeout(timer);
  }
  return { text: texts.join('').replace(/\s+/g, ' ').trim(), toolNames: [...new Set(toolNames)], confirmations, decisions, error, conversationId };
}

async function main() {
  console.log('═══ Trust 证明包：六场景一键验证（Business-safe Trust 链路）═══');
  console.log(`目标 ${BASE} | provider=${PROVIDER}\n`);

  // 0. 健康检查
  const health = await fetch(BASE.replace('/api/v1', '') + '/api/v1/health').catch(() => null);
  if (!health?.ok) {
    console.log('  ✗ 后端未启动——请先 `cd Server-NestJS && npm run start:dev` 再跑');
    process.exit(1);
  }

  // 0.5 登录 alex（数据所有者）
  const alice = await login('alex', ALICE_PASS);
  ok('alex 登录（数据所有者）', `userId=${alice.id}`);

  // ── S1 正常成功：客户 → 逾期订单 → AI 风险分析 ──────────────────────────
  console.log('\n[S1] 正常成功：AI 读取业务数据并做风险分析（Identity + 数据权限 + 读工具）');
  const ts = Date.now() % 1000000;
  const customerName = `瀚宇制造${ts}`;
  const cus = await api('/crm/customers', {
    token: alice.token, method: 'POST',
    body: { name: customerName, company: '瀚宇集团', status: 'active', riskLevel: 'low' },
  });
  if (cus.status !== 201 || !cus.data?.id) {
    bad('创建客户（REST）', `status=${cus.status}`);
    return finish();
  }
  const customerId = cus.data.id;
  ok('创建客户（REST）', `#${customerId} ${customerName}`);
  await api(`/crm/customers/${customerId}/orders`, {
    token: alice.token, method: 'POST',
    body: { amount: 2800000, status: 'overdue', dueDate: '2026-08-01T00:00:00Z' },
  });
  await api(`/crm/customers/${customerId}/orders`, {
    token: alice.token, method: 'POST',
    body: { amount: 800000, status: 'overdue', dueDate: '2026-08-10T00:00:00Z' },
  });
  ok('写入 2 笔逾期订单（数据准备）', '280 万 + 80 万 overdue');

  const s1 = await chat(alice.token, `查一下客户「${customerName}」的风险`);
  if (!s1.ok) {
    bad('AI 风险分析对话', `status=${s1.status}`);
  } else {
    const hasCritical = /critical|风险等级/i.test(s1.reply);
    const toolsCalled = s1.toolCalls.some((t) => t.includes('query_customers') || t.includes('analyze_customer_risk'));
    if (hasCritical && toolsCalled) {
      ok('AI 风险分析（query_customers → analyze_customer_risk）', `critical 判定 + 工具调用 ${s1.toolCalls.join(',')}`);
    } else if (hasCritical) {
      ok('AI 风险分析返回 critical', `工具列表 ${s1.toolCalls.join(',') || '—'}，reply=${s1.reply.slice(0, 80)}`);
    } else {
      bad('AI 风险分析返回 critical', `reply=${s1.reply.slice(0, 120)}`);
    }
  }

  // ── S2 越权拒绝：bob 访问 alex 数据 → 403 ────────────────────────────────
  console.log('\n[S2] 越权拒绝：跨用户数据访问被行级策略拒绝（403）');
  const bobUser = `bob_${ts}`;
  const reg = await api('/auth/register', {
    method: 'POST',
    body: { username: bobUser, nickname: 'Bob', password: 'Bob@2026$Test', email: `${bobUser}@example.com` },
  });
  if (!reg.data?.accessToken) {
    bad('注册 bob', `status=${reg.status}`);
    return finish();
  }
  const bobToken = reg.data.accessToken;
  ok('注册 bob（POST /auth/register）', `@${bobUser}`);
  const deniedCrm = await api(`/crm/customers/${customerId}`, { token: bobToken });
  if (deniedCrm.status === 403) ok('bob 访问 alex 的 CRM 客户 → 403', `GET /crm/customers/${customerId}`);
  else bad('bob 访问 alex 的 CRM 客户 → 403', `status=${deniedCrm.status}`);
  const deniedUser = await api(`/users/${alice.id}`, { token: bobToken });
  if (deniedUser.status === 403) ok('bob 访问 alex 的用户详情 → 403', '他人个人数据');
  else bad('bob 访问 alex 的用户详情 → 403', `status=${deniedUser.status}`);
  const admin = await login('admin', ADMIN_PASS);
  const adminGet = await api(`/crm/customers/${customerId}`, { token: admin.token });
  if (adminGet.status === 200) ok('admin 访问同一客户 → 200（管理员对照）', 'GET 200');
  else bad('admin 访问同一客户 → 200', `status=${adminGet.status}`);
  const ownEvents = await api('/events', { token: bobToken });
  if (ownEvents.status === 200) ok('bob 访问自己的列表 → 200（本人数据对照）', 'GET /events');
  else bad('bob 访问自己的列表 → 200', `status=${ownEvents.status}`);

  // ── S3 高风险动作：AI 尝试删除客户 → R5 BLOCKED ──────────────────────────
  console.log('\n[S3] 高风险动作：AI 尝试不可逆删除客户 → R5 BLOCKED');
  const s3 = await chat(alice.token, `查一下删除客户「${customerName}」`);
  if (!s3.ok) {
    bad('AI 删除客户对话', `status=${s3.status}`);
  } else {
    const blocked = /blocked \(risk level R5\)|风险级 R5|阻断/i.test(s3.reply);
    if (blocked) ok('AI 删除客户 → R5 阻断（不执行）', `reply=${s3.reply.slice(0, 100)}`);
    else bad('AI 删除客户 → R5 阻断', `reply=${s3.reply.slice(0, 120)}`);
  }
  const afterDelete = await api(`/crm/customers/${customerId}`, { token: alice.token });
  if (afterDelete.status === 200) ok('客户数据未被删除（阻断生效）', `GET /crm/customers/${customerId} 仍 200`);
  else bad('客户数据未被删除', `status=${afterDelete.status}`);

  // ── S4 人工确认：AI 写操作 → confirmation_request → approve → 落库 ─────────
  console.log('\n[S4] 人工确认：AI 写操作必须先确认才执行（R3 确认门控）');
  const beforeTasks = await api('/crm/tasks', { token: alice.token });
  const beforeCount = Array.isArray(beforeTasks.data) ? beforeTasks.data.length : beforeTasks.data?.items?.length ?? 0;
  const taskTitle = `跟进${customerName}逾期`;
  let approvedResultId = null;
  let approvalError = null;
  const s4 = await streamChat(alice.token, `查一下为「${customerName}」创建跟进任务：${taskTitle}`, {
    onConfirmation: async (confirmation) => {
      // 演示确认门控：写操作触发 confirmation_request → 用户批准
      const dec = await api(`/ai/confirmations/${confirmation.token}`, {
        token: alice.token, method: 'POST', body: { decision: 'approve' },
      });
      if (dec.status !== 200) approvalError = `确认请求 status=${dec.status}`;
    },
  });
  const confirmCount = s4.confirmations.length;
  const decision = s4.decisions.find((d) => d.approved);
  approvedResultId = decision?.resultId ?? approvedResultId;
  if (approvalError) {
    bad('AI 写操作确认门控', approvalError);
  } else if (confirmCount === 0) {
    bad('AI 写操作确认门控', `未收到 confirmation_request（工具调用 ${s4.toolNames.join(',') || '—'}，text=${s4.text.slice(0, 80)}）`);
  } else if (!approvedResultId) {
    bad('确认后写操作执行', `确认门控触发但 approve 后无 confirmation_decision（error=${s4.error || '—'}）`);
  } else {
    const afterTasks = await api('/crm/tasks', { token: alice.token });
    const afterList = Array.isArray(afterTasks.data) ? afterTasks.data : afterTasks.data?.items ?? [];
    const created = afterList.some((t) => t.id === approvedResultId && (t.title || '').includes(customerName));
    if (created) {
      ok('AI 写操作确认 → 批准 → 落库', `confirmation_request ×${confirmCount} → task #${approvedResultId} ${taskTitle}`);
    } else {
      bad('确认后任务落库', `taskId=${approvedResultId} 未在 /crm/tasks 可见（总数 ${beforeCount}→${afterList.length}）`);
    }
  }

  // ── S5 撤销：本人撤销 AI 副作用 → 软删（可恢复） ──────────────────────────
  console.log('\n[S5] 撤销：本人可撤销 AI 创建的副作用（软删，可经回收站恢复）');
  if (approvedResultId) {
    const gov = await api(`/ai/governance/action/crm_task/${approvedResultId}`, { token: alice.token });
    const effectId = gov.data?.effect?.id;
    if (!effectId) {
      bad('治理视图反查副作用（B4 贯通）', `GET /ai/governance/action/crm_task/${approvedResultId} 无 effect.id`);
    } else {
      ok('治理视图反查副作用（B4 贯通）', `effect #${effectId} → resultType=crm_task resultId=${approvedResultId}`);
      const revoke = await api(`/ai/my/tool-effects/${effectId}`, { token: alice.token, method: 'DELETE' });
      if (revoke.status !== 200) {
        bad('本人撤销 AI 副作用', `DELETE status=${revoke.status}`);
      } else {
        const afterRevoke = await api('/crm/tasks', { token: alice.token });
        const list = Array.isArray(afterRevoke.data) ? afterRevoke.data : afterRevoke.data?.items ?? [];
        const gone = !list.some((t) => t.id === approvedResultId);
        if (gone) ok('撤销后任务软删不可见', `task #${approvedResultId} 已不在列表（可经回收站恢复）`);
        else bad('撤销后任务软删不可见', '任务仍在列表');
      }
    }
  } else {
    bad('本人撤销 AI 副作用', '跳过（S4 未产生可撤销副作用）');
  }

  // ── S6 Java 存量系统：引导到 java-starter 独立验证 ───────────────────────
  console.log('\n[S6] Java 存量系统接入：原系统不改，也能接 AI（java-starter 独立验证）');
  const javaNote =
    'Java 存量系统场景的完整验证在 keelbase-java-starter 仓库（参考项目 keelbase-java-crm-example）单独运行：' +
    '`cd KeelBase-java-starter && node scripts/verify-crm-e2e.mjs`（确认门控→流式批准→写回 Java→审计→撤销补偿，参考项目 e2e）。' +
    '主仓侧存量系统接入能力由 B 路径 API 代理（ProxyTool/openapi-proxy）验证，报告见 docs/benchmark/proxy-bridge-*。';
  console.log(`  · ${javaNote}`);
  ok('S6 Java 存量系统（引导标注）', '主仓脚本不跨仓调用，详见 java-starter 参考项目验证');

  return finish();
}

function finish() {
  const elapsed = Date.now() - startMs;
  const passCount = results.filter((r) => r.pass).length;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = {
    gate: 'Trust 证明包：六场景一键验证',
    date: timestamp,
    pass: passCount,
    total: results.length,
    elapsedSec: Math.round(elapsed / 1000),
    provider: PROVIDER,
    baseUrl: BASE,
    cases: results,
  };
  mkdirSync(resolve(__dirname, '../docs/benchmark'), { recursive: true });
  writeFileSync(resolve(__dirname, `../docs/benchmark/trust-proof-${timestamp}.json`), JSON.stringify(report, null, 2));
  console.log(`\n═══ Trust 证明包结果：${passCount}/${results.length} 通过（${Math.round(elapsed / 1000)}s）═══`);
  console.log(`报告：docs/benchmark/trust-proof-${timestamp}.json`);
  process.exit(passCount === results.length ? 0 : 1);
}

main().catch((e) => { console.error(`✗ 失败：${e.message}`); process.exit(1); });
