#!/usr/bin/env node
/**
 * 为仓库源码文件补齐 Apache-2.0 SPDX 许可头（幂等，可重复执行）。
 *
 * 用法：
 *   node scripts/add-license-headers.mjs          # 应用：给缺失文件加头
 *   node scripts/add-license-headers.mjs --check  # 检查：有缺失即列出并退出 1
 *
 * 规则：
 *   - 目标扩展名按注释语法分派：//（ts/tsx/js/mjs/cjs/dart）、#（py/sh）、<!-- -->（vue）
 *   - shebang 文件（js/mjs/py/sh）许可头插入到 shebang 之后
 *   - UTF-8 BOM 保持在文件最前
 *   - 已含 SPDX-License-Identifier 的文件跳过（幂等）
 *   - 排除构建/依赖/生成目录
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPDX = 'SPDX-License-Identifier: Apache-2.0';

const COMMENT = {
  ts: '//', tsx: '//', js: '//', mjs: '//', cjs: '//', dart: '//',
  py: '#', sh: '#',
};

const SKIP_DIRS = new Set([
  '.git', '.claude', 'node_modules', 'dist', 'build', 'coverage', '.dart_tool',
  '.pub-cache', 'android', 'ios', 'web', 'assets',
]);
const SKIP_PATH_RE = /(^|\/)(generated|lib\/generated)(\/|$)/;
// unplugin 自动生成、会被 dev/build 重新覆盖的 d.ts（gitignored，无需也不宜加头）
const SKIP_FILE_RE = /(auto-imports|components)\.d\.ts$/;

function isTarget(file) {
  const ext = path.extname(file).slice(1);
  return COMMENT[ext] !== undefined || ext === 'vue';
}

function headerFor(ext, hasShebang) {
  if (ext === 'vue') return `<!-- ${SPDX} -->\n`;
  const c = COMMENT[ext];
  if (hasShebang) return `\n${c} ${SPDX}\n`;
  return `${c} ${SPDX}\n\n`;
}

async function walk(dir, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name) || SKIP_PATH_RE.test(e.name) || SKIP_FILE_RE.test(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, out);
    } else if (e.isFile() && isTarget(full)) {
      out.push(full);
    }
  }
}

async function apply(file, onlyCheck) {
  let buf = await fs.readFile(file);
  let bom = '';
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    bom = '﻿';
    buf = buf.subarray(3);
  }
  const content = buf.toString('utf8');
  if (content.includes('SPDX-License-Identifier')) return null;
  const ext = path.extname(file).slice(1);
  const hasShebang = content.startsWith('#!');
  const header = headerFor(ext, hasShebang);
  let result;
  if (hasShebang) {
    const nl = content.indexOf('\n');
    const firstLine = nl === -1 ? content : content.slice(0, nl + 1);
    const rest = nl === -1 ? '' : content.slice(nl + 1);
    result = `${bom}${firstLine}${header}${rest}`;
  } else {
    result = `${bom}${header}${content}`;
  }
  if (onlyCheck) return file;
  await fs.writeFile(file, result, 'utf8');
  return file;
}

async function main() {
  const onlyCheck = process.argv.includes('--check');
  const files = [];
  await walk(ROOT, files);
  const changed = [];
  for (const f of files) {
    const r = await apply(f, onlyCheck);
    if (r) changed.push(r);
  }
  changed.sort();
  if (changed.length === 0) {
    console.log(`OK — ${onlyCheck ? '全部源码文件已含' : '无需修改'} Apache-2.0 许可头（${files.length} 个目标文件）`);
    process.exit(0);
  }
  console.log(`${onlyCheck ? '缺失' : '已加'}许可头 ${changed.length} 个文件:`);
  for (const f of changed) console.log('  ' + path.relative(ROOT, f));
  if (onlyCheck) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
