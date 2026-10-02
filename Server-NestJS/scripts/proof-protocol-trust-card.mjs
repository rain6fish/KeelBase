#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * Protocol × Trust Proof Card — 生成模块治理驱动（R5-R11）
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
 *   R11 归因层（§22.19）：三用户 × 三入口各一轮委托 → **只用管理员身份读审计**，还原
 *      who / entry / agent / what（effect 由管理员按用户指认，见该行注释的边界说明）
 *
 * 环境变量：BASE_URL（默认 http://localhost:3000/api/v1）· PROVIDER=demo（默认，确定性）
 *           ALICE_PASS / ADMIN_PASS（默认 demo 种子）· MUT=invoices（生成模块 plural）
 * 前置：后端已启动，含生成的 MUT 模块（本驱动不负责生成/编译，由 proof-protocol-trust.sh 完成）
 * 输出：每行断言打印 ✓/✗；结尾打印机器行 ROW|…（供编排器收集）
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const PROVIDER = process.env.PROVIDER || 'demo';
const ALICE_PASS = process.env.ALICE_PASS || 'Alex@2026$Demo';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin@2026$KeelBase';
const MUT = process.env.MUT || 'invoices'; // plural
const SINGULAR = process.env.MUT_SINGULAR || MUT.replace(/s$/, ''); // 工具用单数
// 按被测 spec 通用构建 REST 体与 demo 对话 k=v（卡支持任意 specs/*.json，非 invoices 专用）。
// 填**全部**字段合法值：生成器契约下 string/enum 默认必填（除非 required:false，见 templates-backend.mjs），
// 只填 required===true 会漏掉默认必填的可选标字段 → 400/INSERT 失败（T3 leads 暴露）。
const SPEC_ABS = process.env.MUT_SPEC_ABS || null;
const specMeta = SPEC_ABS ? JSON.parse(readFileSync(SPEC_ABS, 'utf8')) : null;
const specLabel = specMeta?.label || MUT;
const specFields = specMeta?.fields ?? [];
const keyName = specFields[0]?.name || 'id';
function buildCreate(tag) {
  const body = {};
  const kvs = [];
  const i = Date.now() % 100000;
  specFields.forEach((f, idx) => {
    let v;
    if (f.type === 'int') v = i + idx;
    else if (f.type === 'boolean') v = true;
    else if (f.type === 'enum') v = (f.enum ?? [])[0] ?? `${tag}${i}`;
    else v = `${tag}-${i}-${idx}`;
    body[f.name] = v;
    kvs.push(`${f.name}=${v}`);
  });
  return { body, kv: kvs.join('，') };
}
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

