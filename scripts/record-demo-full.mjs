#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * KeelBase 完整 demo 统一视频编排：37 个分镜集成到一个视频。
 *
 * 单 context 连续录制（一个 webm，绕开 playwright 精简 ffmpeg 无 concat demuxer 的限制）：
 *   slide    —— 文字/定位镜（docs/official-video/slides.html?shot=N&lang=zh）
 *   terminal —— 终端动画镜（docs/official-video/terminal.html?type=build|bridge|private）
 *   ui-golden—— 实机 golden path（登录 → AI 问客户 → demo 分析回复）连 demo 后端
 *
 * 前提：demo 后端 3002 在跑（PORT=3002 SERVE_STATIC=1 ... node dist/main.js）+ 系统 Chrome。
 * 输出：系统临时目录 keelbase-demo-full/keelbase-demo-full.webm（统一视频，WebM）。
 * 转 mp4 需完整 ffmpeg（playwright 自带版仅 webm/libvpx）。
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.KB_BASE || 'http://localhost:3002';
const CHROME = process.env.KB_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LANG = process.env.KB_LANG || 'zh'; // zh | en（英文：UI 切 EN + slides/terminal/bridge 英文化）
const REPO = process.cwd();
const VIDEO_DIR = 'docs/official-video';
const SLIDES_URL = `file:///${REPO.replace(/\\/g, '/')}/${VIDEO_DIR}/slides.html${LANG === 'zh' ? '?lang=zh' : ''}`;
const TERMINAL_URL = `file:///${REPO.replace(/\\/g, '/')}/${VIDEO_DIR}/terminal.html`;
const BRIDGE_URL = `file:///${REPO.replace(/\\/g, '/')}/${VIDEO_DIR}/bridge.html${LANG === 'zh' ? '?lang=zh' : ''}`;
const OUT_DIR = join(tmpdir(), 'keelbase-demo-full');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 镜头序列：[type, ...args]；时长 = 中英解说 max + 缓冲（配音驱动节奏，画面与解说对齐）──
const SHOTS = [
  // 品牌 / 定位（slides）
  ['slide', 1, 5000], ['slide', 2, 7500], ['slide', 3, 4500], ['slide', 4, 9000],
  ['slide', 5, 5500], ['slide', 6, 11000], ['slide', 7, 8500], ['slide', 8, 5500],
  // 存量系统桥接（提前：核心差异化前置）+ 桥接流程视觉
  ['terminal', 'bridge', 15000], ['bridge', 15000], ['slide', 33, 7500],
  // 实机 AI CRM：读分析（golden path）
  ['ui-golden', 12500],
  // 实机确认门控：写 R3 确认 → 批准 → 已执行/已确认
  ['ui-confirm', 12000],
  // 实机旗舰应用：PM 延期风险 + Approval AI 预审
  ['ui-pm', 9000], ['ui-approval', 11000],
  // 信任运行时定位
  ['slide', 22, 7500], ['slide', 23, 7500],
  // 企业安全验证 + 系统演示（审计哈希链 / 系统信息 / 监控）
  ['slide', 26, 8000], ['slide', 27, 7000],
  ['ui-system', 8000],
  // 治理巡礼
  ['ui-governance', 10500],
  // 构建：keelbase init + 协议→代码
  ['terminal', 'build', 8500], ['slide', 30, 6000], ['slide', 31, 4000],
  // 私有部署
  ['terminal', 'private', 9500], ['slide', 35, 6500],
  // 收尾
  ['slide', 36, 7500], ['slide', 37, 7500],
];

