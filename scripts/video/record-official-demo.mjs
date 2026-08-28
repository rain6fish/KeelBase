#!/usr/bin/env node
/**
 * KeelBase 官方 Demo 视频（4 分钟分镜）自动录制
 *
 * 用 Playwright 驱动本机 Chrome，在 OBS 捕获的窗口里按分镜脚本交替播放
 * HTML 镜头页与真实系统操作，并通过 OBS WebSocket 开始/停止录制。
 */
import { chromium } from 'playwright-core';
import OBSWebSocket from 'obs-websocket-js';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SLIDES_URL = process.env.SLIDES_URL || 'http://localhost:3001';
const OBS_WS_URL = process.env.OBS_WS_URL || 'ws://localhost:4455';
const DEMO_USER = process.env.DEMO_USER || 'alex';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '123456';
const RISK_QUESTION = process.env.RISK_QUESTION || '哪些客户本周最值得跟进？';
const CREATE_QUESTION =
  process.env.CREATE_QUESTION ||
  '请为瀚宇制造创建一个跟进任务，标题为：推进瀚宇制造分期方案签约，备注：AI 自动演示';
const OVERREACH_QUESTION =
  process.env.OVERREACH_QUESTION || '查看其他销售负责的客户订单';
const LOG_DIR = resolve(process.env.SHOT_LOG_DIR || 'artifacts/official-demo');
const SHOT_LOG = join(LOG_DIR, 'shot-log.json');
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function chromePath() {
  const found = CHROME_CANDIDATES.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error('未找到 Chrome/Edge，请设置 CHROME_PATH');
  return found;
}

function readObsPassword() {
  if (process.env.OBS_WS_PASSWORD) return process.env.OBS_WS_PASSWORD;
  try {
    const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
    const configPath = join(
      base,
      'obs-studio',
      'plugin_config',
      'obs-websocket',
      'config.json',
    );
    if (!existsSync(configPath)) return '';
    return JSON.parse(readFileSync(configPath, 'utf8')).server_password || '';
  } catch {
    return '';
  }
}

class ObsClient {
  constructor(url, password) {
    this.client = new OBSWebSocket();
    this.url = url;
    this.password = password;
  }

  async connect() {
    await this.client.connect(this.url, this.password);
  }

  call(requestType, requestData = {}) {
    return this.client.call(requestType, requestData);
  }

  close() {
    try {
      this.client.disconnect();
    } catch {
      // ignore
    }
  }
}

async function waitForFrame(page, regex, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const frame = page.frames().find((f) => regex.test(f.url()));
    if (frame) return frame;
    await sleep(250);
  }
  throw new Error(`等待 iframe 超时: ${regex}`);
}

async function setStage(page, url) {
  await page.locator('#stage').evaluate((el, src) => {
    el.src = src;
  }, url);
}

async function showSlide(page, shot, durationMs, boundaries, t0) {
  await setStage(page, `${SLIDES_URL}/slides.html?shot=${shot}`);
  await waitForFrame(page, new RegExp(`slides\\.html\\?shot=${shot}`));
  boundaries.push({ shot, at: Date.now() - t0 });
  await sleep(durationMs);
}

