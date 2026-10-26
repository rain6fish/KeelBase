#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * Every entity's table — and every column it declares — must be created by a migration committed in
 * this repository.
 *
 * Why: the generator writes an entity for a new module but no migration, so that table reaches dev
 * databases (where `synchronize` builds it) and is missing everywhere else. CI does catch it — the
 * `migration-consistency` job regenerates and looks for a stray file — but that runs after the push,
 * which is how one of these sat red on main for about ten hours (the two modules from `c81232a0`,
 * repaired in `faeb907f`). `npm run check:all` is the pre-push instrument, and a missing migration was
 * not among the things it looked at. This is that look, and it needs no database: which tables and
 * columns a migration creates is right there in its SQL.
 *
 * The column half was added on 2026-10-26 for a gap the table half cannot see: a column added to an
 * existing entity with no migration. Its criterion is one-directional — **a column the entity declares
 * must be created somewhere in the migrations**. The reverse is deliberately not checked: migrations
 * legitimately carry columns the entity no longer declares (drop/rename history), and
 * `migration:generate` owns that direction because it can ask a live database.
 *
 * What it does not check, and the leniencies that keep it from crying wolf:
 *
 *   - Relations (`@ManyToOne` + `@JoinColumn`) are not counted as columns: their foreign-key column is
 *     implicit, so counting them would demand a declaration the entity does not make.
 *   - Embedded columns (`@Column(() => X)`) and decorators it cannot resolve are skipped rather than
 *     guessed; the floors below catch the case where the scan resolved almost nothing.
 *   - `DROP COLUMN` / `DROP TABLE` are not simulated. A column dropped and re-added counts as created,
 *     and a table dropped and re-created pools its columns across both lives. Both make the gate more
 *     lenient, never louder.
 *   - `ALTER TABLE "${table}" ADD "<col>"` (table name chosen at runtime, as in
 *     `1819000000000-AddDataScopeColumns.ts`) cannot be attributed to a table statically, so such a
 *     column name is accepted for any table. Today that is `org_id` / `dept_id` and nothing else.
 *   - It does **not** check that the migration is *registered* (the globs in
 *     `src/config/postgres-migrations.ts`) — a migration that never runs creates nothing. That rule
 *     already has one home, the guard test `postgres-migrations.spec.ts`, which CI runs; this gate
 *     deliberately does not restate it.
 *
 * Anti-vacuous: finding fewer entities, tables or columns than the floors below fails the gate, so a
 * broken regex cannot make it green by seeing nothing — the "did not happen vs did not look" trap this
 * repository keeps hitting (F-10d).
 *
 * 每个实体的表、以及它声明的每一列，都必须有一条**已检入本仓的迁移**来建它。
 *
 * 为什么：生成器为新模块写出实体、却不写迁移，于是那张表只在开发库里有（`synchronize` 建的），别处都缺。
 * CI 确实会逮到 —— `migration-consistency` job 会重生成、看有没有多出文件 —— 但那是在**推送之后**跑，
 * 于是其中一次在 main 上红了约十小时（`c81232a0` 生成的两个模块，`faeb907f` 才修）。而
 * `npm run check:all` 是**推送之前**的那件仪器，它当时不看缺迁移。本闸补的就是这一眼，且不需要数据库：
 * 迁移建了哪些表、哪些列，就写在它的 SQL 里。
 *
 * 「列」这一半是 2026-10-26 补的，为的是「表」那一半看不见的一类：给已存在的实体加了一列却没写迁移。
 * 它的判据是**单向**的 —— **实体声明的列，必须在迁移里被建过**。反向有意不查：迁移里合法地留着实体已不再
 * 声明的列（删列/改名史），而 `migration:generate` 因为能问活库，那个方向归它管。
 *
 * 它不查的东西，以及那些让它不至于乱叫的宽限：
 *
 *   - 关系（`@ManyToOne` + `@JoinColumn`）**不**算列：外键列是隐式的，算进来就等于要求实体做它没做的声明。
 *   - 内嵌列（`@Column(() => X)`）与解析不出的装饰器只跳过、不猜；下面的下限负责兜住「其实什么都没解析到」。
 *   - **不模拟** `DROP COLUMN` / `DROP TABLE`：删了又加回来的列仍算「建过」，删了又重建的表把两段历史的列并在一起。
 *     两者都只让闸**更宽**，不会更吵。
 *   - `ALTER TABLE "${table}" ADD "<col>"`（表名运行期才定，如 `1819000000000-AddDataScopeColumns.ts`）
 *     静态无法归属到某张表，于是该列名**对任何表都算已建**。今天只有 `org_id` / `dept_id` 两个。
 *   - **不**检查迁移是否**已登记**（`src/config/postgres-migrations.ts` 里的 glob）—— 一条从不执行的迁移
 *     什么也建不出来。那条规则已有一个家：守卫单测 `postgres-migrations.spec.ts`（CI 会跑）；本闸有意不复述它。
 *
 * 防真空通过：实体数、表数或列数低于下面的下限即判失败，于是一条写坏的正则**不能**靠「什么都没找到」
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