// ── UI golden path：登录 → 打开 AI 助手 → 问客户风险 → 等 demo 分析回复 ──
// 幂等登录：同一 context 已登录（登录页不出现）则直接跳过。英文版登录后切 EN UI。
async function loginAs(page, user, pass) {
  await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle', timeout: 30000 });
  const submitBtn = page.locator('button[type="submit"]');
  if ((await submitBtn.count()) > 0) {
    await page.locator('input:not([type="password"])').first().fill(user);
    await page.locator('input[autocomplete="current-password"]').fill(pass);
    await submitBtn.first().click();
  }
  await page.waitForSelector('.ai-btn', { timeout: 20000 });
  if (LANG === 'en') {
    const enBtn = page.locator('button:has-text("EN")').first();
    if ((await enBtn.count()) > 0) { await enBtn.click(); await page.waitForTimeout(1000); }
  }
}

async function uiGolden(page) {
  await loginAs(page, 'alex', 'Alex@2026$Demo');
  await page.locator('.ai-btn').click();
  await page.locator('.ai-assistant-drawer textarea').first().fill('哪些客户值得跟进？');
  await page.locator('.ai-assistant-drawer .el-button--primary').first().click();
  await page.locator('.ai-assistant-drawer .assistant-bubble').first().waitFor({ timeout: 25000 });
  await page
    .locator('.ai-assistant-drawer')
    .getByText(/值得|风险|customer|客户/i)
    .first()
    .waitFor({ timeout: 25000 });
}

