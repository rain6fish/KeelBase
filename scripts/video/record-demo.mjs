#!/usr/bin/env node
/**
 * KeelBase 自动演示录制脚本
 *
 * 流程：
 *   1. 连接 OBS WebSocket（自动读取 OBS 本地配置里的密码）
 *   2. 用 Playwright 启动本机 Chrome/Edge 并打开本地工作台
 *   3. OBS 开始录制
 *   4. 自动执行 Golden Demo：登录 -> CRM -> AI Copilot -> 写操作确认 -> 治理轨迹
 *   5. 停止 OBS 录制，同时保留 Playwright 自录的 webm 作为兜底
 *
 * 用法：
 *   node scripts/video/record-demo.mjs                # 完整录制
 *   node scripts/video/record-demo.mjs --obs-info     # 只查看 OBS 场景/窗口/输入类型
 *   OBS_WS_PASSWORD=xxx node scripts/video/record-demo.mjs
 */
import { chromium } from 'playwright-core';
import OBSWebSocket from 'obs-websocket-js';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OBS_WS_URL = process.env.OBS_WS_URL || 'ws://localhost:4455';
const OUTPUT_DIR = resolve(process.env.VIDEO_OUT || 'artifacts/demo');
const KEEP_OPEN =
  process.argv.includes('--keep-open') || process.env.KEEP_OPEN === '1';
const PREPARE_MODE =
  process.argv.includes('--prepare') || process.env.PREPARE_MODE === '1';
const INTRO_HTML = resolve('docs/intro/keelbase-project-intro.html');
const SHOW_INTRO =
  !process.argv.includes('--no-intro') && process.env.SHOW_INTRO !== '0';