// Floors, not expectations: today this tree has 70 entities, 709 declared columns, 105 tables and
// 1041 columns created across its migrations. They exist to catch "the scan saw nothing", so they sit
// well below the real numbers and only move when the repository genuinely shrinks past them.
// 下限，不是期望值：今天这棵树有 70 个实体、709 个已声明列，迁移里建过 105 张表与 1041 列。它们为「扫了个空」
// 而立，故远低于真实数字；只有当仓库真的缩到下面时才需要动。
const MIN_ENTITIES = 50;
const MIN_CREATED_TABLES = 80;
const MIN_ENTITY_COLUMNS = 600;
const MIN_CREATED_COLUMNS = 800;

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

/**
 * Index of the parenthesis that closes the one at `openIdx`, or -1. SQL bodies nest (`PRIMARY KEY
 * ("id")`, `DEFAULT (datetime('now'))`), so counting is the only cheap way in.
 * 返回与 `openIdx` 处左括号配对的右括号位置；SQL 正文会嵌套，只能靠计数。
 */
function closingParen(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** Decorators that declare a database column. Relations are deliberately absent (see the header). */
const COLUMN_DECORATORS = [
  'Column',
  'PrimaryGeneratedColumn',
  'PrimaryColumn',
  'CreateDateColumn',
  'UpdateDateColumn',
  'DeleteDateColumn',
  'VersionColumn',
];
// Anchored at line start so a commented-out `// @Column(...)` is not mistaken for a declaration.
// 锚定行首：`// @Column(...)` 这种被注释掉的声明不算数。
const COLUMN_DECORATOR_RE = new RegExp(`^[ \\t]*@(${COLUMN_DECORATORS.join('|')})\\s*\\(`, 'gm');

/**
 * The property a decorator applies to, skipping any decorators stacked between them
 * (`@Column(...)` and `@Index(...)` are routinely written one above the other).
 * 找到装饰器所修饰的属性名；`@Column` 与 `@Index` 上下叠写是常见写法，中间的装饰器要跳过。
 */
function decoratedProperty(text, from) {
  let i = from;
  for (;;) {
    const skip = /^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.exec(text.slice(i));
    if (skip) {
      i += skip[0].length;
      continue;
    }
    if (text[i] === '@') {
      const open = text.indexOf('(', i);
      const close = open < 0 ? -1 : closingParen(text, open);
      if (close < 0) return null;
      i = close + 1;
      continue;
    }
    break;
  }
  return text.slice(i).match(/^([A-Za-z_$][\w$]*)/)?.[1] ?? null;
}

const byTable = new Map(); // table name → [entity files]
const columnsByEntityTable = new Map(); // table name → Map(column name → entity file)
const unresolved = [];

for (const f of entityFiles(SRC)) {
  const src = fs.readFileSync(f, 'utf8');
  // `name` need not be the first property: `@Entity({ schema: 'public', name: 'users' })` is valid.
  // `name` 不必是第一个属性：`@Entity({ schema: 'public', name: 'users' })` 同样合法。
  const named = src.match(/@Entity\(\s*\{[^}]*\bname:\s*["']([^"']+)["']/);
  const shorthand = src.match(/@Entity\(\s*["']([^"']+)["']/);
  const name = named?.[1] ?? shorthand?.[1];
  if (!name) {
    unresolved.push(`${rel(f)} —— 这个 @Entity 没有显式表名，本闸看不见它`);
    continue;
  }
  byTable.set(name, [...(byTable.get(name) ?? []), rel(f)]);

  const cols = columnsByEntityTable.get(name) ?? new Map();
  for (const m of src.matchAll(COLUMN_DECORATOR_RE)) {
    const open = m.index + m[0].length - 1;
    const close = closingParen(src, open);
    if (close < 0) {
      unresolved.push(`${rel(f)} —— ${m[1]} 的括号不配对`);
      continue;
    }
    const args = src.slice(open + 1, close);
    const prop = decoratedProperty(src, close + 1);
    if (!prop) {
      unresolved.push(`${rel(f)} —— @${m[1]} 下面找不到属性名`);
      continue;
    }
    if (/^\s*\(\s*\)\s*=>/.test(args)) continue; // embedded column：静态展开不了，跳过
    // TypeORM's default naming strategy is in force (no `namingStrategy` is configured), so the
    // property name IS the column name unless the decorator renames it.
    // 本项目未配 `namingStrategy`，故除装饰器显式改名外，属性名即列名。
    cols.set(args.match(/\bname:\s*['"]([^'"]+)['"]/)?.[1] ?? prop, rel(f));
  }
  columnsByEntityTable.set(name, cols);
}

// ── migrations ────────────────────────────────────────────────────────────────
const migrationFiles = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => path.join(MIGRATIONS, f));

// Hand-written migrations split one statement over concatenated template literals (`` `...(` + `...` ``),
// which would otherwise cut a CREATE TABLE body in half. Joining them is safe for a text scan.
// 手写迁移会把一条语句拆成相邻的模板字面量（`` `...(` + `...` ``），不拼回来就会把 CREATE TABLE 正文劈成两半。
const sql = migrationFiles
  .map((f) => fs.readFileSync(f, 'utf8').replace(/`\s*\+\s*`/g, ''))
  .join('\n');

const created = new Map(); // table name → Set(column)
const addColumn = (table, column) => {
  const set = created.get(table) ?? new Set();
  set.add(column);
  created.set(table, set);
};

/** First identifier of a CREATE TABLE body item: `"id" SERIAL`, or the unquoted `id integer`. */
const bodyColumn = (item) => {
  const t = item.trim();
  if (/^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|KEY|INDEX)\b/i.test(t)) return null;
  return t.match(/^"([^"]+)"/)?.[1] ?? t.match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? null;
};

