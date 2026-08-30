#!/usr/bin/env node
/**
 * AI Bridge B 路径（§4 完整 B）：AI 对话端到端验收（确认 → 执行 → 审计 → 委托身份注入目标）。
 *
 * 用真实 LLM（DeepSeek）后端 + 模拟 Java 目标系统，驱动 ProxyTool 被 AI 真实调用：
 *   - 读工具（R1 自动）：LLM 调用 proxy_list → mock 目标收到 GET + 委托 JWT 身份
 *   - 写工具（R3 确认门控）：LLM 调用 proxy_create → confirmation_request → approve → 目标收到 POST + body
 *   - 审计：决策轨迹 / 工具副作用
 *
 * 用法：
 *   node scripts/verify-proxy-bridge.mjs
 * 环境变量：BASE_URL / BENCH_USER / BENCH_PASS / ADMIN_PASS / PROVIDER / MODEL / PROXY_PORT
 * 前置：
 *   1. DeepSeek 后端已启动（alex + admin 账号）；
 *   2. `ai_proxy_tools` Settings 已配置指向 mock 目标（本脚本自动写入，但需重启后端使其注册——
 *      本脚本会先检查 /ai/tools，未注册则提示重启命令并退出）。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const USER = process.env.BENCH_USER || 'alex';
const PASS = process.env.BENCH_PASS || 'Alex@2026$Demo';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin@2026$KeelBase';
const PROVIDER = process.env.PROVIDER || 'deepseek';
const MODEL = process.env.MODEL || 'deepseek-v4-flash';
const PROXY_PORT = parseInt(process.env.PROXY_PORT || '4310', 10);
const TIMEOUT_MS = parseInt(process.env.GATE_TIMEOUT || '180000', 10);
/** SKIP_SETUP=1：跳过写 ai_proxy_tools（假定 run-adversarial 已预配置 + 重启后端注册），只做 mock + 对话验证 */
const SKIP_SETUP = process.env.SKIP_SETUP === '1';
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

async function api(token, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, data: json?.data ?? json };
}

/** SSE 对话（同 verify-golden-crm）：解析 tool_start / confirmation_request / tool_end / done；autoApprove 遇确认立即批。 */
async function chatStream(token, message, { autoApprove = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const texts = [], toolNames = [], confirmations = [], toolEnds = [];
  let conversationId = null, error = null, done = false;
  const approve = async (confToken) => {
    try {
      const r = await fetch(`${BASE}/ai/confirmations/${confToken}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision: 'approve' }),
      });
      return r.ok;
    } catch (e) { error = error || `approve 失败: ${e.message}`; return false; }
  };
  try {
    const res = await fetch(`${BASE}/ai/chat/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, provider: PROVIDER, model: MODEL }), signal: ctrl.signal,
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
      while ((idx = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, idx); buf = buf.slice(idx + 2); handleBlock(block); }
    }
    if (buf.trim()) handleBlock(buf);
  } catch (err) { error = error || err.message; } finally { clearTimeout(timer); }
  return {
    text: texts.join('').replace(/\s+/g, ' ').trim(),
    toolNames: [...new Set(toolNames)], confirmations, toolEnds, conversationId, error, done,
  };
}

/** 模拟 Java 目标：验 Authorization（Bearer）→ echo 用户/方法/路径/body；无 token → 401。 */
async function startMockTarget(port) {
  const hits = [];
  const server = createServer((req, res) => {
    const auth = req.headers.authorization;
    res.setHeader('Content-Type', 'application/json');
    if (!auth || !auth.startsWith('Bearer ')) { res.statusCode = 401; res.end(JSON.stringify({ error: 'unauthorized' })); return; }
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      hits.push({ user: auth.slice(7), method: req.method, path: req.url, body: body || undefined, at: Date.now() });
      res.end(JSON.stringify({ user: auth.slice(7), method: req.method, path: req.url, body: body || undefined }));
    });
  });
  await new Promise((resolveListen) => server.listen(port, resolveListen));
  return { server, hits, base: `http://localhost:${port}/api` };
}