const INTRO_SECONDS = Number(process.env.INTRO_SECONDS || 10);
const DEMO_USER = process.env.DEMO_USER || 'alex';
// demo 环境账号密码已更换为强密码（非默认 123456），录制前必须显式设置：
// 本地开发环境 `DEMO_PASSWORD=123456`；录 ECS demo 用部署方提供的强密码。
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '';
if (!DEMO_PASSWORD) {
  console.error('请设置 DEMO_PASSWORD 环境变量（本地开发可用 123456；录 ECS demo 用新密码）');
  process.exit(1);
}
const DEMO_QUESTION =
  process.env.DEMO_QUESTION || '请为这个客户创建一个跟进任务，标题为：跟进客户风险';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'D:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chromePath() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error('未找到 Chrome/Edge，请设置 CHROME_PATH');
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
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return config.server_password || '';
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

  request(requestType, requestData = {}) {
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

async function obsInfo() {
  const obs = new ObsClient(OBS_WS_URL, readObsPassword());
  await obs.connect();
  try {
    const scenes = await obs.request('GetSceneList');
    const current = await obs.request('GetCurrentProgramScene');
    const kinds = await obs
      .request('GetInputKindList', { unversioned: true })
      .catch(() => ({ inputKinds: [] }));
    const windows = await obs.request('GetWindowList').catch(() => ({ windows: [] }));
    const dir = await obs
      .request('GetRecordDirectory')
      .catch(() => ({ recordDirectory: '' }));
    console.log(
      JSON.stringify(
        {
          scenes: scenes.scenes,
          currentProgramScene: current.currentProgramSceneName,
          inputKinds: kinds.inputKinds,
          windows: windows.windows,
          recordDirectory: dir.recordDirectory,
        },
        null,
        2,
      ),
    );
  } finally {
    obs.close();
  }
}

async function ensureObsCapture(obs, browserTitle) {
  const scenes = await obs.request('GetSceneList');
  const sceneList = scenes.scenes || [];
  const currentSceneName =
    scenes.currentProgramSceneName ||
    (await obs.request('GetCurrentProgramScene')).currentProgramSceneName;

  const items = await obs
    .request('GetSceneItemList', { sceneName: currentSceneName })
    .catch(() => ({ sceneItems: [] }));
  if (items.sceneItems && items.sceneItems.length > 0) {
    console.log(`[OBS] 复用当前场景: ${currentSceneName}`);
    return currentSceneName;
  }

  const sceneName = 'KeelBase Demo Recording';
  if (!sceneList.some((scene) => scene.sceneName === sceneName)) {
    await obs.request('CreateScene', { sceneName });
  }
  await obs.request('SetCurrentProgramScene', { sceneName });

  const windows = (await obs.request('GetWindowList')).windows || [];
  const target =
    windows.find((window) =>
      new RegExp(browserTitle, 'i').test(window.title || ''),
    ) || windows.find((window) => /chrom|chrome|edge/i.test(window.title || ''));

  const kinds = (
    await obs
      .request('GetInputKindList', { unversioned: true })
      .catch(() => ({ inputKinds: [] }))
  ).inputKinds || [];
  const kind =
    kinds.find((inputKind) =>
      /window.*capture|capture.*window/i.test(inputKind),
    ) || 'window_capture';

  if (target) {
    try {
      await obs.request('CreateInput', {
        sceneName,
        inputName: 'KeelBase Browser',
        inputKind: kind,
        inputSettings: {
          window: `${target.executable || ''}:${target.title || ''}:${
            target.class || ''
          }`,
        },
        sceneItemEnabled: true,
      });
      console.log(
        `[OBS] 已创建 ${kind} 捕获源，窗口: ${target.title || ''}`,
      );
    } catch (error) {
      console.warn(`[OBS] 创建窗口捕获失败，请手动添加捕获源: ${error.message}`);
    }
  } else {
    console.warn(
      '[OBS] 未找到演示浏览器窗口，请手动在场景中添加窗口捕获源',
    );
  }
  return sceneName;
}

async function startObsRecording(obs) {
  const status = await obs.request('GetRecordStatus');
  if (status.outputActive) {
    throw new Error('OBS 正在录制中，请先停止现有录制');
  }
  await obs.request('StartRecord');
}

async function stopObsRecording(obs) {
  await obs.request('StopRecord');
  await sleep(1500);
}

async function findNewestFile(directory, predicate, afterMs) {
  if (!existsSync(directory)) return null;
  return readdirSync(directory)
    .map((file) => {
      const fullPath = join(directory, file);
      try {
        return { fullPath, mtimeMs: statSync(fullPath).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter(
      (entry) =>
        (!afterMs || entry.mtimeMs >= afterMs) && predicate(entry.fullPath),
    )
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.fullPath;
}

async function driveDemo(page) {
  await page.waitForSelector('input[autocomplete="username"]', {
    timeout: 15000,
  });
  await sleep(1800);
  await page.fill('input[autocomplete="username"]', DEMO_USER);
  await sleep(900);
  await page.fill('input[autocomplete="current-password"]', DEMO_PASSWORD);
  await sleep(900);
  await page
    .getByRole('button', { name: /登\s*录|Log\s*in/i })
    .first()
    .click();
  await page.waitForURL(/#\/workbench/, { timeout: 20000 });
  await sleep(1500);

  await page.goto(`${BASE_URL}/admin/#/workbench/crm`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.el-table__row', { timeout: 20000 });
  await sleep(1200);
  await page.locator('.el-table__row').first().getByRole('button').first().click();
  await page.waitForURL(/#\/workbench\/crm\/\d+/, { timeout: 20000 });
  await sleep(1800);

  await page
    .getByRole('button', { name: /AI\s*分\s*析|AI\s*Analyze/i })
    .first()
    .click();
  await page.waitForSelector('.el-drawer input', { timeout: 10000 });
  await sleep(1200);

  const hashMatch = page.url().match(/\/workbench\/crm\/(\d+)/);
  const customerId = hashMatch ? hashMatch[1] : '';
  const input = page.locator('.el-drawer input').last();
  const message = customerId
    ? `当前客户 ID ${customerId}。请为该客户创建一个跟进任务，标题为：跟进客户风险，备注：AI 自动演示`
    : DEMO_QUESTION;
  await input.fill(message);
  await input.press('Enter');

  await page.waitForSelector('.ai-confirm-card', { timeout: 90000 });
  await sleep(2000);
  await page
    .locator('.ai-confirm-card')
    .getByRole('button', { name: /批\s*准|Approve/i })
    .first()
    .click();

  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.el-drawer__title')).some((el) =>
        /治理详情|Governance Detail/.test(el.textContent || ''),
      ),
    { timeout: 30000 },
  );
  await sleep(4000);
}

async function loginAs(page, username, password) {
  await page.waitForSelector('input[autocomplete="username"]', {
    timeout: 15000,
  });
  await sleep(1800);
  await page.fill('input[autocomplete="username"]', username);
  await sleep(900);
  await page.fill('input[autocomplete="current-password"]', password);
  await sleep(900);
  await page
    .getByRole('button', { name: /登\s*录|Log\s*in/i })
    .first()
    .click();
  await page.waitForSelector('.admin-shell', { timeout: 20000 });
  await sleep(1800);
}

async function visit(page, hashPath, label, holdMs = 2400) {
  await page.goto(`${BASE_URL}/admin/#${hashPath}`, {
    waitUntil: 'domcontentloaded',
  });
  await sleep(1000);
  await page
    .waitForFunction(
      (path) => window.location.hash.includes(path),
      hashPath,
      { timeout: 15000 },
    )
    .catch(() => {});
  await sleep(holdMs);
  console.log(`[Tour] ${label}`);
}

async function runCrmAiFlow(page, customerId) {
  await visit(page, `/workbench/crm/${customerId}`, 'AI CRM 客户详情', 1500);
  await page
    .getByRole('button', { name: /AI\s*分\s*析|AI\s*Analyze/i })
    .first()
    .click();
  await page.waitForSelector('.el-drawer input', { timeout: 10000 });
  await sleep(1200);
  const input = page.locator('.el-drawer input').last();
  const message = `当前客户 ID ${customerId}。请为该客户创建一个跟进任务，标题为：跟进客户风险，备注：AI 自动演示`;
  await input.fill(message);
  await input.press('Enter');
  await page.waitForSelector('.ai-confirm-card', { timeout: 90000 });
  await sleep(2000);
  await page
    .locator('.ai-confirm-card')
    .getByRole('button', { name: /批\s*准|Approve/i })
    .first()
    .click();
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.el-drawer__title')).some((el) =>
        /治理详情|Governance Detail/.test(el.textContent || ''),
      ),
    { timeout: 30000 },
  );
  await sleep(4000);
}

async function fullTour(page) {
  console.log('[FullTour] 开始：普通用户工作台');
  await loginAs(page, DEMO_USER, DEMO_PASSWORD);

  const userRoutes = [
    { path: '/workbench', label: '工作台首页' },
    { path: '/workbench/events', label: '我的事件' },
    { path: '/workbench/todos', label: '我的待办' },
    { path: '/workbench/notifications', label: '我的通知' },
    { path: '/workbench/org', label: '组织通讯录' },
    { path: '/workbench/crm', label: 'AI CRM 客户列表' },
    { path: '/workbench/pm', label: '项目管理' },
    { path: '/workbench/approval', label: '审批中心' },
    { path: '/workbench/ai-trace', label: 'AI 执行轨迹' },
  ];
  for (const route of userRoutes) {
    await visit(page, route.path, route.label);
  }

  await runCrmAiFlow(page, 1);
  console.log('[FullTour] 普通用户工作台完成');

  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE_URL}/admin/#/login`, {
    waitUntil: 'domcontentloaded',
  });
  await sleep(1500);
  console.log('[FullTour] 开始：管理员控制台');
  await loginAs(page, 'admin', 'Admin@2026$KeelBase');

  const adminRoutes = [
    { path: '/', label: '控制台概览' },
    { path: '/users', label: '用户管理' },
    { path: '/org', label: '组织管理' },
    { path: '/events', label: '事件管理' },
    { path: '/knowledge', label: '知识库' },
    { path: '/notifications', label: '通知广播' },
    { path: '/monitor', label: '监控中心' },
    { path: '/ops', label: '运维' },
    { path: '/audit', label: 'AI 审计' },
    { path: '/op-audit', label: '操作审计' },
    { path: '/sessions', label: '会话管理' },
    { path: '/analytics', label: '平台统计' },
    { path: '/ai-tools', label: 'AI 工具与副作用' },
    { path: '/ai-approvals', label: 'AI 审批' },
    { path: '/security-review', label: '安全审查' },
    { path: '/risk', label: '风险中心' },
    { path: '/mcp', label: 'MCP 集成' },
    { path: '/policy-center', label: '策略中心' },
    { path: '/agent-registry', label: 'Agent 注册表' },
    { path: '/system-ai-assistant', label: '系统 AI 助手' },
    { path: '/system', label: '系统信息' },
  ];
  for (const route of adminRoutes) {
    await visit(page, route.path, route.label);
  }
  console.log('[FullTour] 管理员控制台完成');
}


async function openStartPage(page) {
  if (SHOW_INTRO && existsSync(INTRO_HTML)) {
    await page.goto('file:///' + INTRO_HTML.replaceAll('\\', '/'), {
      waitUntil: 'load',
    });
    await sleep(2500);
    return 'intro';
  }
  await page.goto(`${BASE_URL}/admin/#/login`, {
    waitUntil: 'domcontentloaded',
  });
  await sleep(2500);
  return 'login';
}

async function scrollIntro(page) {
  const steps = Math.max(1, Math.floor((INTRO_SECONDS - 2.5) / 0.9));
  for (let i = 0; i < steps; i++) {
    await page
      .evaluate(() =>
        window.scrollBy({ top: window.innerHeight * 0.55, behavior: 'smooth' }),
      )
      .catch(() => {});
    await sleep(900);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' })).catch(() => {});
  await sleep(600);
}
async function main() {
  if (process.argv.includes('--obs-info')) {
    await obsInfo();
    return;
  }

  const startedAt = Date.now();
  let obs = null;
  let obsRecording = false;
  let browser;

  try {
    browser = await chromium.launch({
      headless: false,
      executablePath: chromePath(),
      args: ['--window-size=1280,800'],
    });
    const context = await browser.newContext(
      PREPARE_MODE
        ? { viewport: { width: 1280, height: 800 } }
        : {
            viewport: { width: 1280, height: 800 },
            recordVideo: { dir: OUTPUT_DIR, size: { width: 1280, height: 800 } },
          },
    );
    const page = await context.newPage();
    const startPage = await openStartPage(page);

    if (PREPARE_MODE) {
      console.log(
        startPage === 'intro'
          ? '[准备模式] 浏览器已打开并展示项目介绍。请在 OBS 中配置窗口捕获；配置好后告诉我，我会发送回车开始录制。'
          : '[准备模式] 浏览器已打开并停在登录页。请在 OBS 中配置窗口捕获；配置好后告诉我，我会发送回车开始录制。',
      );
      await new Promise((resolve) => process.stdin.once('data', resolve));
      console.log('[准备模式] 收到信号，开始录制');
    }

    const obsPassword = readObsPassword();
    if (obsPassword) {
      try {
        obs = new ObsClient(OBS_WS_URL, obsPassword);
        await obs.connect();
        const scene = await ensureObsCapture(obs, 'KeelBase');
        await startObsRecording(obs);
        obsRecording = true;
        console.log(`[OBS] 开始录制（场景: ${scene}）`);

      } catch (error) {
        console.warn(`[OBS] 跳过 OBS 控制: ${error.message}`);
      }
    } else {
      console.warn('[OBS] 未找到 WebSocket 密码，仅使用 Playwright 自录视频');
    }

    if (startPage === 'intro') {
      await scrollIntro(page);
      await page.goto(`${BASE_URL}/admin/#/login`, {
        waitUntil: 'domcontentloaded',
      });
      await sleep(1500);
    }

    if (process.argv.includes('--full')) {
      await fullTour(page);
    } else {
      await driveDemo(page);
    }
    console.log('[Demo] 自动操作完成');

    if (obsRecording && obs) {
      const directory =
        (await obs.request('GetRecordDirectory')).recordDirectory ||
        OUTPUT_DIR;
      await stopObsRecording(obs);
      const output = await findNewestFile(
        directory,
        (file) => file.toLowerCase().endsWith('.mp4'),
        startedAt,
      );
      console.log(`OBS_OUTPUT=${output || ''}`);
    }
  } finally {
    if (obsRecording && obs) {
      try {
        await stopObsRecording(obs);
      } catch {
        // ignore
      }
    }
    if (obs) obs.close();
    if (browser) {
      if (KEEP_OPEN) {
        console.log('录制完成，浏览器保持打开；关闭浏览器窗口后脚本退出');
        await new Promise((resolve) => browser.once('disconnected', resolve));
      } else {
        await browser.close();
      }
    }
    if (!PREPARE_MODE) {
      const playwrightVideo = await findNewestFile(
        OUTPUT_DIR,
        (file) => file.toLowerCase().endsWith('.webm'),
        startedAt,
      );
      console.log(`PLAYWRIGHT_VIDEO=${playwrightVideo || ''}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
