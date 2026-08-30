#!/usr/bin/env node
/**
 * V-2「越权拒绝」验证（产品证明 / security-showcase §1 的可复现自动化）：
 * 双账号演示行级权限边界——bob 访问 alex 的数据被 403 拒绝，admin 可访问（对照）。
 * 纯 REST、不依赖 LLM，现场可复现。
 *
 * 断言：
 *   1. bob 访问 alex 的 CRM 客户详情 → 403 无权访问
 *   2. bob 访问 alex 的事件详情 → 403 无权访问
 *   3. bob 访问 alex 的用户详情 → 403（他人个人数据）
 *   4. admin 访问同一 CRM 客户 → 200（管理员越权管理允许，对照）
 *   5. bob 访问自己的数据 → 200（本人数据允许，对照）
 *
 * 用法：
 *   node scripts/verify-permission-denied.mjs
 * 环境变量：BASE_URL（默认 http://localhost:3000/api/v1）· ALICE_PASS / ADMIN_PASS
 * 前置：后端已启动（`npm run start:dev`），alex/admin 账号存在（首启自动 seed）。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const ALICE_PASS = process.env.ALICE_PASS || 'Alex@2026$Demo';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin@2026$KeelBase';
const __dirname = dirname(fileURLToPath(import.meta.url));

const results = [];
const startMs = Date.now();
const ok = (name, detail = '') => { results.push({ name, pass: true, detail }); console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); };
const bad = (name, detail = '') => { results.push({ name, pass: false, detail }); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); };

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: res.status, data: json?.data ?? json };
}

async function login(username, password) {
  const r = await api('/auth/login', { method: 'POST', body: { username, password } });
  if (!r.data?.accessToken) throw new Error(`登录失败 ${username}: ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
  return { token: r.data.accessToken, id: r.data.user?.id ?? r.data.id };
}

async function main() {
  console.log('═══ V-2 越权拒绝：双账号行级权限 403（纯 REST，无 LLM）═══');
  console.log(`目标 ${BASE}\n`);

  // 0. 健康检查
  const health = await fetch(BASE.replace('/api/v1', '') + '/api/v1/health').catch(() => null);
  if (!health?.ok) {
    console.log('  ✗ 后端未启动——请先 `cd Server-NestJS && npm run start:dev` 再跑');
    process.exit(1);
  }

  // 1. alex 登录 + 取本人的 CRM 客户与事件 id
  const alice = await login('alex', ALICE_PASS);
  ok('alex 登录（数据所有者）', `userId=${alice.id}`);
  const customers = await api('/crm/customers', { token: alice.token });
  const events = await api('/events', { token: alice.token });
  const cusList = Array.isArray(customers.data) ? customers.data : customers.data?.items ?? [];
  const evList = Array.isArray(events.data) ? events.data : events.data?.items ?? [];
  const aliceCustomerId = cusList[0]?.id;
  const aliceEventId = evList[0]?.id;
  if (!aliceCustomerId && !aliceEventId) {
    bad('前置：alex 有种子数据', 'CRM 客户与事件都为空（首启应自动 seed）');
    return finish();
  }
  ok('前置：alex 有种子数据', `customer=${aliceCustomerId ?? '—'} event=${aliceEventId ?? '—'}`);

  // 2. 注册 bob（随机用户名避免重复）
  const bobUser = `bob_${Date.now() % 100000}`;
  const reg = await api('/auth/register', {
    method: 'POST',
    body: { username: bobUser, nickname: 'Bob', password: 'Bob@2026$Test', email: `${bobUser}@example.com` },
  });
  const bobToken = reg.data?.accessToken;
  if (!bobToken) {
    bad('注册 bob', `status=${reg.status} ${JSON.stringify(reg.data).slice(0, 120)}`);
    return finish();
  }
  ok('注册 bob（POST /auth/register）', `@${bobUser}`);

  // 3. bob 越权访问 alex 的数据 → 403
  if (aliceCustomerId) {
    const deniedCrm = await api(`/crm/customers/${aliceCustomerId}`, { token: bobToken });
    if (deniedCrm.status === 403) ok('bob 访问 alex 的 CRM 客户 → 403', `GET /crm/customers/${aliceCustomerId}`);
    else bad('bob 访问 alex 的 CRM 客户 → 403', `status=${deniedCrm.status}（应 403）`);
  }
  if (aliceEventId) {
    const deniedEv = await api(`/events/${aliceEventId}`, { token: bobToken });
    if (deniedEv.status === 403) ok('bob 访问 alex 的事件 → 403', `GET /events/${aliceEventId}`);
    else bad('bob 访问 alex 的事件 → 403', `status=${deniedEv.status}（应 403）`);
  }
  // 4. bob 访问 alex 的用户详情 → 403（他人个人数据）
  const deniedUser = await api(`/users/${alice.id}`, { token: bobToken });
  if (deniedUser.status === 403) ok('bob 访问 alex 的用户详情 → 403', `GET /users/${alice.id}`);
  else bad('bob 访问 alex 的用户详情 → 403', `status=${deniedUser.status}（应 403）`);

  // 5. admin 访问同一 CRM 客户 → 200（管理员对照）
  if (aliceCustomerId) {
    const admin = await login('admin', ADMIN_PASS);
    const adminGet = await api(`/crm/customers/${aliceCustomerId}`, { token: admin.token });
    if (adminGet.status === 200) ok('admin 访问同一客户 → 200（管理员允许，对照）', `GET /crm/customers/${aliceCustomerId}`);
    else bad('admin 访问同一客户 → 200', `status=${adminGet.status}`);
  }

  // 6. bob 访问自己的数据 → 200（本人数据允许，对照）
  const ownEvents = await api('/events', { token: bobToken });
  if (ownEvents.status === 200) ok('bob 访问自己的列表 → 200（本人数据，对照）', `GET /events`);
  else bad('bob 访问自己的列表 → 200', `status=${ownEvents.status}`);

  return finish();
}

function finish() {
  const elapsed = Date.now() - startMs;
  const passCount = results.filter((r) => r.pass).length;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { gate: 'V-2 越权拒绝：双账号行级权限 403', date: timestamp, pass: passCount, total: results.length, elapsedSec: Math.round(elapsed / 1000), cases: results };
  mkdirSync(resolve(__dirname, '../docs/benchmark'), { recursive: true });
  writeFileSync(resolve(__dirname, `../docs/benchmark/permission-denied-${timestamp}.json`), JSON.stringify(report, null, 2));
  console.log(`\n═══ V-2 越权拒绝结果：${passCount}/${results.length} 通过（${Math.round(elapsed / 1000)}s）═══`);
  console.log(`报告：docs/benchmark/permission-denied-${timestamp}.json`);
  process.exit(passCount === results.length ? 0 : 1);
}

main().catch((e) => { console.error(`✗ 失败：${e.message}`); process.exit(1); });
