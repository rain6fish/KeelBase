#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 移动预览挂载点门禁（Flutter web 的 `--base-href`）。
 *
 * Flutter web 产物被拷进静态树的 `mobile/` 子目录，运行时挂在 `/mobile`：
 *   Dockerfile.single → public/mobile（Nest 静态托管）、Dockerfile → nginx html/mobile、
 *   deploy/demo.sh → $PUBLIC_DIR/mobile。
 * 而 `flutter build web` 默认产出 `<base href="/">`，浏览器于是把 `flutter_bootstrap.js`
 * 解析到根路径 —— 根路径返回的是工作台 index.html，HTML 被当 JS 执行，页面永远停在 Loading。
 *
 * 2026-09-22 由陌生人本地跑通报告定位，线上 demo 实测同因（`/flutter_bootstrap.js` 返回 HTML）。
 * 因此每一处会真正执行、或打印给用户照做的 `flutter build web` 都必须带 `--base-href=/mobile/`；
 * 纯注释行不参与判定。
 *
 * 零依赖（node:fs + node:path），接入：npm run check:mobile-base
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
/** 可能承载构建命令的位置（不含 docs：散文提及构建命令不算构建点，避免门禁误报）。 */
const SITES = ['scripts', 'deploy', '.github/workflows'];
const ROOT_FILES = ['Dockerfile', 'Dockerfile.single', 'Makefile'];
const SCAN_EXT = ['.sh', '.bash', '.yml', '.yaml', '.mjs', '.js', '.ts'];

/** 本文件自身的注释与正则字面量含同样的字面量，不参与判定。 */
const SELF = 'scripts/check-mobile-base.mjs';

const CMD_RE = /flutter build web/;
const FLAG = '--base-href=/mobile/';
/** 已构建产物：存在则顺带校验其 base href（CI 在 flutter build 之后跑时命中）。 */
const ARTIFACT = 'Front-Flutter/build/web/index.html';

const problems = [];

async function scanFile(path) {
  if (path === SELF) return;
  const isShell = /\.(sh|bash)$/.test(path);
  const text = await readFile(join(ROOT, path), 'utf8');
  text.split('\n').forEach((line, i) => {
    if (!CMD_RE.test(line)) return;
    if (line.trim().startsWith('#')) return;
    if (!line.includes(FLAG)) {
      problems.push(`${path}:${i + 1} 构建命令缺少 ${FLAG}\n    ${line.trim()}`);
      return;
    }
    // Git Bash 会把形如 `--base-href=/mobile/` 里以 / 开头的值改写成 Windows 路径，
    // flutter 于是报「should start and end with /」却仍以 0 退出、什么都不产出（2026-09-22 实测）。
    // 故 shell 脚本里必须禁用该转换，否则本机构建静默失败、镜像里没有移动预览。
    if (isShell && !line.includes('MSYS_NO_PATHCONV')) {
      problems.push(
        `${path}:${i + 1} 需加 MSYS_NO_PATHCONV=1（Git Bash 会改写 --base-href 的值，导致构建静默失败）\n    ${line.trim()}`,
      );
    }
  });
}

async function walk(rel) {
  let entries;
  try {
    entries = await readdir(join(ROOT, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = `${rel}/${entry.name}`;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.isDirectory()) await walk(child);
    else if (SCAN_EXT.some((ext) => entry.name.endsWith(ext))) await scanFile(child);
  }
}

for (const site of SITES) await walk(site);
for (const file of ROOT_FILES) {
  try {
    await stat(join(ROOT, file));
    await scanFile(file);
  } catch {
    /* 该文件不存在则跳过 */
  }
}

// 产物校验：构建过 Flutter web 时才判定，避免本地未构建时误红。
try {
  const html = await readFile(join(ROOT, ARTIFACT), 'utf8');
  if (!html.includes('base href="/mobile/"')) {
    const found = html.match(/<base href="([^"]*)">/)?.[1] ?? '（无 base 标签）';
    problems.push(
      `${ARTIFACT} 的 base href 为 ${found}，应为 /mobile/\n` +
        `    该产物被挂到 /mobile，需重新构建：cd Front-Flutter && flutter build web --base-href=/mobile/`,
    );
  }
} catch {
  /* 未构建，跳过产物校验 */
}

if (problems.length > 0) {
  console.error('✗ 移动预览挂载点门禁未通过：\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\n说明：产物挂在 /mobile，构建时必须带 --base-href=/mobile/（shell 里再加 MSYS_NO_PATHCONV=1），');
  console.error('      否则 flutter_bootstrap.js 会被解析到根路径，页面停在 Loading。');
  process.exit(1);
}

console.log('✓ 移动预览挂载点门禁通过（构建点均带 --base-href=/mobile/）');
