#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
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
import { readFile, writeFile, copyFile, mkdir, access, readdir } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

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

/** 从插件源文件提取 `export const <NAME>_PLUGIN(: PluginManifest)? = {` 的 manifest 名。 */
function extractManifestName(source) {
  const m = source.match(/export const (\w+)(?::\s*PluginManifest)?\s*=/);
  return m ? m[1] : null;
}

// ── verify（宿主外校验）：纯函数，便于第三方在安装前校验插件 ────────────────

/** 提取 manifest 对象字面量（`= { ... };` 花括号匹配），返回对象文本。 */
export function extractManifestObject(source) {
  const m = source.match(/export const \w+(?::\s*PluginManifest)?\s*=\s*\{/);
  if (!m) return null;
  let depth = 0;
  let start = m.index + m[0].length - 1; // 指向 '{'
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 自包含检查：插件是否引用了宿主树相对路径（如 `../plugin.interface`）。
 * 宿主内插件合法（随宿主编译）；作者化插件应自包含（不依赖宿主树），否则不可移植。
 * 返回宿主相对 import 的模块名数组（空 = 自包含）。
 */
export function findHostRelativeImports(source) {
  return [...source.matchAll(/(?:import|export)\s+(?:[\w{},\s*]*?\s+from\s+)?['"](\.\.?\/[^'"]+)['"]/g)].map(
    (m) => m[1],
  );
}

/** 解析 manifest 对象文本 → 结构化 manifest（正则取顶层键，够用即可）。 */
export function parseManifest(objectText) {
  const str = (key) => {
    const m = objectText.match(new RegExp(`\\b${key}\\s*:\\s*['"]([^'"]*)['"]`));
    return m ? m[1] : null;
  };
  const arr = (key) => {
    const m = objectText.match(new RegExp(`\\b${key}\\s*:\\s*\\[([^\\]]*)\\]`));
    if (!m) return null;
    return [...m[1].matchAll(/['"]([^'"]*)['"]/g)].map((x) => x[1]);
  };
  return {
    name: str('name'),
    version: str('version'),
    description: str('description'),
    featureFlag: str('featureFlag'),
    requires: arr('requires'),
    capabilities: arr('capabilities'),
  };
}

/**
 * 校验 manifest（纯函数）。ctx = { knownServices?: Set, featureFlags?: Set }。
 * 返回问题数组（空 = 通过）。宿主一致性仅在提供 knownServices/featureFlags 时校验。
 */
export function validateManifest(manifest, ctx = {}) {
  const problems = [];
  if (!manifest.name) problems.push('name 缺失（kebab-case 字符串，如 notify-plugin）');
  else if (!/^[a-z][a-z0-9-]{0,31}$/.test(manifest.name)) {
    problems.push(`name 非法：${manifest.name}（需小写 kebab-case，字母/数字/连字符）`);
  }
  if (!manifest.version) problems.push('version 缺失（semver 如 1.0.0）');
  else if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    problems.push(`version 非法：${manifest.version}（需 x.y.z，如 1.0.0）`);
  }
  if (!manifest.description) problems.push('description 缺失（一句话说明插件做什么）');

  if (ctx.knownServices && manifest.requires) {
    for (const r of manifest.requires) {
      if (!ctx.knownServices.has(r)) {
        problems.push(`requires 引用未知宿主服务：${r}（宿主解析按类名，如 UsersService）`);
      }
    }
  }
  if (ctx.featureFlags && manifest.featureFlag && !ctx.featureFlags.has(manifest.featureFlag)) {
    problems.push(`featureFlag 未知：${manifest.featureFlag}`);
  }
  if (manifest.capabilities && manifest.capabilities.some((c) => !c || !c.trim())) {
    problems.push('capabilities 需为非空字符串数组');
  }
  return problems;
}

/** 扫描 Server-NestJS/src 的宿主服务类名（serviceResolver 按类名解析）。 */
export async function knownHostServices() {
  const names = new Set();
  const srcDir = 'Server-NestJS/src';
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.ts$/.test(e.name) && !/\.spec\.ts$/.test(e.name)) {
        try {
          const content = await readFile(p, 'utf8');
          for (const m of content.matchAll(/\bclass\s+(\w+Service)\b/g)) names.add(m[1]);
        } catch { /* 跳过 */ }
      }
    }
  }
  await walk(srcDir);
  return names;
}