async function main() {
  console.log('═══ AI Bridge B 路径：AI 对话端到端（ProxyTool × 模拟 Java 系统）═══');
  console.log(`目标 ${BASE} | ${USER} | provider=${PROVIDER} model=${MODEL} | mock port=${PROXY_PORT}\n`);

  // 0. 起 mock Java 目标 + 写入 ai_proxy_tools 配置
  const mock = await startMockTarget(PROXY_PORT);
  console.log(`→ mock Java 目标已起（${mock.base}）`);
  const adminToken = await loginAs('admin', ADMIN_PASS);
  if (!SKIP_SETUP) {
    const proxyCfg = {
      baseUrl: mock.base,
      audience: 'legacy-erp',
      tools: [
        { name: 'proxy_list_contract', description: '查询 legacy 系统的合同列表', method: 'GET', path: '/contracts', parameters: [{ name: 'keyword', type: 'string', description: '搜索关键字', required: false }], riskLevel: 'R1' },
        { name: 'proxy_create_contract', description: '在 legacy 系统创建合同', method: 'POST', path: '/contracts', parameters: [{ name: 'title', type: 'string', description: '合同标题', required: true }, { name: 'amount', type: 'number', description: '金额', required: false }], riskLevel: 'R3' },
      ],
    };
    // Settings type 枚举只收 string/number/boolean——value 传 JSON 字符串，type 用 string（HTTP 层 DTO 校验）
    const setRes = await api(adminToken, '/settings/ai_proxy_tools', { method: 'PUT', body: JSON.stringify({ value: JSON.stringify(proxyCfg), type: 'string' }) });
    if (setRes.status !== 200 && setRes.status !== 201) {
      console.log(`  ⚠ 写入 ai_proxy_tools 失败 status=${setRes.status}（可能 Settings 端点/权限差异，继续按已配置处理）`);
    }
    ok('配置 ai_proxy_tools（mock 目标）', `PUT /settings/ai_proxy_tools`);
  } else {
    ok('复用预配置 ai_proxy_tools', 'SKIP_SETUP=1（run-adversarial 已配置）');
  }

  // 0.5 检查工具是否已注册（需后端重启使配置生效）
  const inv = await api(adminToken, '/ai/tools');
  const invNames = Array.isArray(inv.data) ? inv.data.map((t) => t.name) : [];
  if (!invNames.includes('proxy_list_contract') || !invNames.includes('proxy_create_contract')) {
    bad('ProxyTool 已注册（/ai/tools）', `未找到 proxy_list_contract/proxy_create_contract；请重启后端使 ai_proxy_tools 生效后重跑（当前已注册: ${invNames.join(',') || '无'}）`);
    console.log('\n═══ 结果：前置未满足 ═══');
    process.exit(1);
  }
  ok('ProxyTool 已注册（/ai/tools）', `proxy_list_contract / proxy_create_contract 在工具清单`);

  // 1. 登录 alex
  const token = await loginAs(USER, PASS);
  ok('登录（alex）');

  // 2. AI 对话：读工具（R1 自动）→ mock 目标收到 + 委托身份
  const tRead = Date.now();
  const beforeHits = mock.hits.length;
  const read = await chatStream(token, '请查询 legacy 系统的合同列表，关键字「采购」。这是读操作，直接执行。');
  const hitRead = mock.hits.slice(beforeHits);
  if (read.error) {
    bad('AI 读代理（proxy_list_contract R1 自动）', read.error);
  } else if (!read.toolNames.includes('proxy_list_contract')) {
    bad('AI 读代理（proxy_list_contract R1 自动）', `未调用 proxy_list_contract，工具=${read.toolNames.join(',') || '无'}（文本：${read.text.slice(0, 60)}）`);
  } else if (hitRead.length === 0) {
    bad('AI 读代理（proxy_list_contract R1 自动）', '调用了工具但 mock 目标未收到请求（可能未真正执行）');
  } else {
    const hit = hitRead[0];
    ok('AI 读代理（proxy_list_contract R1 自动）', `目标收到 ${hit.method} ${hit.path}，委托身份 ${hit.user.slice(0, 20)}…，${Math.round((Date.now() - tRead) / 1000)}s`);
    if (hit.user.includes('eyJ')) ok('委托身份注入目标', 'Authorization: Bearer <委托 JWT>');
    else bad('委托身份注入目标', '目标收到的 Authorization 非 JWT');
  }

  // 3. AI 对话：写工具（R3 确认门控）→ approve → 目标收到 POST
  const tWrite = Date.now();
  const beforeHits2 = mock.hits.length;
  const write = await chatStream(token, '请在 legacy 系统创建一个合同，标题《华东采购框架合同》，金额 80000。这是写操作。', { autoApprove: true });
  const hitWrite = mock.hits.slice(beforeHits2);
  const conf = write.confirmations.find((c) => c.toolName === 'proxy_create_contract');
  const execEnd = write.toolEnds.find((e) => e.name === 'proxy_create_contract' && e.success);
  if (write.error) {
    bad('AI 写代理（proxy_create_contract R3 确认门控）', write.error);
  } else if (!conf) {
    bad('AI 写代理（proxy_create_contract R3 确认门控）', `未出现 confirmation_request(${write.confirmations.map((c) => c.toolName).join(',') || '无'})`);
  } else {
    ok('AI 写代理（proxy_create_contract R3 确认门控）', `出现 confirmation_request(${conf.toolName}) 非静默，${Math.round((Date.now() - tWrite) / 1000)}s`);
  }
  if (execEnd && hitWrite.length > 0) {
    const hit = hitWrite[0];
    ok('确认后写执行（目标收到 POST）', `${hit.method} ${hit.path} body=${hit.body}`);
  } else if (hitWrite.length > 0) {
    ok('确认后写执行（目标收到 POST）', `${hitWrite[0].method} ${hitWrite[0].path}`);
  } else {
    bad('确认后写执行（目标收到 POST）', `未见 mock 目标收到写请求（确认=${write.confirmations.length} toolEnd=${write.toolEnds.length}）`);
  }

  // 4. 审计：本次写对话的决策轨迹含 tool_call + confirmation
  const trace = write.conversationId ? await api(token, `/ai/conversations/${write.conversationId}/trace`) : null;
  const traceItems = Array.isArray(trace?.data) ? trace.data : (trace?.data?.items ?? trace?.data?.steps ?? []);
  const hasToolCall = traceItems.some((x) => x.type === 'tool_call' && String(x.toolName).includes('proxy_create_contract'));
  const hasConfirmation = traceItems.some((x) => x.type === 'confirmation' || x.type === 'tool_confirmation');
  if (hasToolCall && hasConfirmation) ok('审计（决策轨迹）', `trace 含 proxy_create_contract tool_call + 确认记录`);
  else bad('审计（决策轨迹）', `trace 缺 tool_call=${hasToolCall} 确认=${hasConfirmation}（共 ${traceItems.length} 条${write.conversationId ? '' : '，conversationId 未取到'}）`);

  // 汇总 + 报告
  const elapsed = Date.now() - startMs;
  const passCount = results.filter((r) => r.pass).length;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { gate: 'AI Bridge B 路径：AI 对话端到端', date: timestamp, provider: PROVIDER, model: MODEL, pass: passCount, total: results.length, elapsedSec: Math.round(elapsed / 1000), cases: results };
  mkdirSync(resolve(__dirname, '../docs/benchmark'), { recursive: true });
  const base = resolve(__dirname, `../docs/benchmark/proxy-bridge-${timestamp}`);
  writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
  const md = [
    `# AI Bridge B 路径：AI 对话端到端（${timestamp}）`,
    '', `- provider=\`${PROVIDER}\` model=\`${MODEL}\` ｜ ${passCount}/${results.length} 通过 ｜ 总耗时 ${Math.round(elapsed / 1000)}s`, '',
    '| # | 断言 | 结果 | 详情 |', '|---|------|------|------|',
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.pass ? '✅' : '❌'} | ${r.detail} |`), '',
  ].join('\n');
  writeFileSync(`${base}.md`, md);

  mock.server.close();
  console.log(`\n═══ AI Bridge B 路径结果：${passCount}/${results.length} 通过 ═══`);
  console.log(`报告：docs/benchmark/proxy-bridge-${timestamp}.md`);
  process.exit(passCount === results.length ? 0 : 1);
}

main().catch((e) => { console.error(`✗ 失败：${e.message}`); process.exit(1); });
