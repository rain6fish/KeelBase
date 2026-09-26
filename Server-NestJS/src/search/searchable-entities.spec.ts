// SPDX-License-Identifier: Apache-2.0

import { DataSource, Entity, PrimaryColumn, PrimaryGeneratedColumn, Column } from 'typeorm';
import { resolveSearchableTargets } from './searchable-entities';
import { Book } from '../books/book.entity';

/**
 * An entity with no ownership column — the shape that must be refused rather than searched.
 * Kept here rather than reusing a real module because the point is the *absence* of `userId`,
 * and no shipped entity has that shape.
 *
 * 没有归属列的实体 —— 必须被拒绝、而不是被搜索的那种形状。放在这里而不复用真实模块，因为重点
 * 正是 `userId` 的**缺席**，而现有实体没有这个形状的。
 */
@Entity('audit_snippets')
class AuditSnippet {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 200 })
  note!: string;
}

/** An entity owned by a user but with nothing textual to match. */
/* 有归属者、但没有任何文本可匹配的实体。 */
@Entity('owned_counters')
class OwnedCounter {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @Column({ nullable: true })
  total?: number;
}

/** A second qualifying entity, so manifest order can be observed. */
/* 第二个够格的实体，以便观察清单顺序。 */
@Entity('owned_memos')
class OwnedMemo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 200 })
  body!: string;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;
}

/** Same shape, but keyed by something other than `id`. */
/* 形状相同，但主键不是 `id`。 */
@Entity('owned_slugs')
class OwnedSlug {
  @PrimaryColumn({ length: 64 })
  code!: string;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @Column({ length: 200 })
  caption!: string;
}

describe('resolveSearchableTargets', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    // A real driver, deliberately: the whole point of this module is what the driver says about
    // column types, and a hand-built metadata stub would only re-state the assumption under test.
    // 真驱动，刻意为之：本模块的全部意义就在于驱动怎么说列类型，而手工造的元数据桩只会把被测的
    // 假设再复述一遍。
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Book, AuditSnippet, OwnedCounter, OwnedMemo, OwnedSlug],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('清单里的模块 → 取到实体、归属列与文本列', () => {
    const targets = resolveSearchableTargets(dataSource, ['books']);

    expect(targets).toHaveLength(1);
    expect(targets[0].module).toBe('books');
    expect(targets[0].entity.target).toBe(Book);
    expect(targets[0].ownerColumn).toBe('userId');
    expect(targets[0].orderColumn).toBe('id');
    // title / author / status are text; rating and the date columns are not.
    // title / author / status 是文本；rating 与各日期列不是。
    expect(targets[0].textColumns).toEqual(['title', 'author', 'status']);
  });

  it('没有归属列的实体被跳过（无法收窄到调用方 ⇒ fail-closed）', () => {
    expect(resolveSearchableTargets(dataSource, ['audit_snippets'])).toEqual([]);
  });

  it('没有文本列的实体被跳过（没有可与关键词匹配的东西）', () => {
    expect(resolveSearchableTargets(dataSource, ['owned_counters'])).toEqual([]);
  });

  it('清单里有、但本进程没有该实体 → 跳过而非报错（清单是文件，进程是它被构建成的样子）', () => {
    expect(resolveSearchableTargets(dataSource, ['invoices'])).toEqual([]);
  });

  it('排序用实体自己的主键，不写死 id（主键是 code 也照样可搜）', () => {
    const [target] = resolveSearchableTargets(dataSource, ['owned_slugs']);

    expect(target.orderColumn).toBe('code');
  });

  it('未出现在清单里的模块不返回（可搜与否由声明决定，不由实体决定）', () => {
    expect(resolveSearchableTargets(dataSource, [])).toEqual([]);
  });

  it('按清单顺序返回够格的模块，不够格的被跳过', () => {
    const targets = resolveSearchableTargets(dataSource, [
      'owned_memos',
      'invoices',
      'audit_snippets',
      'books',
      'owned_counters',
    ]);

    expect(targets.map((t) => t.module)).toEqual(['owned_memos', 'books']);
  });
});