/** 扫描 FEATURE_KEYS 已知特性键。 */
export async function knownFeatureFlags() {
  try {
    const content = await readFile('Server-NestJS/src/feature-flags/feature-flags.constants.ts', 'utf8');
    const block = content.match(/FEATURE_KEYS\s*=\s*\{([\s\S]*?)\}\s*as const/);
    if (!block) return new Set();
    return new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  } catch {
    return new Set();
  }
}

/** verify：宿主外校验插件源文件。 */
async function verifyPlugin(sourcePath) {
  if (!(await exists(sourcePath))) fail(`源文件不存在：${sourcePath}`);
  const source = await readFile(sourcePath, 'utf8');
  const manifestName = extractManifestName(source);
  if (!manifestName) fail('未找到 `export const <NAME>_PLUGIN: PluginManifest`（请按约定导出插件 manifest）');
  const objectText = extractManifestObject(source);
  if (!objectText) fail('无法解析 manifest 对象字面量');

  const manifest = parseManifest(objectText);
  const [services, flags] = await Promise.all([knownHostServices(), knownFeatureFlags()]);
  const inRepo = services.size > 0;
  const problems = validateManifest(manifest, inRepo ? { knownServices: services, featureFlags: flags } : {});

  if (problems.length) {
    console.error(`${C.red}✗ 插件 ${manifestName} 校验未通过（${problems.length} 项）：${C.reset}`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  // 自包含/可移植性提示：宿主相对导入合法但不可移植（作者化插件应自包含）
  const hostImports = findHostRelativeImports(source);
  if (hostImports.length) {
    console.log(`${C.yellow}⚠ 含宿主树相对导入（${hostImports.join(', ')}）：宿主内可编译，但不可移植。${C.reset}`);
    console.log(`  作者化插件建议自包含：不 import 宿主相对路径；manifest 的 PluginManifest 注解可省略（verify 仅做结构校验）`);
  }

  console.log(`${C.green}✓ 插件 ${manifestName}（${manifest.version || '?'}）校验通过${C.reset}`);
  console.log(`  描述：${manifest.description || ''}`);
  if (manifest.requires?.length) console.log(`  依赖宿主服务：${manifest.requires.join(', ')}`);
  if (manifest.featureFlag) console.log(`  特性开关：${manifest.featureFlag}`);
  if (manifest.capabilities?.length) console.log(`  能力：${manifest.capabilities.join(', ')}`);
  if (!inRepo) console.log(`${C.yellow}⚠ 未检测到宿主（在仓库根目录运行才做 requires/featureFlag 一致性校验）${C.reset}`);
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
  if (!manifestName) fail('未找到 `export const <NAME>_PLUGIN(= {...})`（请按约定导出插件 manifest）');
  // add 接线进宿主编译，需确保是 manifest 对象（含 name），而非任意 export const
  const objectText = extractManifestObject(source);
  const parsed = objectText ? parseManifest(objectText) : { name: null };
  if (!parsed.name) fail('manifest 对象缺少 name 字段（`export const X_PLUGIN = { name: "...", ... }`）');

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

// run-as-main 守卫：作为 CLI 运行时执行；被 import（如单测）时仅暴露纯函数
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
    case 'verify':
      if (!arg) fail('用法：keelbase-plugin verify <source.ts>');
      await verifyPlugin(arg);
      break;
    default:
      console.log(`KeelBase 插件 CLI（P1-7）
用法:
  node scripts/keelbase-plugin.mjs add <source.ts>      # 安装源码级插件（复制 + 接线 PLUGINS）
  node scripts/keelbase-plugin.mjs remove <name>        # 卸载（移除接线）
  node scripts/keelbase-plugin.mjs list                 # 列出已接线插件
  node scripts/keelbase-plugin.mjs verify <source.ts>   # 宿主外校验插件（约定/结构/依赖一致性）
插件源文件约定：export const <NAME>_PLUGIN: PluginManifest = {...}`);
  }
}
