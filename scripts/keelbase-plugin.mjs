#!/usr/bin/env node
/**
 * KeelBase 插件 CLI（P1-7）：安装/卸载/列出源码级插件。
 *
 * 插件是编译期注册（PluginsModule 的 PLUGINS 数组 + plugins/ 目录 TS 文件）。
 * 本 CLI 简化「加入/移除」：
 *   node scripts/keelbase-plugin.mjs add <source.ts>            # 复制插件 TS + 接线 PLUGINS
 *   node scripts/keelbase-plugin.mjs remove <name>              # 从 PLUGINS 移除接线
 *   node scripts/keelbase-plugin.mjs list                       # 列出已接线插件
 *
 * 插件源文件约定：导出 `export const <NAME>_PLUGIN: PluginManifest = {...}`。
 * 零依赖（node:fs），复用 wire.mjs 的插入/幂等模式。
 */
import { readFile, writeFile, copyFile, mkdir, access } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

const C = { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' };
const PLUGINS_DIR = 'Server-NestJS/src/plugins/plugins';
const MODULE_FILE = 'Server-NestJS/src/plugins/plugins.module.ts';

function fail(msg) {
  console.error(`${C.red}✗ ${msg}${C.reset}`);
  process.exit(1);
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** 从插件源文件提取 `export const <NAME>_PLUGIN: PluginManifest` 的 manifest 名。 */
function extractManifestName(source) {
  const m = source.match(/export const (\w+):\s*PluginManifest/);
  return m ? m[1] : null;
}

async function readModule() {
  try {
    return await readFile(MODULE_FILE, 'utf8');
  } catch {
    fail(`找不到 ${MODULE_FILE}（请在仓库根目录运行）`);
  }
}

async function writeModule(content) {
  await writeFile(MODULE_FILE, content, 'utf8');
}

function listPlugins(content) {
  // PLUGINS 数组里的 manifest 引用名
  const m = content.match(/const PLUGINS = \[([^\]]*)\];/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** add：复制源插件 TS 到 plugins/plugins/ + 接线 import 与 PLUGINS 数组。 */
async function addPlugin(sourcePath) {
  if (!(await exists(sourcePath))) fail(`源文件不存在：${sourcePath}`);
  const source = await readFile(sourcePath, 'utf8');
  const manifestName = extractManifestName(source);
  if (!manifestName) fail('未找到 `export const <NAME>_PLUGIN: PluginManifest`（请按约定导出插件 manifest）');

  const targetFile = `${PLUGINS_DIR}/${basename(sourcePath)}`;
  if ((await exists(targetFile)) && targetFile !== sourcePath) {
    fail(`目标已存在：${targetFile}（先 remove 再 add，或改名）`);
  }
  if (targetFile !== sourcePath) {
    await mkdir(PLUGINS_DIR, { recursive: true });
    await copyFile(sourcePath, targetFile);
  }

  const content = await readModule();
  const importLine = `import { ${manifestName} } from './plugins/${basename(targetFile, '.ts')}';`;
  if (content.includes(importLine)) fail('已接线（幂等）');

  // 在最后一个插件 import 后插 import；在 PLUGINS 数组加 manifest
  const importMatch = content.match(/import \{ \w+ \} from '\.\/plugins\/[^']+';\s*$/m);
  const list = listPlugins(content);
  const arrayLine = `const PLUGINS = [${[...list, manifestName].join(', ')}];`;
  let next = importMatch
    ? content.slice(0, importMatch.index + importMatch[0].length) + `\n${importLine}` + content.slice(importMatch.index + importMatch[0].length)
    : content;
  const arrayMatch = next.match(/const PLUGINS = \[[^\]]*\];/);
  if (!arrayMatch) fail('未找到 PLUGINS 数组');
  next = next.slice(0, arrayMatch.index) + arrayLine + next.slice(arrayMatch.index + arrayMatch[0].length);

  await writeModule(next);
  console.log(`${C.green}✓ 已接线插件 ${manifestName}${C.reset}`);
  console.log(`  ${targetFile}`);
  console.log(`  重新构建生效：cd Server-NestJS && npm run build`);
}

/** remove：从 PLUGINS 数组 + import 移除 manifest 引用（不删源文件）。 */
async function removePlugin(name) {
  const content = await readModule();
  const list = listPlugins(content);
  if (!list.includes(name)) fail(`插件 ${name} 未接线（当前：${list.join(', ') || '无'}）`);
  const nextList = list.filter((x) => x !== name);
  let next = content.replace(`const PLUGINS = [${list.join(', ')}];`, `const PLUGINS = [${nextList.join(', ')}];`);
  next = next.replace(new RegExp(`import \\{ ${name} \\} from '\\./plugins/[^']+';\n?`), '');
  if (next === content) fail('移除失败（接线格式未匹配）');
  await writeModule(next);
  console.log(`${C.yellow}✓ 已移除插件 ${name}${C.reset}`);
  console.log(`  源文件保留在 plugins/plugins/；如需删除请手动 rm`);
}

async function listCmd() {
  const content = await readModule();
  const list = listPlugins(content);
  console.log(`${C.green}已接线插件（${list.length}）${C.reset}`);
  for (const name of list) console.log(`  ${name}`);
  if (list.length === 0) console.log('  （无）—— 可用 `keelbase-plugin add <source.ts>` 安装');
}

const cmd = process.argv[2];
const arg = process.argv[3];
switch (cmd) {
  case 'add':
    if (!arg) fail('用法：keelbase-plugin add <source.ts>');
    await addPlugin(arg);
    break;
  case 'remove':
    if (!arg) fail('用法：keelbase-plugin remove <manifestName>');
    await removePlugin(arg);
    break;
  case 'list':
    await listCmd();
    break;
  default:
    console.log(`KeelBase 插件 CLI（P1-7）
用法:
  node scripts/keelbase-plugin.mjs add <source.ts>   # 安装源码级插件（复制 + 接线 PLUGINS）
  node scripts/keelbase-plugin.mjs remove <name>     # 卸载（移除接线）
  node scripts/keelbase-plugin.mjs list              # 列出已接线插件
插件源文件约定：export const <NAME>_PLUGIN: PluginManifest = {...}`);
}