const createdTables = [];
const CREATE_RE = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"([^"]+)"\s*\(/g;
for (const m of sql.matchAll(CREATE_RE)) {
  const table = m[1];
  createdTables.push(table);
  const open = m.index + m[0].length - 1;
  const close = closingParen(sql, open);
  if (close < 0) {
    unresolved.push(`迁移里 CREATE TABLE "${table}" 的括号不配对`);
    continue;
  }
  const body = sql.slice(open + 1, close);
  let depth = 0;
  let item = '';
  const items = [];
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      items.push(item);
      item = '';
    } else item += ch;
  }
  items.push(item);
  for (const it of items) {
    const col = bodyColumn(it);
    if (col) addColumn(table, col);
  }
}

// ALTER TABLE "t" ADD [COLUMN] [IF NOT EXISTS] "c" — the quoted name also excludes `ADD CONSTRAINT`.
// ALTER TABLE "t" ADD [COLUMN] [IF NOT EXISTS] "c" —— 带引号同时排除了 `ADD CONSTRAINT`。
const ADD_RE = /ALTER TABLE\s+"([^"]+)"\s+ADD\s+(?:COLUMN\s+)?(?:IF NOT EXISTS\s+)?"([^"]+)"/g;
for (const m of sql.matchAll(ADD_RE)) addColumn(m[1], m[2]);

// Table name chosen at runtime: the column cannot be attributed, so accept it for every table.
// 表名运行期才定：列归属不了，于是对任何表都算已建。
const dynamicColumns = new Set();
const DYNAMIC_ADD_RE = /ALTER TABLE\s+"?\$\{[^}]+\}"?\s+ADD\s+(?:COLUMN\s+)?(?:IF NOT EXISTS\s+)?"([^"]+)"/g;
for (const m of sql.matchAll(DYNAMIC_ADD_RE)) dynamicColumns.add(m[1]);

