#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 前端边界门禁（FE-1-repo / ADR-0002 Rev-8）。
 *
 * 抽净 Frontend → Runtime 依赖边界：前端 / 旗舰 / 应用模板只消费稳定契约面
 * （wire Contract v1 + `/app/capabilities` + `/app/provenance`），不得：
 *   1. import 其它仓库代码（Server-NestJS 源码 / 其它前端目录）——跨 Runtime 边界靠契约，不靠代码引用；
 *   2. 按 runtime 语言身份分支（`if (runtime)` / `runtime === '…'`）——按能力分支，runtime id 仅留 provenance 观测。
 *
 * 与 scripts/check-core-boundary.mjs（Core→UI 反向）配对；统一前端 ≠ 拆独立仓库（主库内抽净边界）。
 * 零依赖（node:fs + node:path），CI 接入：npm run check:frontend-boundary
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** 前端 / 旗舰 / 生成器前端模板的源码根。 */
const ROOTS = [
  'Front-Flutter/lib',
  'Front-Taro/src',
  'Web-Admin-Vue/src',
  'Web-Admin-React/src',
];
/** 生成器前端模板（Build 侧，产出前端代码 → 同受边界约束）。 */
const EXTRA_FILES = ['scripts/generator/templates-frontend.mjs'];

/** 跨仓引用片段（import 其它仓库代码即违约）。 */
const REPO_FRAGMENTS = [
  'Server-NestJS',
  'Front-Flutter',
  'Front-Taro',
  'Web-Admin-Vue',
  'Web-Admin-React',
];

/** runtime 语言身份分支（禁）：`if (runtime)` / `if (isJavaRuntime)` 及 `<x>runtime === '字面量'`。 */
const RUNTIME_BRANCH_PATTERNS = [
  /\bif\s*\(\s*[A-Za-z_$]*[Rr]untime\s*\)/,
  /[A-Za-z_$]*[Rr]untime\s*(?:===|!==|==|!=)\s*['"]/,
];

const SOURCE_EXT = /\.(dart|ts|tsx|js|jsx|mjs|vue)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.dart_tool', 'unpackage', 'coverage', '.turbo']);

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const errors = [];

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (SOURCE_EXT.test(e.name)) out.push(p);
  }
  return out;
}

/** 该文件所属的仓库目录片段（用于排除「自身目录名」的误报）。 */
function ownerFragment(file) {
  const rel = relative(process.cwd(), file).split(/[\\/]/);
  return rel.find((seg) => REPO_FRAGMENTS.includes(seg)) ?? null;
}

function checkImports(file, content) {
  const owner = ownerFragment(file);
  for (const frag of REPO_FRAGMENTS) {
    if (frag === owner) continue; // 自身项目目录名（如自引用路径）不算跨仓
    const esc = escapeRegExp(frag);
    const patterns = [
      // TS/JS：from '…' / import('…') / require('…')
      new RegExp(`from\\s+['"][^'"]*${esc}[^'"]*['"]`),
      new RegExp(`(?:import|require)\\s*\\(\\s*['"][^'"]*${esc}[^'"]*['"]`),
      // Dart：import '…' / export '…'（行首）
      new RegExp(`^\\s*(?:import|export)\\s+['"][^'"]*${esc}[^'"]*['"]`, 'm'),
    ];
    if (patterns.some((re) => re.test(content))) {
      errors.push(`前端边界违规：跨仓引用「${frag}」：${relative(process.cwd(), file)}`);
    }
  }
}

function checkRuntimeBranch(file, content) {
  for (const re of RUNTIME_BRANCH_PATTERNS) {
    const m = re.exec(content);
    if (m) {
      errors.push(`前端边界违规：runtime 语言身份分支「${m[0].trim()}」：${relative(process.cwd(), file)}（ADR-0002 Rev-8：按能力分支，禁 if(runtime)）`);
    }
  }
}

async function collectFiles() {
  const files = [];
  for (const rel of ROOTS) {
    try {
      files.push(...(await walk(join(process.cwd(), rel))));
    } catch (e) {
      errors.push(`前端根无法遍历「${rel}」：${e.message}`);
    }
  }
  files.push(...EXTRA_FILES.map((f) => join(process.cwd(), f)));
  return files;
}

const files = await collectFiles();
for (const file of files) {
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch (e) {
    errors.push(`读取失败（${relative(process.cwd(), file)}）：${e.message}`);
    continue;
  }
  checkImports(file, content);
  checkRuntimeBranch(file, content);
}

if (errors.length > 0) {
  console.error(`✗ 前端边界门禁未通过（${errors.length} 项）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ 前端边界门禁通过：${files.length} 文件无跨仓引用、无 runtime 身份分支`);
