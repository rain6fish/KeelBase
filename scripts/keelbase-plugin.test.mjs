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

test('plugin add：源文件无约定导出 → 报错', async () => {
  const root = await tempRepo();
  const badPath = `${root}/bad.plugin.ts`;
  await writeFile(badPath, `export const X = 1;\n`);
  await assert.rejects(() => run(['add', badPath], root), /PluginManifest/);
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