// ── UI 系统演示：admin（API token 注入）→ AI 审计（防篡改哈希链）→ 系统信息 → 监控中心 ──
async function uiSystem(page) {
  // 先确保同源页面（当前可能是 file://），再 API 拿 admin token 注入 storage → 管理控制台
  await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
  await page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin@2026$KeelBase' }),
    });
    const j = await res.json();
    localStorage.setItem('admin_access_token', j.data.accessToken);
    localStorage.setItem('admin_refresh_token', j.data.refreshToken);
  }, BASE);
  // AI 审计：防篡改哈希链验证（sleep 等待接口渲染，与探测一致）
  await page.goto(`${BASE}/admin/#/audit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  // 系统信息：版本 / 运行环境（脱敏）
  await page.goto(`${BASE}/admin/#/system`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  // 监控中心：服务 / 依赖 / 数据规模
  await page.goto(`${BASE}/admin/#/monitor`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
}

// ── UI PM 旗舰：项目详情 → Copilot → 判断延期风险（demo 返回项目列表 + 引导）──
async function uiPm(page) {
  await loginAs(page, 'alex', 'Alex@2026$Demo');
  await page.goto(`${BASE}/admin/#/workbench/pm/1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.locator('button:has-text("AI 分析"), button:has-text("AI Analyze")').first().click();
  await page.waitForTimeout(3000);
  await page.locator('.el-drawer .el-input__inner, .el-drawer input[type="text"]').first().fill('判断这个项目的延期风险');
  await page.waitForTimeout(500);
  await page.locator('.el-drawer .el-button--primary').first().click();
  await page.waitForTimeout(12000); // 等 demo 响应（项目列表 + 引导）
}

// ── UI Approval 旗舰：审批详情 → AI 预审（按政策分级，自动通过/转人工）──
async function uiApproval(page) {
  await loginAs(page, 'alex', 'Alex@2026$Demo');
  // id=1 已重置为 pending（¥800 ≤ 阈值 → 演示自动通过）
  await page.goto(`${BASE}/admin/#/workbench/approval/1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page
    .locator('button:has-text("AI 预审"), button:has-text("AI review"), button:has-text("AI Review")')
    .first()
    .click();
  await page.waitForTimeout(10000); // 等预审结果（政策分级）
}

// ── UI 治理巡礼：admin 概览（治理总览 / AI 用量 / 操作分布）→ AI 审批 ──
async function uiGovernance(page) {
  await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
  await page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin@2026$KeelBase' }),
    });
    const j = await res.json();
    localStorage.setItem('admin_access_token', j.data.accessToken);
    localStorage.setItem('admin_refresh_token', j.data.refreshToken);
  }, BASE);
  await page.goto(`${BASE}/admin/#/overview`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.goto(`${BASE}/admin/#/ai-approvals`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
}

// ── UI 确认门控：客户详情 → Copilot → AI 创建跟进任务（写 R3）→ 确认卡 → 批准 ──
async function uiConfirm(page) {
  await loginAs(page, 'alex', 'Alex@2026$Demo');
  await page.goto(`${BASE}/admin/#/workbench/crm/1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await page.locator('button:has-text("AI 分析"), button:has-text("AI Analyze")').first().click();
  await page.waitForTimeout(3500);
  await page.locator('.el-drawer .el-input__inner, .el-drawer input[type="text"]').first().fill('创建跟进任务，标题催收逾期款项');
  await page.waitForTimeout(600);
  await page.locator('.el-drawer .el-button--primary').first().click();
  await page.locator('.ai-confirm-card').first().waitFor({ timeout: 40000 });
  await page.waitForTimeout(2500); // 展示确认卡（需人工确认）
  await page
    .locator('.ai-confirm-card button')
    .filter({ hasText: /批准|Approve/ })
    .first()
    .click({ force: true });
  await page.waitForTimeout(9000); // 等待执行 + 已确认
}

// ── 跑单镜（连续录制，镜头间瞬时切换）──
async function runShot(page, shot) {
  const [type, a, b] = shot;
  if (type === 'slide') {
    await page.goto(`${SLIDES_URL}${SLIDES_URL.includes('?') ? '&' : '?'}shot=${a}`, { waitUntil: 'load' });
    await sleep(b);
  } else if (type === 'terminal') {
    await page.goto(`${TERMINAL_URL}?type=${a}&lang=${LANG}`, { waitUntil: 'load' });
    await sleep(b);
  } else if (type === 'bridge') {
    await page.goto(BRIDGE_URL, { waitUntil: 'load' });
    await sleep(b);
  } else if (type === 'ui-golden') {
    await uiGolden(page);
    await sleep(a);
  } else if (type === 'ui-confirm') {
    await uiConfirm(page);
    await sleep(a);
  } else if (type === 'ui-system') {
    await uiSystem(page);
    await sleep(a);
  } else if (type === 'ui-pm') {
    await uiPm(page);
    await sleep(a);
  } else if (type === 'ui-approval') {
    await uiApproval(page);
    await sleep(a);
  } else if (type === 'ui-governance') {
    await uiGovernance(page);
    await sleep(a);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  // 清理旧视频
  for (const f of readdirSync(OUT_DIR).filter((x) => x.endsWith('.webm'))) {
    renameSync(join(OUT_DIR, f), join(OUT_DIR, `_old_${f}`));
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // 每镜时间戳（配音/字幕对齐：相对视频开始的毫秒）
  const t0 = process.hrtime.bigint();
  const timeline = [];
  let idx = 0;
  for (const shot of SHOTS) {
    idx += 1;
    const startMs = Number(process.hrtime.bigint() - t0) / 1e6;
    try {
      await runShot(page, shot);
      console.log(`  [${idx}/${SHOTS.length}] ${shot[0]} ${shot[1] ?? ''} ok`);
    } catch (e) {
      console.log(`  [${idx}/${SHOTS.length}] ${shot[0]} ${shot[1] ?? ''} FAILED: ${e.message}`);
    }
    const endMs = Number(process.hrtime.bigint() - t0) / 1e6;
    timeline.push({
      shot: idx,
      type: shot[0],
      arg: shot[1] ?? '',
      startMs: Math.round(startMs),
      endMs: Math.round(endMs),
    });
  }
  writeFileSync(join(OUT_DIR, 'timeline.json'), JSON.stringify(timeline, null, 2));

  await context.close(); // finalize video
  await browser.close();

  const vids = readdirSync(OUT_DIR).filter((f) => f.endsWith('.webm') && !f.startsWith('_old_'));
  if (!vids.length) {
    console.error('NO video recorded');
    process.exit(1);
  }
  const video = join(OUT_DIR, vids[0]);
  console.log(`\nUNIFIED VIDEO → ${video} (${SHOTS.length} shots, one take)`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
