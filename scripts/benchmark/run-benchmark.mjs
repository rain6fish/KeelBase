#!/usr/bin/env node
/**
 * 3.4 性能压测基准 — 常规 API + AI 并发 + SSE 流式。
 * 用 autocannon（node 压测工具）跑各场景，输出汇总到 stdout + 落 docs/benchmark/。
 *
 * 用法：
 *   BASE_URL=http://localhost:3000/api/v1 \
 *   BENCH_SECONDS=10 BENCH_CONNECTIONS=10 node scripts/benchmark/run-benchmark.mjs
 *
 * 前置：后端已启动（`npm run build && node dist/main`），AI 场景需 .env 配好 AI_PROVIDER/API key。
 */
import autocannon from 'autocannon';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const SECONDS = parseInt(process.env.BENCH_SECONDS || '10', 10);
const CONNECTIONS = parseInt(process.env.BENCH_CONNECTIONS || '10', 10);
const USER = process.env.BENCH_USER || 'alex';
const PASS = process.env.BENCH_PASS || 'Alex@2026$Demo';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!res.ok) throw new Error(`登录失败 ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const token = body?.data?.accessToken;
  if (!token) throw new Error('登录响应无 accessToken');
  return token;
}

async function run(name, { method = 'GET', path, body, auth = true }) {
  const opts = {
    url: `${BASE}${path}`,
    method,
    connections: CONNECTIONS,
    duration: SECONDS,
    headers: { 'Content-Type': 'application/json' },
    ...(auth ? { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } } : {}),
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const result = await autocannon(opts);
  return {
    name,
    requestsPerSec: Math.round(result.requests.average),
    latencyP99Ms: Math.round(result.latency?.p99 ?? 0),
    latencyAvgMs: Math.round(result.latency.average),
    errors: result.errors || 0,
    non2xx: result.non2xx || 0,
  };
}

const token = await login();
console.log(`登录成功 (${USER}) — 压测 ${SECONDS}s × ${CONNECTIONS} 并发 → ${BASE}\n`);

const scenarios = [
  // 注：POST /auth/login（路由级 @Throttle 20/min + bcrypt）与 GET /health（路由级 60/min）受路由级限流，
  //     不作为并发压测场景——前置单次登录已覆盖认证可用性；公开场景用 app/version（全局限流，可放开）。
  { name: 'GET /app/version（公开）', method: 'GET', path: '/app/version', auth: false },
  { name: 'GET /auth/me（认证读）', method: 'GET', path: '/auth/me', auth: true },
  { name: 'GET /events（列表分页）', method: 'GET', path: '/events?page=1&limit=20', auth: true },
  { name: 'POST /ai/chat（AI 对话·非流式）', method: 'POST', path: '/ai/chat', auth: true, body: { message: '你好，简单介绍一下你自己' } },
];

const results = [];
for (const s of scenarios) {
  try {
    const r = await run(s.name, s);
    results.push(r);
    console.log(`  ${r.name.padEnd(28)} req/s=${String(r.requestsPerSec).padEnd(6)} p99=${r.latencyP99Ms}ms avg=${r.latencyAvgMs}ms err=${r.errors} non2xx=${r.non2xx}`);
  } catch (err) {
    console.log(`  ${s.name}: 失败 — ${err.message}`);
    results.push({ name: s.name, error: err.message });
  }
}

// SSE 流式单独（计时 + 首字节）
try {
  const start = Date.now();
  const res = await fetch(`${BASE}/ai/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: '用一句话介绍自己' }),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let firstByteAt = 0;
  let bytes = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      if (!firstByteAt) firstByteAt = Date.now() - start;
      bytes += value.byteLength;
    }
    if (done) break;
  }
  const totalMs = Date.now() - start;
  results.push({ name: 'POST /ai/chat/stream（SSE 首字节/总耗时）', firstByteMs: firstByteAt, totalMs, bytes });
  console.log(`  SSE 流式: 首字节=${firstByteAt}ms 总耗时=${totalMs}ms 响应=${bytes}B`);
} catch (err) {
  console.log(`  SSE 流式: 失败 — ${err.message}`);
}

// 落报告
const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const reportPath = resolve(__dirname, '../../docs/benchmark/benchmark-' + ts + '.md');
mkdirSync(dirname(reportPath), { recursive: true });
const md = [
  `# 性能压测基准（${new Date().toISOString()}）`,
  '',
  `- 目标：\`${BASE}\`（` + (process.env.NODE_ENV || 'development') + '）',
  `- 时长：${SECONDS}s × ${CONNECTIONS} 并发`,
  `- 用户：${USER}`,
  '',
  '## 方法',
  '',
  `- **限流**：后端建议以 \`THROTTLE_LIMIT=100000\` 启动（当前环境：${process.env.THROTTLE_LIMIT || '默认 60/min'}）——放开限流避免 429 干扰吞吐/P95 测量；`,
  `- **AI 场景**：确定性 demo provider（无云 key 时）或真实 LLM（配 key 时，延迟/成本波动）；`,
  '- **SSE 流式**：单次计时（首字节/总耗时/字节），非并发。',
  '',
  '## 场景集',
  '',
  '| 场景 | 说明 |',
  '|------|------|',
  ...scenarios.map((s) => `| ${s.name} | \`${s.method} ${s.path}\` |`),
  '',
  '## 结果',
  '',
  '| 场景 | 结果 |',
  '|------|------|',
  ...results.map((r) => `| ${r.name} | ${JSON.stringify(r)} |`),
  '',
].join('\n');
writeFileSync(reportPath, md);
console.log(`\n报告已写入 ${reportPath}`);
