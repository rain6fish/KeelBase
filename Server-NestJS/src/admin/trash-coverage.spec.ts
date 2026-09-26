// SPDX-License-Identifier: Apache-2.0

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { TRASH_EXEMPT_ENTITY_NAMES } from './admin.service';

/**
 * The trash derives its type set from TypeORM metadata, so "whatever can be soft-deleted can be
 * restored" holds **by construction** — as long as the entity is registered with the connection.
 * An entity that declares `@DeleteDateColumn` but never reaches a `TypeOrmModule.forFeature([...])`
 * is invisible to that derivation, and the gap reopens silently: the row is soft-deleted, stays in
 * the database, and has no way back. That is the one hole derivation cannot close by itself.
 *
 * So this spec closes it from the source: it finds every entity declaring `@DeleteDateColumn` and
 * requires each to be registered — or to be listed in the (empty) exemption list, which is a
 * deliberate decision about finality rather than an oversight.
 *
 * 回收站的类型集合由 TypeORM 元数据派生，所以「能软删的就能恢复」**由构造成立** —— 只要该实体注册
 * 进了连接。一个声明了 `@DeleteDateColumn` 却从未出现在 `TypeOrmModule.forFeature([...])` 里的实体，
 * 对那条派生是不可见的，缺口便无声地重新张开：行被软删、留在库里、没有回头路。这是派生自身堵不上的
 * 唯一一个洞。
 *
 * 所以由这条 spec 从源码堵：找出所有声明 `@DeleteDateColumn` 的实体，要求每一个都已注册 —— 或者列进
 * 那份（今天为空的）豁免清单，而后者是有意作出的终局性决定，不是疏忽。
 */

const SRC = resolve(__dirname, '..');

/** Every file under `src/` whose name says it holds an entity. */
/* src/ 下文件名表明它装着实体的每一个文件。 */
function entityFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...entityFiles(full));
    } else if (entry.endsWith('.entity.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Entity classes that declare a soft-delete column, by class name. */
/* 声明了软删列的实体类，按类名。 */
function softDeletableClasses(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of entityFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('@DeleteDateColumn')) continue;
    const cls = /export class (\w+)/.exec(src);
    if (cls) found.set(cls[1], relative(SRC, file));
  }
  return found;
}

/** Entity classes registered through `TypeOrmModule.forFeature([...])` anywhere in `src/`. */
/* src/ 里经 `TypeOrmModule.forFeature([...])` 注册过的实体类。 */
function registeredClasses(): Set<string> {
  const registered = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts')) continue;
      const src = readFileSync(full, 'utf8');
      for (const m of src.matchAll(/forFeature\(\s*\[([\s\S]*?)\]/g)) {
        for (const name of m[1].split(',')) {
          const trimmed = name.trim();
          if (/^\w+$/.test(trimmed)) registered.add(trimmed);
        }
      }
    }
  };
  walk(SRC);
  return registered;
}

describe('回收站覆盖面 · 软删与可恢复成对', () => {
  const soft = softDeletableClasses();
  const registered = registeredClasses();

  it('扫描本身有效：确实找到了软删实体，也确实找到了注册（否则这条断言恒真）', () => {
    // 一条永远为真的门禁等于没有门禁 —— 先证明两边都扫到了东西。
    expect(soft.size).toBeGreaterThan(0);
    expect(registered.size).toBeGreaterThan(0);
  });

  it('每个带 @DeleteDateColumn 的实体都已注册进连接（否则回收站看不见它、行就无路可回）', () => {
    const invisible = [...soft.entries()]
      .filter(([cls]) => !registered.has(cls) && !TRASH_EXEMPT_ENTITY_NAMES.includes(cls))
      .map(([cls, file]) => `${cls} (${file})`);

    expect(invisible).toEqual([]);
  });
});
