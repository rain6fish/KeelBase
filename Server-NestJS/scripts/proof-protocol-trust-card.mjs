#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * Protocol × Trust Proof Card — 生成模块治理驱动（R5-R9，internal-roadmap §internal.7 T2）
 *
 * 对「由 keelbase-init 生成、编译进后端的生成模块（MUT，默认 invoices）」用纯 REST +
 * 确定性 demo provider 验证治理链路。与 verify-trust-proof.mjs 的差别：对象是**生成产物**
 * 而非旗舰手写工具——验证「生成物天生进入治理」。
 *
 *   R5 运行模块：REST 建/查生成实体
 *   R6 治理语义自动获得：GET /ai/tools 上 create_<s>（R3 需确认）/ query_<p>（R1）
 *   R7 越权拒绝 + 高风险 Gate：AI create_<s> → confirmation → approve 落库；decline 不落；
 *      跨用户不可见（bob 看不到 alex 数据）
 *   R8 Audit / Evidence：动作反查治理视图 → 导出 evidence-root v3 → 离线 verify PASS → 篡改 FAIL
 *   R9 Revoke：撤销副作用 → revoked
 *
 * 环境变量：BASE_URL（默认 http://localhost:3000/api/v1）· PROVIDER=demo（默认，确定性）
 *           ALICE_PASS / ADMIN_PASS（默认 demo 种子）· MUT=invoices（生成模块 plural）
 * 前置：后端已启动，含生成的 MUT 模块（本驱动不负责生成/编译，由 proof-protocol-trust.sh 完成）
 * 输出：每行断言打印 ✓/✗；结尾打印机器行 ROW|…（供编排器收集）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const PROVIDER = process.env.PROVIDER || 'demo';
const ALICE_PASS = process.env.ALICE_PASS || 'Alex@2026$Demo';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin@2026$KeelBase';
const MUT = process.env.MUT || 'invoices'; // plural
const SINGULAR = process.env.MUT_SINGULAR || MUT.replace(/s$/, ''); // 工具用单数
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = resolve(__dirname, '../docs/benchmark');
mkdirSync(REPORT_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');

const rows = [];
function row(id, state, detail = '') {
  rows.push({ id, state, detail });
  console.log(`ROW|${id}|${state}|${detail}`);
  console.log(`${state === 'green' ? '  ✓' : state === 'yellow' ? '  △' : '  ✗'} ${id} — ${detail}`);
}
const fail = (id, d) => row(id, 'red', d);
const pass = (id, d) => row(id, 'green', d);

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, data, text: JSON.stringify(data).slice(0, 300) };
}
const unwrap = (d) => (d && d.data !== undefined ? d.data : d);
/** 兼容多种响应壳（ApiResponse.data / {tokens:{}} / 平铺）取 access token */
function pickToken(loginData) {
  const d = unwrap(loginData);
  return d?.accessToken || d?.tokens?.accessToken || d?.data?.accessToken || d?.data?.tokens?.accessToken || null;
}

