#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * Every entity's table must be created by a migration committed in this repository.
 *
 * Why: the generator writes an entity for a new module but no migration, so that table reaches dev
 * databases (where `synchronize` builds it) and is missing everywhere else. CI does catch it — the
 * `migration-consistency` job regenerates and looks for a stray file — but that runs after the push,
 * which is how one of these sat red on main for about ten hours (the two modules from `c81232a0`,
 * repaired in `faeb907f`). `npm run check:all` is the pre-push instrument, and a missing migration was
 * not among the things it looked at. This is that look, and it needs no database: which tables a
 * migration creates is right there in its SQL.
 *
 * What it does not check: that the migration is *registered* (the globs in
 * `src/config/postgres-migrations.ts`) — a migration that never runs creates nothing. That rule already
 * has one home, the guard test `postgres-migrations.spec.ts`, which CI runs; this gate deliberately
 * does not restate it.
 *
 * Anti-vacuous: finding fewer entities or fewer created tables than the floors below fails the gate, so
 * a broken regex cannot make it green by seeing nothing — the "did not happen vs did not look" trap
 * this repository keeps hitting (F-10d).
 *
 * 每个实体的表都必须有一条**已检入本仓的迁移**来建它。
 *
 * 为什么：生成器为新模块写出实体、却不写迁移，于是那张表只在开发库里有（`synchronize` 建的），别处都缺。
 * CI 确实会逮到 —— `migration-consistency` job 会重生成、看有没有多出文件 —— 但那是在**推送之后**跑，
 * 于是其中一次在 main 上红了约十小时（`c81232a0` 生成的两个模块，`faeb907f` 才修）。而
 * `npm run check:all` 是**推送之前**的那件仪器，它当时不看缺迁移。本闸补的就是这一眼，且不需要数据库：
 * 迁移建了哪些表，就写在它的 SQL 里。
 *
 * 它**不**检查：迁移是否**已登记**（`src/config/postgres-migrations.ts` 里的 glob）—— 一条从不执行的
 * 迁移什么也建不出来。那条规则已有一个家：守卫单测 `postgres-migrations.spec.ts`（CI 会跑）；本闸有意
 * 不复述它。
 *
 * 防真空通过：实体数或「建过的表」数低于下面的下限即判失败，于是一条写坏的正则**不能**靠「什么都没找到」
 * 让本闸变绿（「没发生 vs 没看见」同形，本仓吃过这个亏，见 F-10d）。
 *
 * 用法：node scripts/check-entity-migrations.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'Server-NestJS/src');
const MIGRATIONS = path.join(SRC, 'migrations');

// Floors, not expectations: today this tree has 67 entities and 102 tables created across its
// migrations. They exist to catch "the scan saw nothing", so they sit well below the real numbers and
// only move when the repository genuinely shrinks past them.
// 下限，不是期望值：今天这棵树有 67 个实体、迁移里建过 102 张表。它们为「扫了个空」而立，故远低于真实
// 数字；只有当仓库真的缩到下面时才需要动。
const MIN_ENTITIES = 50;
const MIN_CREATED_TABLES = 80;

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/** Every `*.entity.ts` under src/, skipping build output and dependencies. */
function entityFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) entityFiles(p, out);
    else if (e.name.endsWith('.entity.ts')) out.push(p);
  }
  return out;
}

const entities = entityFiles(SRC);
const byTable = new Map(); // table name → [files]
const unnamed = [];
for (const f of entities) {
  const s = fs.readFileSync(f, 'utf8');
  const named = s.match(/@Entity\(\s*\{?\s*name:\s*["']([^"']+)["']/);
  const shorthand = s.match(/@Entity\(\s*["']([^"']+)["']/);
  const name = named?.[1] ?? shorthand?.[1];
  if (!name) {
    unnamed.push(rel(f));
    continue;
  }
  byTable.set(name, [...(byTable.get(name) ?? []), rel(f)]);
}

const created = new Map(); // table name → [migration files]
for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.ts'))) {
  const s = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
  for (const m of s.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"([^"]+)"/g)) {
    created.set(m[1], [...(created.get(m[1]) ?? []), f]);
  }
}

const failures = [];

if (entities.length < MIN_ENTITIES) {
  failures.push(`只扫到 ${entities.length} 个实体（下限 ${MIN_ENTITIES}）—— 扫描面写坏了？`);
}
if (created.size < MIN_CREATED_TABLES) {
  failures.push(`只扫到 ${created.size} 张迁移建过的表（下限 ${MIN_CREATED_TABLES}）—— 扫描面写坏了？`);
}
for (const f of unnamed) {
  failures.push(`${f} —— 这个 @Entity 没有显式表名，本闸看不见它`);
}
for (const [table, files] of byTable) {
  if (!created.has(table)) {
    failures.push(`表 "${table}"（${files.join(', ')}）没有任何已检入的迁移建它`);
  }
}

if (failures.length > 0) {
  console.error(`\n[entity-migrations] ${failures.length} 处未过：\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    `\n补一条迁移：\`cd Server-NestJS && npm run migration:generate -- src/migrations/AddXxx\`，` +
      `再按 src/config/postgres-migrations.ts 的说明登记它。\n` +
      `Add the migration with \`npm run migration:generate\` and register it in src/config/postgres-migrations.ts.\n`,
  );
  process.exit(1);
}

console.log(
  `[entity-migrations] ${byTable.size} 个实体的表都有迁移建过（迁移 ${fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.ts')).length} 份，建过 ${created.size} 张表）✓`,
);