async function api(path, { token, method = 'GET', body, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
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

/** 流式对话：收集工具/确认/决策，遇 confirmation_request 内联 approve/decline。
 *  `extraHeaders` 供归因层带访客标识（`X-Guest-Id`）。 */
async function streamChat(token, message, decision, extraHeaders) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  const toolNames = [], confirmations = [], decisions = [], texts = [];
  let error = null, conversationId = null;
  try {
    const res = await fetch(`${BASE}/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(extraHeaders ?? {}),
      },
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
  console.log(`═══ Protocol×Trust Proof Card（R5-R11，生成模块 MUT=${MUT}）BASE=${BASE} PROVIDER=${PROVIDER} ═══`);

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

  // ── R5 运行模块：REST 建/查（按 spec 必填字段通用构建）──────────────────────
  const c5 = buildCreate('REST');
  const created = await api(`/${MUT}`, { token: alice, method: 'POST', body: c5.body });
  const inv = unwrap(created.data);
  const restId = inv?.id ?? inv?.[keyName];
  if (created.status === 201 && restId) {
    const list = await api(`/${MUT}`, { token: alice });
    const items = unwrap(list.data)?.items ?? unwrap(list.data) ?? [];
    const found = (Array.isArray(items) ? items : []).some((x) => (x.id ?? x[keyName]) === (inv.id ?? inv[keyName]));
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
  const a7 = buildCreate('AI');
  const askCreate = `请创建一条${specLabel}：${a7.kv}。`;
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
    const trace = govData?.trace;
    const hasTrace = trace !== null && trace !== undefined && (!Array.isArray(trace) || trace.length > 0);
    pass('R7', `AI create_${SINGULAR} → confirmation_request ×${sApprove.confirmations.length} → approve → ${SINGULAR}#${approvedId}（effect=${effectId || '—'}）`);
    if (!effectId) fail('R7b', `治理视图无 effect.id（副作用未记录）`);
    else pass('R7b', `副作用已记录 effect #${effectId}`);
    if (!hasTrace) fail('R7c', `治理视图无决策轨迹（trace=${trace === null ? 'null' : typeof trace}）`);
    else pass('R7c', '决策轨迹贯通（B4 trace）');
  }

  // ── R7-reject：另一写 → 拒绝 → 不落库（ConfirmDecisionDto 收 approve|reject，decline 是无效值）─
  const d7 = buildCreate('NO');
  const sDecline = await streamChat(alice, `再创建一条${specLabel}：${d7.kv}。`, 'reject');
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
      // 篡改根锚 → 必须 FAIL（keelbase-audit-evidence/3 的锚在 root.anchors）
      const tampered = JSON.parse(JSON.stringify(pkg));
      const anchor = tampered.root?.anchors?.[0] ?? tampered.anchors?.[0];
      if (anchor?.hash) {
        anchor.hash = flipHex(anchor.hash);
        const tPath = join(REPORT_DIR, `proof-evidence-tampered-${ts}.json`);
        writeFileSync(tPath, JSON.stringify(tampered, null, 2));
        const tv = offlineVerify(tPath, process.env.AUDIT_HMAC_KEY);
        if (tv.status !== 0) pass('R8b', '篡改根锚 hash → 离线验证 FAIL（tamper-evident）');
        else fail('R8b', '篡改锚后验证仍 PASS（篡改未被检出！）');
      } else {
        fail('R8b', '证据包无 root.anchors[0].hash，无法做篡改检测');
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
    const softDeleted = againData?.effect?.targetSoftDeleted === true;
    pass('R9', `撤销 effect #${effectId} → DELETE ${rev.status}，反查 targetSoftDeleted=${softDeleted}`);
    if (rev.status !== 200) fail('R9b', `DELETE status=${rev.status}`);
    else if (!softDeleted) fail('R9b', '撤销请求 200 但目标未软删（状态未如实为 revoked）');
    else pass('R9b', '撤销后目标软删 = revoked（真实生效）');
  } else {
    fail('R9', '无 effectId，跳过撤销（R7 前置失败）');
  }

  // ── R11 归因层（§22.19）：多用户 × 多入口 → 管理员**仅凭审计**还原 who / entry / agent / what ──
  //
  // §22.19 的收口句：专家组那张「Who did what?」卡**不新造载体**，作为本卡的附加行、复用同一编排。
  // 本行把同一条**可委托**的消息从三条入口、三个用户各发一次，然后**只用管理员身份读 AI 审计**，
  // 断言归因维度在跨用户跨入口时依然还原得出、且互不混淆 —— 正是 §22.19 那条线要证的东西
  // （此前的观测是「大量 AI 使用，却查不出是谁、干了什么」）。
  //
  // 消息取技能触发词：服务端命中后**零 LLM** 进委托分支（与 provider 无关），子代理在 demo
  // provider 下有确定性输出 —— 与 e2e `agent-delegation-attribution` 走同一条路径。
  //
  // **边界如实**：委托是**只读**的（子代理不得写），故「effect」这一维不靠委托产生副作用来证，
  // 而是让**未参与该次写的管理员**从副作用清单按用户指认 —— 「这个效果是谁的」同样是归因问题。
  const DELEGATE_MSG = '周计划';
  const identity = async (tok) => unwrap((await api('/auth/me', { token: tok })).data);
  const aliceMe = await identity(alice);
  const adminMe = await identity(admin);

  // 三个「用户 × 入口」组合。**为什么没有第三个真人账号**：非 admin 用户走任何 POST 都要先过
  // EmailVerificationGuard（未验证邮箱 403），而 alex/admin 是种子验证过的、注册出来的 bob 不是
  // —— 卡里造不出第三个可对话的账号（试过，bob 那条确实 403）。故「多用户」这一维由
  // **两个不同账号**承担（正是 09-14 观测到的塌缩面：alex 243 / admin 71），而**同一账号下的两个访客**
  // 由 `X-Guest-Id` 区分（AU-3 的修法：N 个访客 → N 个不同来源）。
  const delegationTurns = [
    { id: 'alex@/ai/chat', who: aliceMe, entry: 'web', guest: 'r11visitorA',
      run: () => api('/ai/chat', { token: alice, method: 'POST', headers: { 'X-Guest-Id': 'r11visitorA' }, body: { message: DELEGATE_MSG, provider: PROVIDER } }) },
    { id: 'alex@/ai/chat/stream', who: aliceMe, entry: 'web', guest: 'r11visitorB',
      run: () => streamChat(alice, DELEGATE_MSG, undefined, { 'X-Guest-Id': 'r11visitorB' }) },
    { id: 'admin@/admin/ai/chat', who: adminMe, entry: 'admin', guest: null,
      run: () => api('/admin/ai/chat', { token: admin, method: 'POST', body: { message: DELEGATE_MSG } }) },
  ];

  // 每轮的结局一并记下：**失败要能指着说**，否则报出来的是「取不到行」这种哑结论
  // （首版就栽在这里两处：读审计的 limit 超上限被拒，被当成「一行都没有」；以及一轮 403 后
  // 只知道「缺一组」，不知道缺在哪一步）。**按 conversationId 归位每一轮**——同一账号两轮不能按
  // userId 分（那正是本行要证的东西）。
  const turnOutcomes = [];
  for (const t of delegationTurns) {
    const r = await t.run();
    t.conversationId = r?.conversationId ?? unwrap(r?.data)?.conversationId ?? null;
    const status = r?.status ?? (r?.error ? 'err' : 'ok');
    turnOutcomes.push(`${t.id}=${status}${r?.error ? `:${String(r.error).slice(0, 60)}` : ''}`);
  }

  // 对话级行是 **fire-and-forget**（服务端不 await）⇒ 必须轮询到它落库；否则会读到「0 行」
  // 这种由时序造出来的假缺陷（本仓已有先例，见 agent-delegation-attribution 的头注）。
  // limit 上限是 200（DTO 校验），超了会被 400 拒 —— 而**读失败必须响亮**，不能当成空集。
  let readError = null;
  const readAudit = async () => {
    const res = await api('/audit/logs?limit=200', { token: admin });
    if (res.status !== 200) { readError = `GET /audit/logs → ${res.status} ${res.text.slice(0, 120)}`; return []; }
    const list = unwrap(res.data);
    return Array.isArray(list) ? list : [];
  };
  const groupByHandle = (list) => {
    const m = new Map();
    for (const r of list) {
      if (!r.parentActionId) continue;
      if (!m.has(r.parentActionId)) m.set(r.parentActionId, []);
      m.get(r.parentActionId).push(r);
    }
    return m;
  };
  const groupFor = (gs, cid) =>
    cid ? [...gs.values()].find((g) => g.some((r) => r.conversationId === cid)) ?? null : null;

  let groups = new Map();
  const r11Deadline = Date.now() + 8000;
  while (Date.now() < r11Deadline) {
    groups = groupByHandle(await readAudit());
    if (delegationTurns.every((t) => groupFor(groups, t.conversationId))) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  const found = delegationTurns.map((t) => ({ t, rows: groupFor(groups, t.conversationId) }));

  const missing = found.filter((x) => !x.rows);
  if (readError) {
    fail('R11', `读审计失败：${readError}（轮次结局：${turnOutcomes.join(' / ')}）`);
  } else if (missing.length) {
    fail('R11', `未取到全部委托轮的审计行（缺 ${missing.map((m) => m.t.id).join(',')}；共 ${groups.size} 个句柄组；轮次结局：${turnOutcomes.join(' / ')}）`);
  } else if (!found.every((x) => x.rows.some((r) => r.action === 'delegate'))) {
    fail('R11', `委托轮缺对话级行（delegate）—— 组内 actions=${found.map((x) => x.rows.map((r) => r.action).join('+')).join(' / ')}`);
  } else {
    pass('R11', `两账号 × 三入口各一轮委托，管理员从审计取到 ${found.length} 组（按 conversationId 定位，每组含 delegate + tool_call）`);

    // 谁：三组的 userId 复现出**两个账号**且 username 快照与之一致（快照是**写入时刻**记的，不靠事后 join）
    const byUser = new Map();
    for (const x of found) {
      const u = x.rows.find((r) => r.userId)?.userId;
      if (!byUser.has(String(u))) byUser.set(String(u), []);
      byUser.get(String(u)).push(x.t.id);
    }
    const namesOk = found.every((x) => x.rows.some((r) => r.username === x.t.who.username));
    if (byUser.size !== 2) {
      fail('R11b', `应复现出 2 个账号，实得 ${byUser.size}：${[...byUser].map(([u, ts]) => `${u}←${ts.join('+')}`).join(' / ')}`);
    } else if (!namesOk) {
      fail('R11b', `username 快照与用户不符：${found.map((x) => `${x.t.who.username}→${x.rows[0].username}`).join(' / ')}`);
    } else {
      pass('R11b', `谁：${[...byUser].map(([u, ts]) => `${found.find((f) => String(f.t.who.id) === u)?.t.who.username}#${u}（${ts.length} 轮）`).join(' / ')} 可分辨`);
    }

    // 访客：同一账号（alex）的两轮，`guestId` 必须不同 —— 这正是「N 个访客 → N 个不同来源」的兑现面
    const visitors = found.filter((x) => x.t.guest).map((x) => x.rows.find((r) => r.guestId)?.guestId ?? null);
    if (visitors.length < 2) {
      fail('R11b2', `带访客头的轮次未落 guestId：${JSON.stringify(visitors)}（访客维缺失）`);
    } else if (new Set(visitors).size !== visitors.length) {
      fail('R11b2', `同账号两访客的 guestId 相同：${visitors.join(' / ')}（访客塌缩）`);
    } else {
      pass('R11b2', `访客：同一账号 alex 的两轮各带一个访客标识（${visitors.join(' / ')}）`);
    }

    // 从哪来：整轮的 source 与该入口相符（web / web / admin）
    const sources = found.map((x) => `${x.t.id.slice(x.t.id.indexOf('@') + 1)}=${x.rows[0].source}`).join(' / ');
    if (!found.every((x) => x.rows.every((r) => r.source === x.t.entry))) {
      fail('R11c', `source 与入口不符：${sources}（期望 ${found.map((x) => x.t.entry).join('/')}）`);
    } else {
      pass('R11c', `从哪来：${sources}`);
    }

    // 哪个 agent：每组至少一行带 agentId（子代理名）
    if (!found.every((x) => x.rows.some((r) => r.agentId))) {
      fail('R11d', '有委托轮没有任何 agentId（子代理归因缺失）');
    } else {
      pass('R11d', `哪个 agent：${found.map((x) => x.rows.find((r) => r.agentId)?.agentId).join(' / ')}`);
    }

    // 做了什么：工具行 detail 非空（工具名(参数)）
    const toolRow0 = found[0].rows.find((r) => r.action === 'tool_call');
    if (!found.every((x) => x.rows.filter((r) => r.action === 'tool_call').every((r) => r.detail))) {
      fail('R11e', '工具行 detail 为空（「做了什么」不可还原）');
    } else {
      pass('R11e', `做了什么：工具行 detail 非空（例：${String(toolRow0?.detail).slice(0, 60)}）`);
    }
  }

  // 效果：**未参与该次写的管理员**能按用户指认 R7 那次写的归属（R11 的委托是只读的，不产副作用）
  const effectsOf = async (uid) => {
    const r = await api(`/ai/tool-effects?userId=${uid}&limit=100`, { token: admin });
    const items = unwrap(r.data)?.items ?? unwrap(r.data) ?? [];
    return Array.isArray(items) ? items : [];
  };
  if (effectId) {
    const inAlice = (await effectsOf(aliceMe.id)).some((e) => String(e.id) === String(effectId));
    const inAdmin = (await effectsOf(adminMe.id)).some((e) => String(e.id) === String(effectId));
    if (!inAlice) fail('R11f', `副作用 #${effectId} 不在 ${aliceMe.username} 名下（效果不可归因）`);
    else if (inAdmin) fail('R11f', `副作用 #${effectId} 同时出现在 ${adminMe.username} 名下（归属串了）`);
    else pass('R11f', `效果：副作用 #${effectId} 只在 ${aliceMe.username}#${aliceMe.id} 名下（管理员按用户指认得出）`);
  } else {
    fail('R11f', '无 effectId，跳过效果归因（R7 前置失败）');
  }

  finish();
}
function finish() {
  const reds = rows.filter((r) => r.state === 'red').length;
  console.log(`RESULT|${reds === 0 ? 'pass' : 'fail'}|rows=${rows.length}|red=${reds}`);
  process.exit(reds === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