/** Renames are treated as one table's lives: `events` ↔ `temporary_events` pool their columns. */
const parent = new Map();
const find = (x) => {
  if (!parent.has(x)) parent.set(x, x);
  let r = x;
  while (parent.get(r) !== r) r = parent.get(r);
  return r;
};
for (const m of sql.matchAll(/ALTER TABLE\s+"([^"]+)"\s+RENAME TO\s+"([^"]+)"/g)) {
  const a = find(m[1]);
  const b = find(m[2]);
  if (a !== b) parent.set(a, b);
}

const columnsByRoot = new Map();
for (const [table, cols] of created) {
  const root = find(table);
  const pool = columnsByRoot.get(root) ?? new Set();
  for (const c of cols) pool.add(c);
  columnsByRoot.set(root, pool);
}
const columnsOfTable = (table) => columnsByRoot.get(find(table)) ?? new Set();

// ── checks ────────────────────────────────────────────────────────────────────
const failures = [];

if (byTable.size < MIN_ENTITIES) {
  failures.push(`只扫到 ${byTable.size} 个实体（下限 ${MIN_ENTITIES}）—— 扫描面写坏了？`);
}
const createdTableSet = new Set(createdTables);
if (createdTableSet.size < MIN_CREATED_TABLES) {
  failures.push(`只扫到 ${createdTableSet.size} 张迁移建过的表（下限 ${MIN_CREATED_TABLES}）—— 扫描面写坏了？`);
}
failures.push(...unresolved);

let entityColumnCount = 0;
for (const [table, files] of byTable) {
  if (!createdTableSet.has(table)) {
    failures.push(`表 "${table}"（${files.join(', ')}）没有任何已检入的迁移建它`);
  }
  const declared = columnsByEntityTable.get(table) ?? new Map();
  entityColumnCount += declared.size;
  if (declared.size === 0) {
    failures.push(`表 "${table}"（${files.join(', ')}）一列都没解析出来 —— 本闸看不见它的列`);
    continue;
  }
  const createdCols = columnsOfTable(table);
  for (const [col, file] of declared) {
    if (!createdCols.has(col) && !dynamicColumns.has(col)) {
      failures.push(`列 "${table}"."${col}"（${file}）没有任何已检入的迁移建它`);
    }
  }
}

const createdColumnCount = [...created.values()].reduce((n, s) => n + s.size, 0);
if (entityColumnCount < MIN_ENTITY_COLUMNS) {
  failures.push(`只扫到 ${entityColumnCount} 个实体列（下限 ${MIN_ENTITY_COLUMNS}）—— 扫描面写坏了？`);
}
if (createdColumnCount < MIN_CREATED_COLUMNS) {
  failures.push(`迁移里只扫到 ${createdColumnCount} 列（下限 ${MIN_CREATED_COLUMNS}）—— SQL 解析写坏了？`);
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
  `[entity-migrations] ${byTable.size} 个实体的表都有迁移建过（迁移 ${migrationFiles.length} 份，建过 ` +
    `${createdTableSet.size} 张表 / ${createdColumnCount} 列）；${entityColumnCount} 个实体列都在迁移里被建过 ✓`,
);