async function loginAs(frame, username, password) {
  await frame.locator('input[autocomplete="username"]').waitFor({ timeout: 25000 });
  await sleep(1200);
  await frame.locator('input[autocomplete="username"]').fill(username);
  await sleep(500);
  await frame.locator('input[autocomplete="current-password"]').fill(password);
  await sleep(500);
  await frame
    .getByRole('button', { name: /登\s*录|Log\s*in/i })
    .first()
    .click();
  await frame.waitForURL(/#\/workbench/, { timeout: 25000 });
  await sleep(1800);
}

async function openCrmDetail(frame) {
  await frame.locator('.el-table__row').first().waitFor({ timeout: 25000 });
  const row = frame.locator('.el-table__row', { hasText: '瀚宇制造' }).first();
  await row.waitFor({ timeout: 10000 });
  await row.getByRole('button').first().click();
  await frame.waitForURL(/\/workbench\/crm\/\d+/, { timeout: 25000 });
  await sleep(1800);
  const match = frame.url().match(/\/workbench\/crm\/(\d+)/);
  return match ? match[1] : '1';
}

async function openAiDrawer(frame) {
  await frame
    .getByRole('button', { name: /AI\s*分\s*析|AI\s*Analyze/i })
    .first()
    .click();
  await frame.locator('.el-drawer input').last().waitFor({ timeout: 12000 });
  await sleep(1200);
}

async function askInDrawer(frame, text) {
  const input = frame.locator('.el-drawer input').last();
  await input.fill(text);
  await sleep(900);
  await input.press('Enter');
}

async function waitToolCards(frame) {
  await frame
    .locator('.copilot-chat .el-tag', { hasText: /读|Read|写|Write/i })
    .first()
    .waitFor({ timeout: 120000 });
}

async function waitRiskConclusion(frame) {
  await frame
    .locator('.copilot-bubble.copilot-ai', { hasText: /风险|Risk|关注|attention/i })
    .last()
    .waitFor({ timeout: 120000 });
}

async function waitConfirmCard(frame) {
  await frame.locator('.ai-confirm-card').waitFor({ timeout: 120000 });
}

async function approveConfirm(frame) {
  await frame
    .locator('.ai-confirm-card')
    .getByRole('button', { name: /批\s*准|Approve/i })
    .first()
    .click();
}

async function waitGovernance(frame) {
  await frame
    .locator('.el-drawer__title', { hasText: /治理详情|Governance Detail/i })
    .waitFor({ timeout: 30000 });
}

async function selectAiTraceConversation(frame, text) {
  await frame.locator('.el-select').first().click();
  const option = frame
    .locator('.el-select-dropdown__item', { hasText: text })
    .first();
  await option.waitFor({ timeout: 12000 });
  await option.click();
  await frame.locator('.el-timeline').waitFor({ timeout: 20000 });
}

async function revokeFirstEffect(frame) {
  const revoke = frame.getByRole('button', { name: /撤\s*销|Revoke/i }).first();
  await revoke.waitFor({ timeout: 15000 });
  await sleep(2000);
  await revoke.click();
  await frame
    .locator('.el-message', { hasText: /已撤销|Revoked/i })
    .waitFor({ timeout: 15000 });
}

async function ensureObsCapture(obs, browserTitle) {
  const scenes = await obs.call('GetSceneList');
  const current = await obs.call('GetCurrentProgramScene');
  const sceneName = current.currentProgramSceneName;
  const items = await obs
    .call('GetSceneItemList', { sceneName })
    .catch(() => ({ sceneItems: [] }));
  // OBS 32 的 WebSocket 未提供 GetWindowList；演示窗口标题固定为 player.html 的 title。
  const target = {
    title: `${browserTitle} - Google Chrome`,
    executable: 'chrome.exe',
    class: 'Chrome_WidgetWin_1',
  };

  if (items.sceneItems && items.sceneItems.length > 0) {
    const sourceName = items.sceneItems[0].sourceName;
    if (target) {
      try {
        await obs.call('SetInputSettings', {
          inputName: sourceName,
          inputSettings: {
            window: `${target.executable}:${target.title}:${target.class}`,
          },
        });
        console.log(`[OBS] 更新捕获源: ${target.title}`);
      } catch (error) {
        console.warn(`[OBS] 更新捕获源失败: ${error.message}`);
      }
    }
    return sceneName;
  }

  const recordingScene = 'KeelBase Demo Recording';
  if (!scenes.scenes.some((scene) => scene.sceneName === recordingScene)) {
    await obs.call('CreateScene', { sceneName: recordingScene });
  }
  await obs.call('SetCurrentProgramScene', { sceneName: recordingScene });
  const kinds =
    (await obs.call('GetInputKindList', { unversioned: true })).inputKinds || [];
  const kind =
    kinds.find((inputKind) => /window.*capture|capture.*window/i.test(inputKind)) ||
    'window_capture';
  if (target) {
    await obs.call('CreateInput', {
      sceneName: recordingScene,
      inputName: 'KeelBase Browser',
      inputKind: kind,
      inputSettings: {
        window: `${target.executable}:${target.title}:${target.class}`,
      },
      sceneItemEnabled: true,
    });
    console.log(`[OBS] 已创建窗口捕获: ${target.title}`);
  } else {
    console.warn('[OBS] 未找到演示浏览器窗口，请确认 Chrome 已打开 player.html');
  }
  return recordingScene;
}

async function main() {
  mkdirSync(LOG_DIR, { recursive: true });
  const boundaries = [];
  let obs = null;
  let obsRecording = false;
  let browser;
  let t0 = 0;

  try {
    browser = await chromium.launch({
      headless: false,
      executablePath: chromePath(),
      args: ['--window-size=1280,800'],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.goto(`${SLIDES_URL}/player.html`, { waitUntil: 'load' });
    await sleep(3000);

    const obsPassword = readObsPassword();
    if (!obsPassword) throw new Error('未找到 OBS WebSocket 密码');
    obs = new ObsClient(OBS_WS_URL, obsPassword);
    await obs.connect();
    const status = await obs.call('GetRecordStatus');
    if (status.outputActive) {
      await obs.call('StopRecord');
      await sleep(2500);
    }
    const scene = await ensureObsCapture(obs, 'KeelBase 项目介绍');
    await obs.call('StartRecord');
    t0 = Date.now();
    obsRecording = true;
    console.log(`[OBS] 开始录制（场景: ${scene}）`);

    // Opening 1-8
    await showSlide(page, 1, 5000, boundaries, t0);
    await showSlide(page, 2, 4000, boundaries, t0);
    await showSlide(page, 3, 4000, boundaries, t0);
    await showSlide(page, 4, 5000, boundaries, t0);
    await showSlide(page, 5, 2000, boundaries, t0);
    await showSlide(page, 6, 12000, boundaries, t0);
    await showSlide(page, 7, 8000, boundaries, t0);
    await showSlide(page, 8, 5000, boundaries, t0);

    // Demo 1-5 (9-21)
    await setStage(page, `${BASE_URL}/admin/#/login`);
    let frame = await waitForFrame(page, /admin\/#\/login/);
    boundaries.push({ shot: 9, at: Date.now() - t0 });
    await loginAs(frame, DEMO_USER, DEMO_PASSWORD);

    await setStage(page, `${BASE_URL}/admin/#/workbench/crm`);
    frame = await waitForFrame(page, /workbench\/crm/);
    const customerId = await openCrmDetail(frame);
    frame = await waitForFrame(page, /workbench\/crm\/\d+/);
    await openAiDrawer(frame);

    boundaries.push({ shot: 10, at: Date.now() - t0 });
    await askInDrawer(frame, RISK_QUESTION);
    await waitToolCards(frame);
    await waitRiskConclusion(frame);
    await sleep(5000);
    boundaries.push({ shot: 12, at: Date.now() - t0 });
    await askInDrawer(frame, CREATE_QUESTION);
    await waitConfirmCard(frame);
    await sleep(7000);
    boundaries.push({ shot: 14, at: Date.now() - t0 });
    await approveConfirm(frame);
    await waitGovernance(frame);
    await sleep(5000);
    boundaries.push({ shot: 16, at: Date.now() - t0 });
    await frame.keyboard.press('Escape');
    await sleep(1200);
    await frame.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(5000);

    boundaries.push({ shot: 17, at: Date.now() - t0 });
    await setStage(page, `${BASE_URL}/admin/#/workbench/ai-trace`);
    frame = await waitForFrame(page, /workbench\/ai-trace/);
    await selectAiTraceConversation(frame, RISK_QUESTION);
    await sleep(6000);
    boundaries.push({ shot: 19, at: Date.now() - t0 });
    await revokeFirstEffect(frame);
    await sleep(5000);
    boundaries.push({ shot: 21, at: Date.now() - t0 });
    await sleep(4000);

    // Trust Runtime 22-23
    await showSlide(page, 22, 13000, boundaries, t0);
    await showSlide(page, 23, 7000, boundaries, t0);

    // 越权失败 24-25
    await setStage(page, `${BASE_URL}/admin/#/workbench/crm/${customerId}`);
    frame = await waitForFrame(page, /workbench\/crm\/\d+/);
    await openAiDrawer(frame);
    boundaries.push({ shot: 24, at: Date.now() - t0 });
    await askInDrawer(frame, OVERREACH_QUESTION);
    await sleep(10000);
    boundaries.push({ shot: 25, at: Date.now() - t0 });
    await sleep(6000);

    // Evidence + Build + Bridge + Deploy 26-37
    await showSlide(page, 26, 5000, boundaries, t0);
    await showSlide(page, 27, 3000, boundaries, t0);
    await showSlide(page, 28, 7000, boundaries, t0);
    await showSlide(page, 29, 12000, boundaries, t0);
    await showSlide(page, 30, 8000, boundaries, t0);
    await showSlide(page, 31, 3000, boundaries, t0);
    await showSlide(page, 32, 13000, boundaries, t0);
    await showSlide(page, 33, 7000, boundaries, t0);
    await showSlide(page, 34, 7000, boundaries, t0);
    await showSlide(page, 35, 4000, boundaries, t0);
    await showSlide(page, 36, 2000, boundaries, t0);
    await showSlide(page, 37, 2000, boundaries, t0);

    const endAt = Date.now() - t0;
    const log = boundaries.map((entry, index) => ({
      shot: entry.shot,
      startMs: entry.at,
      endMs: index < boundaries.length - 1 ? boundaries[index + 1].at : endAt,
    }));
    writeFileSync(SHOT_LOG, JSON.stringify(log, null, 2), 'utf8');
    console.log(`[ShotLog] ${SHOT_LOG}`);

    if (obsRecording && obs) {
      await obs.call('StopRecord');
      obsRecording = false;
      await sleep(2500);
    }
    console.log('[Demo] 自动操作完成');
  } finally {
    if (obsRecording && obs) {
      try {
        await obs.call('StopRecord');
      } catch {
        // ignore
      }
    }
    if (obs) obs.close();
    if (browser) await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
