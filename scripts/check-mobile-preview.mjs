#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 移动预览可运行性门禁（/mobile）。
 *
 * Flutter web 产物被拷进静态树的 `mobile/` 子目录，运行时挂在 `/mobile`。下面三件事缺任何一件，
 * 页面都会停在 Loading，**且服务端不报任何错**——只在浏览器里白屏，所以必须机器判定：
 *
 *   1. 挂载基路径：`flutter build web` 默认产出 `<base href="/">`，浏览器于是向根路径取
 *      `flutter_bootstrap.js`（而根路径回的是工作台 HTML）→ 构建必须带 `--base-href=/mobile/`。
 *   2. 自托管资源：默认从 gstatic CDN 取 CanvasKit 与字体，而本应用 CSP 是 `default-src 'self'`，
 *      CDN 请求会被拦 → 构建必须带 `--no-web-resources-cdn`（canvaskit/ 与字体随产物一起发）。
 *   3. 运行时 CSP：CanvasKit 是 WebAssembly，CSP 下编译 wasm 需要 `'wasm-unsafe-eval'`
 *      （`src/main.ts` 的 helmet 配置）；缺它时连 8 字节的最小 wasm 都编译不了。
 *
 * 前两项是构建参数，第三项是服务端响应头——三者都由这里守着，因为它们只在浏览器里现形。
 * 2026-09-22/23 两次踩到：先是基路径（陌生人冷跑报告），后是 CSP（单容器实测）。
 *
 * 零依赖（node:fs + node:path），接入：npm run check:mobile-preview
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
/** 可能承载构建命令的位置（不含 docs：散文提及构建命令不算构建点，避免门禁误报）。 */
const SITES = ['scripts', 'deploy', '.github/workflows'];
const ROOT_FILES = ['Dockerfile', 'Dockerfile.single', 'Makefile'];
const SCAN_EXT = ['.sh', '.bash', '.yml', '.yaml', '.mjs', '.js', '.ts'];

const CMD_RE = /flutter build web/;
/** 构建参数：挂载基路径、自托管 web 资源。 */
const FLAGS = ['--base-href=/mobile/', '--no-web-resources-cdn'];
/** 已构建产物：存在则顺带校验（CI 在 flutter build 之后跑时命中）。 */
const ARTIFACT = 'Front-Flutter/build/web/index.html';
const ARTIFACT_BOOTSTRAP = 'Front-Flutter/build/web/flutter_bootstrap.js';
/** 运行时 CSP：wasm 编译许可（helmet 配置所在文件）。 */
const CSP_FILE = 'Server-NestJS/src/main.ts';
const CSP_MARKER = "'wasm-unsafe-eval'";

/** 本文件自身的注释与正则字面量含同样的字面量，不参与判定。 */
const SELF = 'scripts/check-mobile-preview.mjs';

const problems = [];

async function scanFile(path) {
  if (path === SELF) return;
  const isShell = /\.(sh|bash)$/.test(path);
  const text = await readFile(join(ROOT, path), 'utf8');
  text.split('\n').forEach((line, i) => {
    if (!CMD_RE.test(line)) return;
    if (line.trim().startsWith('#')) return;
    const missing = FLAGS.filter((flag) => !line.includes(flag));
    if (missing.length > 0) {
      problems.push(`${path}:${i + 1} 构建命令缺少 ${missing.join(' ')}\n    ${line.trim()}`);
    }
    // Git Bash 会把形如 `--base-href=/mobile/` 里以 / 开头的值改写成 Windows 路径，
    // flutter 于是报「should start and end with /」且不产出（2026-09-22 实测）。
    // 故 shell 脚本里必须禁用该转换，否则本机构建静默失败、镜像里没有可用产物。
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

// 运行时 CSP：helmet 必须放行 wasm 编译，否则 CanvasKit 永远起不来
try {
  const mainTs = await readFile(join(ROOT, CSP_FILE), 'utf8');
  if (!mainTs.includes(CSP_MARKER)) {
    problems.push(
      `${CSP_FILE} 的 CSP 未授予 ${CSP_MARKER}——CanvasKit 是 WebAssembly，被拦则 /mobile 白屏`,
    );
  }
} catch {
  /* 文件不存在（如裁剪过的检出）则跳过 */
}

// 产物校验：构建过 Flutter web 时才判定，避免本地未构建时误红。
try {
  const html = await readFile(join(ROOT, ARTIFACT), 'utf8');
  if (!html.includes('base href="/mobile/"')) {
    const found = html.match(/<base href="([^"]*)">/)?.[1] ?? '（无 base 标签）';
    problems.push(
      `${ARTIFACT} 的 base href 为 ${found}，应为 /mobile/\n` +
        `    该产物被挂到 /mobile，需重新构建：cd Front-Flutter && flutter build web --base-href=/mobile/ --no-web-resources-cdn`,
    );
  }
  const bootstrap = await readFile(join(ROOT, ARTIFACT_BOOTSTRAP), 'utf8');
  if (!bootstrap.includes('"useLocalCanvasKit":true')) {
    problems.push(
      `${ARTIFACT_BOOTSTRAP} 未自托管 CanvasKit（缺 useLocalCanvasKit）——` +
        `该产物仍会去 gstatic 取，被 CSP 拦后白屏；请带 --no-web-resources-cdn 重新构建`,
    );
  }
} catch {
  /* 未构建，跳过产物校验 */
}

if (problems.length > 0) {
  console.error('✗ 移动预览门禁未通过：\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\n说明：三者缺一都会让 /mobile 停在 Loading，且服务端不报错——只在浏览器里白屏。');
  process.exit(1);
}

console.log('✓ 移动预览门禁通过（基路径 + 自托管资源 + CSP 允许 wasm）');
