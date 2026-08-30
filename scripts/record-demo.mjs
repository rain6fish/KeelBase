#!/usr/bin/env node
/**
 * KeelBase demo 自动录制：登录 → 工作台 → AI golden path（问客户风险 → 分析 → 确认）。
 *
 * 前提（P0-3 demo 视频自动录制）：
 *   1. demo 后端在跑：`PORT=3002 SERVE_STATIC=1 DB_PATH=./data/demo-record.sqlite node dist/main.js`
 *      （无 LLM key 时自动 demo provider；alex 账号由 seed:demo 或首启自动创建）
 *   2. 系统 Chrome（playwright-core 用 executablePath 连接系统 Chrome，免装浏览器）
 *   3. 录制完用浏览器/播放器播放 WebM；转 mp4 需完整 ffmpeg（playwright 自带版仅 webm）
 *
 * 用法（env 可配）：
 *   node scripts/record-demo.mjs
 *   KB_BASE=http://localhost:3002 KB_VIDEO_DIR=/tmp/demo-video \
 *     KB_QUESTION="哪些客户值得跟进？" node scripts/record-demo.mjs
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.KB_BASE || 'http://localhost:3002';
const OUT = process.env.KB_VIDEO_DIR || join(tmpdir(), 'keelbase-demo-video');
const QUESTION = process.env.KB_QUESTION || '哪些客户值得跟进？';
const CHROME =
  process.env.KB_CHROME ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({
    recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    // 1. 打开工作台（root 302 → /admin/#/workbench）
    await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('button[type="submit"]', { timeout: 20000 });
    await sleep(1500);

    // 2. 登录 alex
    await page.locator('input:not([type="password"])').first().fill('alex');
    await page.locator('input[autocomplete="current-password"]').fill('Alex@2026$Demo');
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('.ai-btn', { timeout: 20000 });
    await sleep(2500);
    console.log('after login:', page.url());

    // 3. 打开顶栏 AI 抽屉
    await page.locator('.ai-btn').click();
    await sleep(1800);

    // 4. 输入问题并发送
    await page.locator('.ai-assistant-drawer textarea').first().fill(QUESTION);
    await sleep(800);
    await page.locator('.ai-assistant-drawer .el-button--primary').first().click();

    // 5. 等待 AI 回复（demo provider：query_customers → analyze_customer_risk → 总结）
    const replyBubble = page.locator('.ai-assistant-drawer .assistant-bubble');
    await replyBubble.first().waitFor({ timeout: 25000 });
    // 断言 golden path 分析内容出现（风险/客户/值得跟进等）
    await page
      .locator('.ai-assistant-drawer')
      .getByText(/值得|风险|customer|客户/i)
      .first()
      .waitFor({ timeout: 25000 });
    console.log('AI reply:', (await replyBubble.first().innerText()).slice(0, 120).replace(/\n/g, ' '));
    await sleep(6000); // 展示停留

    // 6. 收尾（context.close 触发视频 finalize）
    await context.close();
    await browser.close();
    console.log(`RECORDED OK → ${OUT}`);
  } catch (e) {
    console.error('FAILED:', e.message);
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main();
