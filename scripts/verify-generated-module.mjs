#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 生成模块 AI 治理链验收：`keelbase init` 生成的模块，其自带 AI 写工具能否走完整治理闭环。
 *
 * 一条链验到底（对齐 Trust 叙事）：
 *   AI 对话 → 写工具确认闸（R3）→ 人工批准 → 副作用记录（resultType 指向本模块）→
 *   业务记录落库 → 决策轨迹 → 审计哈希链 → 撤销 → 目标软删
 *
 * 用法：
 *   MODULE=followup_plans node scripts/verify-generated-module.mjs
 *   MODULE=followup_plans WRITE_TOOL=create_followup_plan BASE_URL=http://localhost:3100/api/v1 node scripts/verify-generated-module.mjs
 *
 * 环境变量：
 *   MODULE        必填，生成模块的复数名（如 followup_plans）
 *   WRITE_TOOL    写工具名，缺省按 MODULE 推导 create_<singular>
 *   TITLE_MARKER  用于在列表里认出本次记录，缺省自动生成
 *   BASE_URL / BENCH_USER / BENCH_PASS / BENCH_ADMIN_USER / BENCH_ADMIN_PASS / GATE_TIMEOUT
 *
 * 前置：模块已由 keelbase init 生成、后端已起、LLM 可用（真实 provider 或 PROVIDER=demo）。
 *
 * 注意：验证撤销类逻辑务必用**多字（snake_case）模块名**（如 followup_plans）——单字名会掩盖一类解析缺陷。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const MODULE = process.env.MODULE;
const USER = process.env.BENCH_USER || 'alex';
const PASS = process.env.BENCH_PASS || 'Alex@2026$Demo';
const ADMIN_USER = process.env.BENCH_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.BENCH_ADMIN_PASS || 'Admin@2026$KeelBase';
const TIMEOUT_MS = parseInt(process.env.GATE_TIMEOUT || '180000', 10);
const __dirname = dirname(fileURLToPath(import.meta.url));

if (!MODULE) {
  console.error('用法：MODULE=<复数模块名> node scripts/verify-generated-module.mjs');
  process.exit(1);
}
const SINGULAR = MODULE.endsWith('s') ? MODULE.slice(0, -1) : MODULE;
const WRITE_TOOL = process.env.WRITE_TOOL || `create_${SINGULAR}`;
const MARKER = process.env.TITLE_MARKER || `AI-verify-${new Date().toISOString().slice(11, 19)}`;

const results = [];
const startMs = Date.now();
const ok = (name, detail = '') => { results.push({ name, pass: true, detail }); console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); };
const bad = (name, detail = '') => { results.push({ name, pass: false, detail }); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); };

async function loginAs(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`登录失败 ${res.status}：${await res.text()}`);
  const body = await res.json();
  if (!body?.data?.accessToken) throw new Error('登录响应无 accessToken');
  return body.data.accessToken;
}

/** 跑一轮 SSE 对话；遇到确认请求即批准。返回收集到的关键帧。 */
async function runChatWithApproval(H, message) {
  const collected = { confirmation: null, approveStatus: null, conversationId: null, toolStarts: [] };
  const res = await fetch(`${BASE}/ai/chat/stream`, {
    method: 'POST', headers: H, body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`SSE 建连失败 ${res.status}`);

  let buf = '';
  let approved = false;
  if (!res.body) throw new Error('SSE 响应无 body');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    // 每次 read 绑超时：服务端保持 SSE 打开却不发数据时，裸 read() 会永久挂起，
    // deadline 永远检查不到 → 脚本（及 CI job）hang 而非超时。
    const remaining = deadline - Date.now();
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise((resolve) => setTimeout(() => resolve({ done: true }), remaining)),
    ]);
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const dataLine = (raw.match(/^data:\s*(.*)$/m) ?? [])[1];
      if (!dataLine) continue;
      let ev;
      try { ev = JSON.parse(dataLine); } catch { continue; }
      if (ev.conversationId) collected.conversationId = ev.conversationId;
      if (ev.type === 'tool_start') collected.toolStarts.push(ev.name ?? ev.toolName);
      if (ev.type === 'confirmation_request') {
        collected.confirmation = ev.confirmation ?? ev;
        if (!approved && collected.confirmation?.token) {
          approved = true;
          const cr = await fetch(`${BASE}/ai/confirmations/${collected.confirmation.token}`, {
            method: 'POST', headers: H, body: JSON.stringify({ decision: 'approve' }),
          });
          collected.approveStatus = cr.status;
        }
      }
    }
  }
  return collected;
}

