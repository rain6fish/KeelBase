#!/usr/bin/env node
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
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.KB_BASE || 'http://localhost:3002';
const CHROME = process.env.KB_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REPO = process.cwd();
const SLIDES_URL = `file:///${REPO.replace(/\\/g, '/')}/docs/official-video/slides.html`;
const TERMINAL_URL = `file:///${REPO.replace(/\\/g, '/')}/docs/official-video/terminal.html`;
const OUT_DIR = join(tmpdir(), 'keelbase-demo-full');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 镜头序列：[type, ...args] ──
const SHOTS = [
  // 品牌 / 定位（slides）
  ['slide', 1, 3500], ['slide', 2, 4500], ['slide', 3, 3500], ['slide', 4, 4500],
  ['slide', 5, 3500], ['slide', 6, 5000], ['slide', 7, 3500], ['slide', 8, 4500],
  // 实机 golden path（登录 + AI 问客户 + 分析）
  ['ui-golden', 9000],
  // 实机确认门控：AI 创建跟进任务（写 R3）→ 确认卡 → 批准 → 已执行/已确认
  ['ui-confirm', 9000],
  // 信任运行时定位
  ['slide', 22, 5500], ['slide', 23, 4500],
  // 企业安全验证
  ['slide', 26, 4500], ['slide', 27, 4500],
  // 构建：keelbase init（terminal）+ 协议→代码（slides）
  ['terminal', 'build', 12000], ['slide', 30, 4500], ['slide', 31, 3500],
  // 存量系统：AI Bridge（terminal）+ 定位（slides）
  ['terminal', 'bridge', 14000], ['slide', 33, 4500],
  // 私有部署（terminal + slides）
  ['terminal', 'private', 12000], ['slide', 35, 4500],
  // 收尾
  ['slide', 36, 3500], ['slide', 37, 5500],
];

// ── UI golden path：登录 → 打开 AI 助手 → 问客户风险 → 等 demo 分析回复 ──
// 幂等登录：同一 context 已登录（登录页不出现）则直接跳过。
async function loginAs(page, user, pass) {
  await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle', timeout: 30000 });
  const submitBtn = page.locator('button[type="submit"]');
  if ((await submitBtn.count()) > 0) {
    await page.locator('input:not([type="password"])').first().fill(user);
    await page.locator('input[autocomplete="current-password"]').fill(pass);
    await submitBtn.first().click();
  }
  await page.waitForSelector('.ai-btn', { timeout: 20000 });
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
    await page.goto(`${SLIDES_URL}?shot=${a}&lang=zh`, { waitUntil: 'load' });
    await sleep(b);
  } else if (type === 'terminal') {
    await page.goto(`${TERMINAL_URL}?type=${a}`, { waitUntil: 'load' });
    await sleep(b);
  } else if (type === 'ui-golden') {
    await uiGolden(page);
    await sleep(a);
  } else if (type === 'ui-confirm') {
    await uiConfirm(page);
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

  let idx = 0;
  for (const shot of SHOTS) {
    idx += 1;
    try {
      await runShot(page, shot);
      console.log(`  [${idx}/${SHOTS.length}] ${shot[0]} ${shot[1] ?? ''} ok`);
    } catch (e) {
      console.log(`  [${idx}/${SHOTS.length}] ${shot[0]} ${shot[1] ?? ''} FAILED: ${e.message}`);
    }
  }

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
