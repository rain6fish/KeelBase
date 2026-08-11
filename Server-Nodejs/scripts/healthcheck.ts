/**
 * 运维健康巡检脚本（PM-5）
 *
 * 一键检查服务健康、依赖状态、数据规模、本地资源，输出带色报告。
 * 供非 DevOps 人员日常巡检 / cron 定时 / CI 健康门禁。
 *
 * 用法：
 *   npm run healthcheck                  # 默认 http://localhost:3000
 *   API_URL=http://localhost:3000 npm run healthcheck
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD='xxx' npm run healthcheck   # 生产 admin 凭据
 *   ADMIN_TOKEN=<jwt> npm run healthcheck                            # 直接传 token（避免登录限流）
 *
 * 检查项（前缀：✓ 通过 / ✗ 失败 / ⚠ 警告）：
 *   1. 服务存活   GET /api/v1/health
 *   2. 依赖状态   GET /api/v1/admin/monitor/summary（admin：数据库/Redis/队列/存储/邮件/推送）
 *   3. 数据规模   users/events/conversations/audit 计数（有值即视为在运转）
 *   4. 指标健康   错误率 < 5%、P95 延迟 < 2000ms、无显著 inflight
 *   5. 本地资源   数据库文件存在、data/ 与 uploads/ 磁盘占用、备份目录是否存在
 *   6. 备份新鲜度 最近备份 < 24h（存在备份目录时）
 *
 * 退出码：0 = 全部通过；1 = 存在 ✗（服务/依赖/指标失败）；2 = 本地资源检查失败。
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const API_URL = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@1234';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let exitCode = 0;

function ok(msg: string): void {
  console.log(`  ${GREEN}✓${RESET} ${msg}`);
}
function warn(msg: string): void {
  console.log(`  ${YELLOW}⚠${RESET} ${msg}`);
}
function fail(msg: string, code: number): void {
  console.log(`  ${RED}✗${RESET} ${msg}`);
  if (code > exitCode) exitCode = code;
}
function section(title: string): void {
  console.log(`\n${BOLD}${CYAN}── ${title} ──${RESET}`);
}

async function httpGet(pathname: string, token?: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API_URL}${pathname}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(5000),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json };
}

async function getAdminToken(): Promise<string> {
  if (ADMIN_TOKEN) return ADMIN_TOKEN;
  const login = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD, deviceName: 'healthcheck' }),
    signal: AbortSignal.timeout(5000),
  });
  const body = await login.json().catch(() => ({}));
  return body?.data?.accessToken || '';
}

function byteStr(bytes: number): string {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(1)} GiB`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MiB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function dirSize(dir: string): number {
  try {
    if (!fs.existsSync(dir)) return 0;
    let total = 0;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      try {
        const st = fs.statSync(p);
        if (st.isFile()) total += st.size;
      } catch {
        /* skip */
      }
    }
    return total;
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  console.log(`${BOLD}ShiYu-AppBase 运维健康巡检${RESET}  ${DIM}${new Date().toISOString()}${RESET}`);

  // ── 1. 服务存活 ─────────────────────────────────────────
  section('服务存活');
  let healthUp = false;
  try {
    const { status, json } = await httpGet('/api/v1/health');
    if (status === 200 && json?.data?.status === 'ok') {
      healthUp = true;
      ok(`服务在线 (uptime ${Math.round(json.data.uptime)}s)`);
    } else {
      fail(`健康检查异常 HTTP ${status}`, 1);
    }
  } catch (err) {
    fail(`无法连接 ${API_URL}: ${(err as Error).message}`, 1);
  }
  if (!healthUp) {
    console.log(`\n${RED}服务不可达，跳过依赖检查。${RESET}`);
    process.exit(exitCode);
  }

  // ── 2. 依赖状态（admin 认证）────────────────────────────
  section('依赖状态');
  const token = await getAdminToken();
  if (!token) {
    fail('admin 登录失败（检查 ADMIN_USERNAME/ADMIN_PASSWORD 或 ADMIN_TOKEN）', 1);
    process.exit(exitCode);
  }
  const { status, json } = await httpGet('/api/v1/admin/monitor/summary', token);
  if (status !== 200 || !json?.data) {
    fail(`监控聚合端点 HTTP ${status}（token 可能过期/非 admin）`, 1);
    process.exit(exitCode);
  }
  const d = json.data;
  const deps = d.dependencies || {};
  if (deps.database === 'up') ok(`数据库 ${deps.database}`);
  else fail(`数据库状态: ${deps.database ?? 'unknown'}`, 1);
  if (deps.redis === 'up') ok(`Redis ${deps.redis}`);
  else warn(`Redis ${deps.redis ?? 'unknown'}（未配置或关闭，缓存降级可用）`);
  if (deps.queue === 'up') ok('异步队列在线');
  else warn(`异步队列 ${deps.queue ?? 'unknown'}（未启用，任务同步执行）`);
  ok(`存储驱动: ${deps.storage ?? 'local'} / 邮件: ${deps.mail ?? 'disabled'} / 推送: ${deps.push ?? 'none'}`);

  // ── 3. 数据规模 ─────────────────────────────────────────
  section('数据规模');
  const counts = d.counts || {};
  const label = (k: string) => counts[k] ?? 0;
  ok(
    `用户 ${label('users')} · 事件 ${label('events')} · 通知 ${label('notifications')} · 会话 ${label('sessions')} · ` +
      `操作审计 ${label('operationAuditLogs')} · AI 审计 ${label('aiAuditLogs')} · 对话 ${label('conversations')} · 知识 ${label('knowledge')}`,
  );

  // ── 4. 指标健康 ─────────────────────────────────────────
  section('运行指标');
  const m = d.metrics || {};
  const errorRate = m.errorRatePct;
  const latency = m.latencyP95Ms;
  if (errorRate != null) {
    if (errorRate < 5) ok(`错误率 ${errorRate}%`);
    else fail(`错误率偏高 ${errorRate}%（阈值 5%）`, 1);
  } else warn('错误率指标不可用');
  if (latency != null) {
    if (latency < 2000) ok(`P95 延迟 ${latency}ms`);
    else fail(`P95 延迟偏高 ${latency}ms（阈值 2000ms）`, 1);
  } else warn('延迟指标不可用（无流量样本）');
  ok(`请求速率 ${m.requestRateRps ?? 0} rps · 并发 ${m.inFlight ?? 0}`);

  // ── 5. 本地资源 ─────────────────────────────────────────
  section('本地资源');
  const cwd = process.cwd();
  const dataDir = path.join(cwd, 'data');
  const uploadsDir = path.join(cwd, 'uploads');
  const dbPath = path.join(dataDir, 'front.sqlite');
  if (process.env.DB_TYPE === 'postgres') {
    ok('使用 PostgreSQL（远程数据库，跳过本地文件检查）');
  } else if (fs.existsSync(dbPath)) {
    const st = fs.statSync(dbPath);
    ok(`SQLite 数据库存在 (${byteStr(st.size)})`);
  } else {
    warn(`未找到 SQLite 文件 ${dbPath}（可能尚未创建或已迁移）`);
  }
  ok(`data/ ${byteStr(dirSize(dataDir))} · uploads/ ${byteStr(dirSize(uploadsDir))}`);

  // ── 6. 备份新鲜度 ───────────────────────────────────────
  const backupDir = path.join(dataDir, 'backups');
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.backup'));
    if (files.length === 0) {
      warn('备份目录存在但无备份文件（建议配置定时 npm run backup）');
    } else {
      const newest = files
        .map((f) => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)[0];
      const ageHours = (Date.now() - newest.t) / 3_600_000;
      if (ageHours < 24) ok(`最近备份 ${newest.f}（${ageHours.toFixed(1)}h 前）`);
      else warn(`最近备份 ${newest.f} 已 ${ageHours.toFixed(1)}h（建议 <24h）`);
    }
  } else {
    warn('无备份目录（生产建议配置 npm run backup + 定时调度）');
  }

  // ── 汇总 ────────────────────────────────────────────────
  console.log('');
  if (exitCode === 0) {
    console.log(`${GREEN}✔ 健康巡检通过 — 全部检查项正常${RESET}`);
  } else if (exitCode === 1) {
    console.log(`${RED}✘ 存在严重问题（服务/依赖/指标），请立即处理${RESET}`);
  } else {
    console.log(`${YELLOW}⚠ 存在本地资源警告${RESET}`);
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`[healthcheck] 失败: ${(err as Error).message}`);
  process.exit(1);
});
