#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 导航对账门（CE-2 缺口 PC-6）：后端 AI 导航映射 ↔ 客户端路由，双向对账。
 *
 *   1. 无死链：后端导航 route 必须存在于客户端路由（否则 AI 跳到 404）
 *   2. 无孤页：客户端顶层页必须可由 AI 导航（或显式登记 ALLOWLIST——把「有意不让 AI 导航」
 *      变成显式决策，而非默认盲区）
 *
 * 四源（解析前统一剥离注释，防注释里的示例 route 误报）：
 *   - Server-NestJS/src/ai/constants/admin-pages.ts    ADMIN_PAGE_ROUTES（管理台后端映射）
 *   - Web-Admin-Vue/src/router/routes.ts                consoleChildren（管理台客户端）
 *   - Server-NestJS/src/ai/tools/navigate-page.tool.ts  PAGE_ROUTES（App 后端映射）
 *   - Front-Flutter/lib/core/router/app_router.dart     App 客户端路由
 *
 * 零依赖（node:fs）。CI：node scripts/check-navigation-parity.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const norm = (p) => p.replace(/^\/+/, '').replace(/\/+$/, '');
const lastSeg = (p) => norm(p).split('/').filter(Boolean).pop() ?? '';
/** `{ route: '...' }`（映射表项） */
const routesOf = (src) => [...src.matchAll(/\{\s*route:\s*'([^']+)'/g)].map((m) => m[1]);
/** `path: '...'`（路由项；允许空串——索引路由 path: ''） */
const pathsOf = (src) => [...src.matchAll(/path:\s*'([^']*)'/g)].map((m) => m[1]);

/** 有意不让 AI 导航的客户端页（显式决策，非默认盲区）。 */
const ALLOWLIST_ADMIN = [];
const ALLOWLIST_APP = ['splash', 'onboarding', 'login', 'register', 'forgot-password', 'reset', 'verify-email'];

const errors = [];
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// ─────────────────────────── 管理台 ───────────────────────────
const adminRoutes = new Set(routesOf(strip(read('Server-NestJS/src/ai/constants/admin-pages.ts'))).map(norm));
const vueFull = read('Web-Admin-Vue/src/router/routes.ts');
const open = vueFull.indexOf('[', vueFull.indexOf('consoleChildren'));
const consoleBody = strip(vueFull.slice(open, vueFull.indexOf('\n]', open)));
const vuePaths = new Set(pathsOf(consoleBody).map(norm).filter((p) => !p.includes(':')));

for (const r of adminRoutes) {
  if (!vuePaths.has(r)) errors.push(`死链（管理台）：ADMIN_PAGE_ROUTES 指向 '${r}'，但 Vue consoleChildren 无此路由`);
}
for (const p of vuePaths) {
  if (!adminRoutes.has(p) && !ALLOWLIST_ADMIN.includes(p)) {
    errors.push(`孤页（管理台）：Vue console '${p}' 未登记进 ADMIN_PAGE_ROUTES（AI 到不了；如属有意，加入 ALLOWLIST_ADMIN）`);
  }
}

// ─────────────────────────── App ───────────────────────────
const pageRoutes = new Set(routesOf(strip(read('Server-NestJS/src/ai/tools/navigate-page.tool.ts'))).map(norm));
const dartAll = pathsOf(strip(read('Front-Flutter/lib/core/router/app_router.dart')));
// 顶层绝对路由（非参数）——孤页检查用
const dartAbs = new Set(dartAll.filter((p) => p.startsWith('/')).map(norm).filter((p) => !p.includes(':')));
// 末段集合——死链检查用（Flutter 有嵌套子路由，如 '/profile' 由父 '/' + 子 'profile' 合成，文本层只认末段）
const dartSegs = new Set(dartAll.map(lastSeg).filter(Boolean));

for (const r of pageRoutes) {
  const present = r === '' ? dartAbs.has('') : dartAbs.has(r) || dartSegs.has(lastSeg(r));
  if (!present) errors.push(`死链（App）：PAGE_ROUTES 指向 '${r}'，但 Flutter app_router 无此路由`);
}
for (const p of dartAbs) {
  if (!pageRoutes.has(p) && !ALLOWLIST_APP.includes(p)) {
    errors.push(`孤页（App）：Flutter 顶层路由 '${p}' 未登记进 PAGE_ROUTES（AI 到不了；如属有意，加入 ALLOWLIST_APP）`);
  }
}

// 防真空通过：两侧都是从源码正则解析出的集合——若引用格式被重构（引号/写法变化），集合会变空，
// 双向循环各自「零迭代」，门禁便打出「✓ 0 ↔ 0」假绿。任一集合为空即视为解析失败。
for (const [label, set] of [
  ['ADMIN_PAGE_ROUTES', adminRoutes],
  ['Vue consoleChildren 路由', vuePaths],
  ['PAGE_ROUTES', pageRoutes],
  ['Flutter 顶层路由', dartAbs],
]) {
  if (set.size === 0) errors.push(`解析为空（${label}）——源格式可能已变，对账不应真空通过（检查解析正则/源文件）`);
}

if (errors.length > 0) {
  console.error(`✗ 导航对账门禁未通过（${errors.length} 项）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `✓ 导航对账门禁通过：管理台 ${adminRoutes.size} 导航 ↔ ${vuePaths.size} 页 · App ${pageRoutes.size} 导航 ↔ ${dartAbs.size} 顶层页（双向对齐）`,
);