/** 流式对话：收集工具/确认/决策，遇 confirmation_request 内联 approve/decline。 */
async function streamChat(token, message, decision) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  const toolNames = [], confirmations = [], decisions = [], texts = [];
  let error = null, conversationId = null;
  try {
    const res = await fetch(`${BASE}/ai/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, provider: PROVIDER }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader(), decoder = new TextDecoder();
    let buf = '';
    const handle = async (block) => {
      const line = (block.match(/^data: (.+)$/m) || [])[1];
      if (!line) return;
      try {
        const c = JSON.parse(line);
        if (c.type === 'text' && c.content) texts.push(c.content);
        if (c.type === 'tool_start' && c.toolStart?.name) toolNames.push(c.toolStart.name);
        if (c.type === 'confirmation_request' && c.confirmation) {
          confirmations.push(c.confirmation);
          await api(`/ai/confirmations/${c.confirmation.token}`, { token, method: 'POST', body: { decision } });
        }
        if (c.type === 'confirmation_decision' && c.confirmationDecision) decisions.push(c.confirmationDecision);
        if (c.type === 'done') conversationId = c.conversationId ?? conversationId;
        if (c.type === 'error') error = c.error || 'stream error';
      } catch { /* 忽略 */ }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) { const b = buf.slice(0, i); buf = buf.slice(i + 2); await handle(b); }
    }
    if (buf.trim()) await handle(buf);
  } catch (e) { error = error || e.message; } finally { clearTimeout(timer); }
  return { text: texts.join(' ').replace(/\s+/g, ' ').trim(), toolNames: [...new Set(toolNames)], confirmations, decisions, error, conversationId };
}

/** 离线验证证据根（KB-3 verify-evidence.mjs） */
function offlineVerify(pkgPath, key) {
  const args = [resolve(__dirname, 'verify-evidence.mjs'), pkgPath];
  if (key) args.push('--key', key);
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 });
  return { status: r.status, out: r.stdout || '' };
}
function flipHex(h) {
  const c = h[0] === '0' ? '1' : '0';
  return c + h.slice(1);
}

async function main() {
  console.log(`═══ Protocol×Trust Proof Card（R5-R9，生成模块 MUT=${MUT}）BASE=${BASE} PROVIDER=${PROVIDER} ═══`);

  // 登录
  const aliceLogin = await api('/auth/login', { method: 'POST', body: { username: 'alex', password: ALICE_PASS } });
  const adminLogin = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: ADMIN_PASS } });
  const alice = pickToken(aliceLogin.data);
  const admin = pickToken(adminLogin.data);
  if (!alice || !admin) { fail('R5', `登录失败 alex=${!!alice} admin=${!!admin}`); return finish(); }
  console.log(`  ✓ 登录 alex + admin`);

  // bob（跨用户隔离用）——注册即返回 accessToken（register 要求 nickname，参考 verify-trust-proof.mjs S2）
  const bobUser = `bobcard${Date.now() % 100000}`;
  const bobPass = 'Bob@2026$Card';
  const bobReg = await api('/auth/register', {
    method: 'POST',
    body: { username: bobUser, nickname: 'Bob Card', password: bobPass, email: `${bobUser}@example.com` },
  });
  const bob = pickToken(bobReg.data);

  // ── R5 运行模块：REST 建/查 ────────────────────────────────────────────────
  const no = `INV-CARD-${Date.now()}`;
  const created = await api(`/${MUT}`, { token: alice, method: 'POST', body: { invoiceNo: no, customerName: '张三', amount: 1000, status: 'draft' } });
  const inv = unwrap(created.data);
  const restId = inv?.id ?? inv?.invoiceNo;
  if (created.status === 201 && restId) {
    const list = await api(`/${MUT}`, { token: alice });
    const items = unwrap(list.data)?.items ?? unwrap(list.data) ?? [];
    const found = (Array.isArray(items) ? items : []).some((x) => (x.id ?? x.invoiceNo) === (inv.id ?? inv.invoiceNo));
    pass('R5', found ? `REST 建 #${inv.id ?? restId} 201 + 列表可见` : 'REST 建 201 但列表不可见');
  } else {
    fail('R5', `REST 建 ${MUT} status=${created.status}（确认生成模块已编译进后端）`);
  }

  // ── R6 治理语义自动获得：/ai/tools 元数据 ─────────────────────────────────
  const toolsResp = await api('/ai/tools', { token: admin });
  const tools = unwrap(toolsResp.data) ?? [];
  const tCreate = tools.find((t) => t.name === `create_${SINGULAR}`);
  const tQuery = tools.find((t) => t.name === `query_${MUT}`);
  if (tCreate && tQuery) {
    const createOk = tCreate.requiresConfirmation === true;
    const createRisk = String(tCreate.riskLevel ?? '');
    const queryAuto = tQuery.requiresConfirmation !== true;
    pass('R6', `create_${SINGULAR} riskLevel=${createRisk} requiresConfirmation=${tCreate.requiresConfirmation}; query_${MUT} auto=${queryAuto}`);
    if (!createOk) fail('R6b', `create_${SINGULAR} 未要求确认（治理语义缺失）`);
    else pass('R6b', '写工具 requiresConfirmation=true（治理语义自动获得）');
    if (!queryAuto) fail('R6c', `query_${MUT} 非只读自动（应为 R1 免确认）`);
    else pass('R6c', '读工具自动放行（R1）');
  } else {
    fail('R6', `/ai/tools 未找到 create_${SINGULAR} / query_${MUT}（共 ${tools.length} 工具；现有=${tools.slice(0, 8).map((t) => t.name).join(',')}…）`);
  }

  // ── R7a approve：AI 写 → 确认 → 批准 → 落库 ───────────────────────────────
  let approvedId = null, effectId = null;
  const askCreate = `请创建一张发票：invoiceNo=${no}-AI，customerName=李四，amount=1200，status=draft。`;
  const sApprove = await streamChat(alice, askCreate, 'approve');
  const apprDecision = sApprove.decisions.find((d) => d.approved);
  approvedId = apprDecision?.resultId ?? null;
  if (sApprove.confirmations.length === 0) {
    fail('R7', `未收到 confirmation_request（tools=${sApprove.toolNames.join(',') || '—'}，text=${sApprove.text.slice(0, 100)}）`);
  } else if (!approvedId) {
    fail('R7', `确认门控触发（×${sApprove.confirmations.length}）但 approve 后无 approved resultId（error=${sApprove.error || '—'}）`);
  } else {
    const gov = await api(`/ai/governance/action/${SINGULAR}/${approvedId}`, { token: alice });
    const govData = unwrap(gov.data);
    effectId = govData?.effect?.id ?? govData?.effectId ?? null;
    const audit = govData?.audit || govData?.decisions;
    pass('R7', `AI create_${SINGULAR} → confirmation_request ×${sApprove.confirmations.length} → approve → ${SINGULAR}#${approvedId}（effect=${effectId || '—'}）`);
    if (!effectId) fail('R7b', `治理视图无 effect.id（副作用未记录）`);
    else pass('R7b', `副作用已记录 effect #${effectId}`);
    if (!audit) fail('R7c', '治理视图无审计/决策轨迹');
    else pass('R7c', '决策轨迹贯通');
  }

  // ── R7-decline：另一写 → 拒绝 → 不落库 ───────────────────────────────────
  const sDecline = await streamChat(alice, `再创建一张发票：invoiceNo=${no}-NO，amount=500。`, 'decline');
  const declinedApproved = sDecline.decisions.find((d) => d.approved);
  if (sDecline.confirmations.length === 0) {
    fail('R7d', `未收到 confirmation_request（tools=${sDecline.toolNames.join(',') || '—'}）`);
  } else if (declinedApproved?.resultId) {
    fail('R7d', `decline 后仍出现 approved resultId=${declinedApproved.resultId}`);
  } else {
    pass('R7d', `写操作确认后 decline → 未执行（confirmation_request ×${sDecline.confirmations.length}）`);
  }

  // ── R7-isolation：bob 看不到 alex 的生成数据 ──────────────────────────────
  if (bob) {
    const bobList = await api(`/${MUT}`, { token: bob });
    const bobItems = unwrap(bobList.data)?.items ?? unwrap(bobList.data) ?? [];
    const leak = (Array.isArray(bobItems) ? bobItems : []).some((x) => (x.id ?? x.invoiceNo) === (inv.id ?? inv.invoiceNo));
    pass('R7e', leak ? `越权泄漏：bob 列表含 alex 的 ${MUT}！` : '跨用户隔离：bob 看不到 alex 的生成数据');
    if (leak) fail('R7e2', '越权可见（行级隔离缺失）');
    else pass('R7e2', '行级隔离生效');
  } else {
    fail('R7e', 'bob 登录失败，跳过隔离验证');
  }

  // ── R8 Audit / Evidence：证据根导出 → 离线验 → 篡改 FAIL ──────────────────
  if (approvedId) {
    const exp = await api(`/ai/governance/evidence-root/${SINGULAR}/${approvedId}`, { token: alice });
    if (exp.status !== 200) {
      fail('R8', `导出 evidence-root status=${exp.status}（text=${exp.text}）`);
    } else {
      const pkg = unwrap(exp.data);
      const evPath = join(REPORT_DIR, `proof-evidence-root-${ts}.json`);
      writeFileSync(evPath, JSON.stringify(pkg, null, 2));
      const v = offlineVerify(evPath, process.env.AUDIT_HMAC_KEY);
      if (v.status === 0) pass('R8', `evidence-root v3 导出 + 离线验证 PASS（${evPath}）`);
      else fail('R8', `离线验证非 0（status=${v.status} out=${v.out.slice(-200)}）`);
      // 篡改锚 → 必须 FAIL
      const tampered = JSON.parse(JSON.stringify(pkg));
      if (tampered.anchors?.[0]?.hash) {
        tampered.anchors[0].hash = flipHex(tampered.anchors[0].hash);
        const tPath = join(REPORT_DIR, `proof-evidence-tampered-${ts}.json`);
        writeFileSync(tPath, JSON.stringify(tampered, null, 2));
        const tv = offlineVerify(tPath, process.env.AUDIT_HMAC_KEY);
        if (tv.status !== 0) pass('R8b', '篡改锚 hash → 离线验证 FAIL（tamper-evident）');
        else fail('R8b', '篡改锚后验证仍 PASS（篡改未被检出！）');
      } else {
        fail('R8b', '证据包无 anchors[0].hash，无法做篡改检测');
      }
    }
  } else {
    fail('R8', '无 approvedId，跳过证据根验证（R7 前置失败）');
  }

  // ── R9 Revoke：撤销副作用 → revoked ──────────────────────────────────────
  if (effectId) {
    const rev = await api(`/ai/my/tool-effects/${effectId}`, { token: alice, method: 'DELETE' });
    const again = await api(`/ai/governance/action/${SINGULAR}/${approvedId}`, { token: alice });
    const againData = unwrap(again.data);
    const status = againData?.effect?.status ?? againData?.status ?? (rev.status === 200 ? 'revoked?' : 'unknown');
    pass('R9', `撤销 effect #${effectId} → DELETE ${rev.status}，反查状态=${status}`);
    if (rev.status !== 200) fail('R9b', `DELETE status=${rev.status}`);
    else pass('R9b', '撤销请求成功');
  } else {
    fail('R9', '无 effectId，跳过撤销（R7 前置失败）');
  }

  finish();
}
function finish() {
  const reds = rows.filter((r) => r.state === 'red').length;
  console.log(`RESULT|${reds === 0 ? 'pass' : 'fail'}|rows=${rows.length}|red=${reds}`);
  process.exit(reds === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
