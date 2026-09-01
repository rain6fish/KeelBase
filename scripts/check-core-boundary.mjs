#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 架构边界门禁（docs/architecture-boundary.md）：
 * 1. Core（Server-NestJS）package.json 不得引入 UI 框架依赖
 * 2. Core src/** 不得 import 前端目录代码
 *
 * 零依赖（node:fs + node:path），CI 接入：npm run check:boundary
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const FORBIDDEN_DEPS = new Set([
  'vue', 'react', 'vuetify', 'element-plus', '@mui/material', '@mui/icons-material',
  'antd', 'angular', '@angular/core', 'svelte',
]);

const FORBIDDEN_IMPORT_FRAGMENTS = [
  'Front-Flutter',
  'Web-Admin-Vue',
  'Web-Admin-React',
  'Front-Taro',
];

/** 完整正则转义（CodeQL js/incomplete-string-encoding：防片段含 .*+?^$()[]{}|\ 时语义被破坏） */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ROOT = join(process.cwd(), 'Server-NestJS');
const errors = [];

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'data' || e.name === 'uploads') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

async function checkPackageJson() {
  let pkg;
  try {
    pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  } catch {
    errors.push('Server-NestJS/package.json 无法读取');
    return;
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const name of Object.keys(deps)) {
    if (FORBIDDEN_DEPS.has(name)) {
      errors.push(`架构边界违规：Core 依赖了 UI 框架「${name}」（docs/architecture-boundary.md §2）`);
    }
  }
}

async function checkSourceImports() {
  const srcDir = join(ROOT, 'src');
  let files;
  try {
    files = await walk(srcDir);
  } catch (e) {
    errors.push(`Server-NestJS/src 无法遍历：${e.message}`);
    return;
  }
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    // 匹配 import 路径里含前端目录的引用（形如 ../Front-Flutter、/Web-Admin-Vue）
    for (const frag of FORBIDDEN_IMPORT_FRAGMENTS) {
      const re = new RegExp(`(from\\s+['"][^'"]*${escapeRegExp(frag)}[^'"]*['"]|import\\s*\\(\\s*['"][^'"]*${escapeRegExp(frag)}[^'"]*['"])`);
      if (re.test(content)) {
        errors.push(`架构边界违规：Core 文件引用了前端路径「${frag}」：${relative(ROOT, file)}`);
      }
    }
  }
}

await checkPackageJson();
await checkSourceImports();

if (errors.length > 0) {
  console.error(`✗ Core 架构边界门禁未通过（${errors.length} 项）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('✓ Core 架构边界门禁通过：无 UI 框架依赖、无前端代码引用');
