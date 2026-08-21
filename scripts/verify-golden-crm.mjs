#!/usr/bin/env node
/**
 * Gate 1：Golden Application = AI CRM 一次跑通验收（development-plan §7.3，2026-08-21）
 *
 * 用真实 LLM（DeepSeek）后端一次跑通 AI CRM 完整业务闭环：
 *   Customer 就绪 → AI 风险分析 → Create Follow-up Task → 确认门控 → 执行 → 审计 → 撤销
 * 8 项断言同时验证 + 时间盒（60s 看懂 / 10m 跑起 / 30m 创造）。
 *
 * 用法：
 *   node scripts/verify-golden-crm.mjs
 * 环境变量：BASE_URL / BENCH_USER / BENCH_PASS / PROVIDER / MODEL / GATE_TIMEOUT
 * 前置：DeepSeek 后端已启动（alex 账号 + seed 数据）。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const USER = process.env.BENCH_USER || 'alex';
const PASS = process.env.BENCH_PASS || '123456';
const PROVIDER = process.env.PROVIDER || 'deepseek';
const MODEL = process.env.MODEL || 'deepseek-v4-flash';
const TIMEOUT_MS = parseInt(process.env.GATE_TIMEOUT || '180000', 10);
const __dirname = dirname(fileURLToPath(import.meta.url));

const results = [];
const startMs = Date.now();
const ok = (name, detail = '') => {
  results.push({ name, pass: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
};
const bad = (name, detail = '') => {
  results.push({ name, pass: false, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};
const since = (t0) => `${Math.round((Date.now() - t0) / 1000)}s`;

async function loginAs(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`登录失败 ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (!body?.data?.accessToken) throw new Error('登录响应无 accessToken');
  return body.data.accessToken;
}

async function login() {
  return loginAs(USER, PASS);
}

async function api(token, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, data: json?.data ?? json };
}

/**
 * SSE 流式对话：解析 tool_start / confirmation_request / tool_end / done。
 * autoApprove 时遇 confirmation_request 立即 approve（fire-and-forget），流继续返回执行结果。
 */