async function main() {
  const token = await loginAs(USER, PASS);
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const adminToken = await loginAs(ADMIN_USER, ADMIN_PASS);
  const AH = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

  console.log(`\n═══ 生成模块 AI 治理链验收：${MODULE}（写工具 ${WRITE_TOOL}）═══\n`);

  console.log('① 确认闸');
  const message = `用 ${WRITE_TOOL} 工具创建一条记录，标题是「${MARKER}」。`;
  const run = await runChatWithApproval(H, message);
  const c = run.confirmation;
  if (!c) {
    bad('产生 confirmation_request', '未收到——模块的写工具可能未注册，或 LLM 未选择该工具');
  } else {
    ok('产生 confirmation_request', `tool=${c.toolName}`);
    c.toolName === WRITE_TOOL ? ok('确认来自本模块写工具', c.toolName) : bad('确认来自本模块写工具', `实得 ${c.toolName}`);
    const risk = c.authorization?.riskLevel;
    risk === 'R3' ? ok('风险级 R3', risk) : bad('风险级 R3', `实得 ${risk}`);
    const checks = c.authorization?.checks ?? [];
    checks.length > 0 && checks.every((x) => x.ok)
      ? ok('Explainable Authz 检查全通过', `${checks.length} 项`)
      : bad('Explainable Authz 检查全通过', `${checks.length} 项，有未通过`);
    run.approveStatus === 200 ? ok('approve 2xx', `http ${run.approveStatus}`) : bad('approve 2xx', `http ${run.approveStatus}`);
  }

  console.log('\n② 副作用 + 落库 + 轨迹');
  const effects = (await (await fetch(`${BASE}/ai/my/tool-effects`, { headers: H })).json()).data?.items ?? [];
  const eff = (Array.isArray(effects) ? effects : []).find((e) => String(e.resultType ?? '') === SINGULAR);
  eff
    ? ok('副作用 resultType 指向本模块', `resultType=${eff.resultType} resultId=${eff.resultId}`)
    : bad('副作用 resultType 指向本模块', `未找到 resultType=${SINGULAR}（现有：${(Array.isArray(effects) ? effects : []).map((e) => e.resultType).join(',') || '无'}）`);

  const records = (await (await fetch(`${BASE}/${MODULE}`, { headers: H })).json()).data ?? [];
  const created = (Array.isArray(records) ? records : []).find((r) => String(r.title ?? '').includes(MARKER));
  created ? ok('业务记录落库', `id=${created.id}`) : bad('业务记录落库', `列表未找到标记 ${MARKER}`);

  if (run.conversationId) {
    const steps = (await (await fetch(`${BASE}/ai/conversations/${run.conversationId}/trace`, { headers: H })).json()).data?.steps ?? [];
    const s = JSON.stringify(steps);
    steps.length > 0 && s.includes('confirm') && s.includes(SINGULAR)
      ? ok('决策轨迹含确认 + 目标', `steps=${steps.length}`)
      : bad('决策轨迹含确认 + 目标', `steps=${steps.length} 确认=${s.includes('confirm')} 目标=${s.includes(SINGULAR)}`);
  } else {
    bad('捕获 conversationId', '未捕获');
  }

  console.log('\n③ 审计哈希链');
  const aiChain = (await (await fetch(`${BASE}/audit/verify`, { headers: AH })).json()).data;
  aiChain?.valid === true ? ok('AI 审计链 valid', `checked=${aiChain.checked}`) : bad('AI 审计链 valid', JSON.stringify(aiChain));
  const opChain = (await (await fetch(`${BASE}/audit/operations/verify`, { headers: AH })).json()).data;
  opChain?.valid === true ? ok('操作审计链 valid', `checked=${opChain.checked}`) : bad('操作审计链 valid', JSON.stringify(opChain));

  console.log('\n④ 撤销');
  if (eff) {
    const rv = await fetch(`${BASE}/ai/my/tool-effects/${eff.id}`, { method: 'DELETE', headers: H });
    const rvBody = (await rv.json().catch(() => ({}))).data ?? {};
    rvBody.revoked === true
      ? ok('撤销 revoked=true', `revokeStatus=${rvBody.revokeStatus}`)
      : bad('撤销 revoked=true', JSON.stringify(rvBody));
    const after = (await (await fetch(`${BASE}/${MODULE}`, { headers: H })).json()).data ?? [];
    // created 未定位时不能算通过：`find(r => r.id === undefined)` 永不命中 → 旧写法会空过报 ✅（假证据）。
    const stillVisible =
      created?.id != null && (Array.isArray(after) ? after : []).some((r) => r.id === created.id);
    if (created?.id == null) {
      bad('撤销后记录从本人列表消失（软删生效）', '未定位到本次记录，无法验证');
    } else if (!stillVisible) {
      ok('撤销后记录从本人列表消失（软删生效）');
    } else {
      bad('撤销后记录从本人列表消失（软删生效）', '仍可见');
    }
  } else {
    bad('可撤销', '无副作用记录，跳过');
  }

  const passCount = results.filter((r) => r.pass).length;
  const elapsed = Date.now() - startMs;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { module: MODULE, writeTool: WRITE_TOOL, baseUrl: BASE, pass: passCount, total: results.length, elapsedSec: Math.round(elapsed / 1000), cases: results };
  mkdirSync(resolve(__dirname, '../docs/benchmark'), { recursive: true });
  const base = resolve(__dirname, `../docs/benchmark/generated-module-${timestamp}`);
  writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
  const md = [
    `# 生成模块 AI 治理链验收（${timestamp}）`,
    '',
    `- module=\`${MODULE}\` writeTool=\`${WRITE_TOOL}\` ｜ ${passCount}/${results.length} 通过 ｜ 总耗时 ${Math.round(elapsed / 1000)}s`,
    '',
    '| # | 断言 | 结果 | 详情 |',
    '|---|------|------|------|',
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.pass ? '✅' : '❌'} | ${r.detail} |`),
    '',
  ].join('\n');
  writeFileSync(`${base}.md`, md);

  console.log(`\n═══ 结果：${passCount}/${results.length} 通过 ═══`);
  console.log(`报告：docs/benchmark/generated-module-${timestamp}.md`);
  process.exit(passCount === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(`✗ 失败：${e.message}`);
  process.exit(1);
});
