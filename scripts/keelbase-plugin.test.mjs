/**
 * P1-7 插件 CLI 单测（node:test，临时目录验证接线）。
 * 运行：node --test scripts/keelbase-plugin.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateManifest, parseManifest, extractManifestObject, findHostRelativeImports } from './keelbase-plugin.mjs';

const PLUGIN_CLI = fileURLToPath(new URL('./keelbase-plugin.mjs', import.meta.url));

async function tempRepo() {
  const root = await mkdtemp(join(tmpdir(), 'keelbase-plugin-'));
  const moduleDir = `${root}/Server-NestJS/src/plugins/plugins`;
  await mkdir(moduleDir, { recursive: true });
  await writeFile(
    `${root}/Server-NestJS/src/plugins/plugins.module.ts`,
    `import { Module } from '@nestjs/common';\nimport { HELLO_PLUGIN } from './plugins/hello.plugin';\nconst PLUGINS = [HELLO_PLUGIN];\n@Module({})\nexport class PluginsModule {}\n`,
  );
  await writeFile(`${moduleDir}/hello.plugin.ts`, `export const HELLO_PLUGIN: PluginManifest = { name: 'hello-plugin' };\n`);
  return root;
}

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [PLUGIN_CLI, ...args], { cwd });
    let o = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (o += d));
    p.on('close', (code) => (code === 0 ? resolve(o) : reject(new Error(`exit ${code}: ${o}`))));
  });
}

test('plugin add：复制源文件 + 接线 import 与 PLUGINS 数组', async () => {
  const root = await tempRepo();
  const pluginPath = `${root}/notify.plugin.ts`;
  await writeFile(pluginPath, `export const NOTIFY_PLUGIN: PluginManifest = { name: 'notify-plugin' };\n`);

  const out = await run(['add', pluginPath], root);
  assert.match(out, /已接线插件 NOTIFY_PLUGIN/);

  const module = await readFile(`${root}/Server-NestJS/src/plugins/plugins.module.ts`, 'utf8');
  assert.match(module, /import \{ NOTIFY_PLUGIN \} from '\.\/plugins\/notify\.plugin';/);
  assert.match(module, /const PLUGINS = \[HELLO_PLUGIN, NOTIFY_PLUGIN\];/);
  // 源文件已复制到 plugins/plugins/
  await import(`file://${root}/Server-NestJS/src/plugins/plugins/notify.plugin.ts`).catch(() => {});
  const copied = await readFile(`${root}/Server-NestJS/src/plugins/plugins/notify.plugin.ts`, 'utf8').catch(() => '');
  assert.match(copied, /NOTIFY_PLUGIN/);
});

test('plugin add：导出不是 manifest 对象（无 name）→ 报错', async () => {
  const root = await tempRepo();
  const badPath = `${root}/bad.plugin.ts`;
  await writeFile(badPath, `export const X = 1;\n`);
  await assert.rejects(() => run(['add', badPath], root), /manifest 对象缺少 name 字段/);

  const noNamePath = `${root}/noname.plugin.ts`;
  await writeFile(noNamePath, `export const Y = { version: '1.0.0' };\n`);
  await assert.rejects(() => run(['add', noNamePath], root), /缺少 name/);
});

test('plugin remove：从数组与 import 移除；list 列出', async () => {
  const root = await tempRepo();
  const out = await run(['list'], root);
  assert.match(out, /HELLO_PLUGIN/);

  await run(['remove', 'HELLO_PLUGIN'], root);
  const module = await readFile(`${root}/Server-NestJS/src/plugins/plugins.module.ts`, 'utf8');
  assert.doesNotMatch(module, /HELLO_PLUGIN/);
  assert.match(module, /const PLUGINS = \[\];/);

  await assert.rejects(() => run(['remove', 'HELLO_PLUGIN'], root), /未接线/);
});

// ── verify（宿主外校验，Phase 2 生态）────────────────────────────────────────
test('verify 纯函数：结构校验（name/version/description 约定）', () => {
  const good = validateManifest({ name: 'notify-plugin', version: '1.0.0', description: '通知', requires: [], capabilities: ['x'] });
  assert.deepEqual(good, []);

  const bad = validateManifest({ name: 'Bad Plugin', version: '1.0', description: '' });
  assert.ok(bad.some((p) => /name 非法/.test(p)));
  assert.ok(bad.some((p) => /version 非法/.test(p)));
  assert.ok(bad.some((p) => /description 缺失/.test(p)));
});

test('verify 纯函数：宿主一致性（requires/featureFlag 对照）', () => {
  const ctx = { knownServices: new Set(['UsersService', 'EventsService']), featureFlags: new Set(['ai', 'crm']) };
  const good = validateManifest(
    { name: 'x-plugin', version: '1.0.0', description: 'x', requires: ['UsersService'], featureFlag: 'ai' },
    ctx,
  );
  assert.deepEqual(good, []);

  const bad = validateManifest(
    { name: 'x-plugin', version: '1.0.0', description: 'x', requires: ['NoSuchService'], featureFlag: 'bogus' },
    ctx,
  );
  assert.ok(bad.some((p) => /未知宿主服务.*NoSuchService/.test(p)));
  assert.ok(bad.some((p) => /featureFlag 未知.*bogus/.test(p)));
});

test('verify CLI：解析 manifest 对象 + 通过/失败路径', async () => {
  const root = await tempRepo();
  const goodPath = `${root}/good.plugin.ts`;
  await writeFile(goodPath, `export const GOOD_PLUGIN: PluginManifest = { name: 'good-plugin', version: '1.2.3', description: '一个测试插件' };\n`);
  const goodOut = await run(['verify', goodPath], root);
  assert.match(goodOut, /校验通过/);
  assert.match(goodOut, /GOOD_PLUGIN/);
  assert.match(goodOut, /1\.2\.3/);
  // 宿主缺失时提示，但结构合法即通过（宿主外校验的核心价值）
  assert.match(goodOut, /未检测到宿主/);

  const badPath = `${root}/bad.plugin.ts`;
  await writeFile(badPath, `export const BAD_PLUGIN: PluginManifest = { name: 'Bad', version: 'x' };\n`);
  await assert.rejects(() => run(['verify', badPath], root), /校验未通过/);
});

test('verify 增强：自包含插件（无 PluginManifest 注解）通过且无宿主导入警告', async () => {
  const root = await tempRepo();
  const selfPath = `${root}/self.plugin.ts`;
  await writeFile(selfPath, `export const SELF_PLUGIN = { name: 'self-plugin', version: '0.1.0', description: '自包含' };\n`);
  const out = await run(['verify', selfPath], root);
  assert.match(out, /校验通过/);
  assert.doesNotMatch(out, /宿主树相对导入/);
});

test('verify 增强：宿主相对导入被识别为可移植性警告', () => {
  const src = `import { PluginManifest } from '../plugin.interface';\nexport const X = {};\n`;
  assert.deepEqual(findHostRelativeImports(src), ['../plugin.interface']);
  assert.deepEqual(findHostRelativeImports(`export const Y = { name: 'y' };\n`), []);
});