async function chatStream(token, message, { autoApprove = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const texts = [];
  const toolNames = [];
  const confirmations = [];
  const toolEnds = [];
  let conversationId = null;
  let error = null;
  let done = false;
  const approve = async (confToken) => {
    try {
      const r = await fetch(`${BASE}/ai/confirmations/${confToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision: 'approve' }),
      });
      return r.ok;
    } catch (e) {
      error = error || `approve 失败: ${e.message}`;
      return false;
    }
  };
  try {
    const res = await fetch(`${BASE}/ai/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, provider: PROVIDER, model: MODEL }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const handleBlock = (block) => {
      const dataLine = (block.match(/^data: (.+)$/m) || [])[1];
      if (!dataLine) return;
      try {
        const chunk = JSON.parse(dataLine);
        if (chunk.type === 'text' && chunk.content) texts.push(chunk.content);
        if (chunk.type === 'tool_start' && chunk.toolStart?.name) toolNames.push(chunk.toolStart.name);
        if (chunk.type === 'confirmation_request' && chunk.confirmation) {
          confirmations.push(chunk.confirmation);
          if (autoApprove) void approve(chunk.confirmation.token).catch(() => {});
        }
        if (chunk.type === 'tool_end' && chunk.toolEnd) toolEnds.push(chunk.toolEnd);
        if (chunk.type === 'done') { done = true; conversationId = chunk.conversationId ?? null; }
        if (chunk.type === 'error') error = chunk.error || 'stream error';
      } catch { /* 忽略解析失败块 */ }
    };
    while (true) {
      const { done: d, value } = await reader.read();
      if (d) break;
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
        handleBlock(block);
      }
    }
    if (buf.trim()) handleBlock(buf);
  } catch (err) {
    error = error || err.message;
  } finally {
    clearTimeout(timer);
  }
  return {
    text: texts.join('').replace(/\s+/g, ' ').trim(),
    toolNames: [...new Set(toolNames)],
    confirmations,
    toolEnds,
    conversationId,
    error,
    done,
  };
}

async function main() {
  console.log('═══ Gate 1：AI CRM Golden Application 一次跑通 ═══');
  console.log(`目标 ${BASE} | ${USER} | provider=${PROVIDER} model=${MODEL}\n`);

  // 1. 登录
  const t1 = Date.now();
  let token;
  try {
    token = await login();
    ok('登录（alex 工作台）', `${since(t1)}`);
  } catch (e) {
    bad('登录（alex 工作台）', e.message);
    return;
  }

  // 2. Customer seed 就绪
  const t2 = Date.now();
  const customers = await api(token, '/crm/customers');
  const custItems = Array.isArray(customers.data) ? customers.data : (customers.data?.items ?? []);
  if (customers.status === 200 && custItems.length > 0) {
    ok('Customer 数据就绪（seed）', `${custItems.length} 客户，${since(t2)}`);
  } else {
    bad('Customer 数据就绪（seed）', `status=${customers.status} 客户数=${custItems.length}`);
  }

  // 3. AI 风险分析（读工具）
  const t3 = Date.now();
  const analysis = await chatStream(token, '哪些客户本周最值得跟进？请分析客户风险。');
  const analysisTools = analysis.toolNames;
  if (analysis.error) {
    bad('AI 风险分析（读工具）', analysis.error);
  } else if (analysisTools.some((n) => n.includes('analyze_customer_risk') || n.includes('query_customer'))) {
    ok('AI 风险分析（读工具）', `调用 ${analysisTools.join(', ')}，${since(t3)}`);
  } else {
    bad('AI 风险分析（读工具）', `未调风险工具，工具=${analysisTools.join(', ') || '无'}`);
  }

  // 4-5. 写任务：确认门控 + approve 后执行
  const t4 = Date.now();
  const taskName = custItems.length ? custItems[0].name : '华润建材';
  const beforeTasks = await api(token, '/crm/tasks');
  const beforeCount = Array.isArray(beforeTasks.data) ? beforeTasks.data.length : (beforeTasks.data?.items ?? []).length;
  const write = await chatStream(token, `为 ${taskName} 创建跟进任务，提醒跟进逾期订单。这是写操作，请执行。`, { autoApprove: true });
  const afterTasks = await api(token, '/crm/tasks');
  const afterItems = Array.isArray(afterTasks.data) ? afterTasks.data : (afterTasks.data?.items ?? []);
  const afterCount = afterItems.length;
  const writeTool = write.confirmations.find((c) => c.toolName === 'create_followup_task');
  const execEnd = write.toolEnds.find((e) => e.name === 'create_followup_task' && e.success);
  if (write.error) {
    bad('写任务（确认门控）', write.error);
  } else if (!writeTool) {
    bad('写任务（确认门控）', `未出现 create_followup_task 确认请求，确认=${write.confirmations.map((c) => c.toolName).join(',') || '无'}`);
  } else {
    ok('写任务（确认门控）', `出现 confirmation_request(${writeTool.toolName}) 非静默执行，${since(t4)}`);
  }
  if (execEnd) {
    ok('确认后写执行', `approve 后创建成功 resultId=${execEnd.resultId ?? '?'}，${since(t4)}`);
  } else if (afterCount > beforeCount) {
    ok('确认后写执行', `任务数 ${beforeCount}→${afterCount}（经确认后落库），${since(t4)}`);
  } else {
    bad('确认后写执行', `未见新任务，before=${beforeCount} after=${afterCount}；确认=${write.confirmations.length} toolEnd=${write.toolEnds.length}`);
  }

  // 6. 审计：决策轨迹（{conversation, steps}）含 tool_call + confirmation
  const t6 = Date.now();
  const newTask = afterItems[afterCount - 1];
  const trace = write.conversationId ? await api(token, `/ai/conversations/${write.conversationId}/trace`) : null;
  const traceItems = Array.isArray(trace?.data)
    ? trace.data
    : (trace?.data?.items ?? trace?.data?.steps ?? []);
  const hasToolCall = traceItems.some((x) => x.type === 'tool_call' && x.toolName === 'create_followup_task');
  const hasConfirmation = traceItems.some((x) => x.type === 'confirmation' || x.type === 'tool_confirmation');
  if (hasToolCall && hasConfirmation) {
    ok('审计（决策轨迹）', `trace 含 tool_call + 确认记录，${since(t6)}`);
  } else {
    bad('审计（决策轨迹）', `trace 缺 tool_call=${hasToolCall} 确认=${hasConfirmation}，共 ${traceItems.length} 条` + (write.conversationId ? '' : '（conversationId 未取到）'));
  }

  // 7. 撤销：admin 查本人副作用（找本次对话最新 crm_task effect）→ alex 本人删除（软删）
  const t7 = Date.now();
  try {
    const adminToken = await loginAs('admin', process.env.ADMIN_PASS || 'Admin@1234');
    const me = await api(token, '/auth/me');
    const alexId = me.data?.id;
    const fx = await api(adminToken, `/ai/tool-effects?userId=${alexId}`);
    const effectItems = fx.data?.items ?? [];
    // 本次对话刚创建 → 取 id 最大的 create_followup_task 副作用（resultType=crm_task）
    const effect = effectItems
      .filter((e) => e.toolName === 'create_followup_task' && e.resultType === 'crm_task')
      .sort((a, b) => b.id - a.id)[0];
    const targetId = effect?.resultId;
    if (effect?.id && targetId != null) {
      const taskCheck = await api(token, '/crm/tasks');
      const taskItems = Array.isArray(taskCheck.data) ? taskCheck.data : (taskCheck.data?.items ?? []);
      const target = taskItems.find((x) => x.id === targetId);
      if (!target) {
        bad('撤销（软删）', `任务 #${targetId} 已在列表外（可能上轮已撤）`);
      } else {
        const del = await api(token, `/ai/my/tool-effects/${effect.id}`, { method: 'DELETE' });
        const afterRevoke = await api(token, '/crm/tasks');
        const revokeItems = Array.isArray(afterRevoke.data) ? afterRevoke.data : (afterRevoke.data?.items ?? []);
        if (del.status === 200 && !revokeItems.some((x) => x.id === targetId)) {
          ok('撤销（软删）', `effect #${effect.id} 撤销后任务 #${targetId} 不在列表，${since(t7)}`);
        } else {
          bad('撤销（软删）', `del=${del.status} 任务仍存在=${revokeItems.some((x) => x.id === targetId)}`);
        }
      }
    } else {
      bad('撤销（软删）', `未找到本次 create_followup_task 副作用（effect 数=${effectItems.length}）`);
    }
  } catch (e) {
    bad('撤销（软删）', e.message);
  }

  // 8. 时间盒（60s 看懂 / 10m 跑起 / 30m 创造）
  const elapsed = Date.now() - startMs;
  if (elapsed < 30 * 60 * 1000) {
    ok('时间盒', `总耗时 ${Math.round(elapsed / 1000)}s（< 30min）`);
  } else {
    bad('时间盒', `总耗时 ${Math.round(elapsed / 60000)}min（> 30min）`);
  }

  // 报告
  const passCount = results.filter((r) => r.pass).length;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = {
    gate: 'Gate 1 Golden Application = AI CRM',
    date: timestamp,
    provider: PROVIDER,
    model: MODEL,
    pass: passCount,
    total: results.length,
    elapsedSec: Math.round(elapsed / 1000),
    cases: results,
  };
  mkdirSync(resolve(__dirname, '../docs/benchmark'), { recursive: true });
  const base = resolve(__dirname, `../docs/benchmark/golden-crm-${timestamp}`);
  writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
  const md = [
    `# Gate 1：AI CRM Golden Application 一次跑通（${timestamp}）`,
    '',
    `- provider=\`${PROVIDER}\` model=\`${MODEL}\` ｜ ${passCount}/${results.length} 通过 ｜ 总耗时 ${Math.round(elapsed / 1000)}s`,
    '',
    '| # | 断言 | 结果 | 详情 |',
    '|---|------|------|------|',
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.pass ? '✅' : '❌'} | ${r.detail} |`),
    '',
  ].join('\n');
  writeFileSync(`${base}.md`, md);

  console.log(`\n═══ Gate 1 结果：${passCount}/${results.length} 通过 ═══`);
  console.log(`报告：docs/benchmark/golden-crm-${timestamp}.md`);
  process.exit(passCount === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(`✗ 失败：${e.message}`);
  process.exit(1);
});
