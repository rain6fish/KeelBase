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

/** Keyed by something other than `id`, so the ordering column can be observed. */
/* 主键不是 `id`，以便观察排序用的列。 */
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
    // A real driver and real entities throughout: the declarations decide *which* columns, but the
    // ownership column, the primary key and the existence check all come from entity metadata, and a
    // hand-built stub would only restate the assumptions under test.
    // 全程真驱动 + 真实体：声明决定**哪些**列，但归属列、主键与「列是否存在」都来自实体元数据，
    // 而手工造的桩只会把被测的假设再复述一遍。
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Book, AuditSnippet, OwnedSlug],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('声明里的模块 → 取到实体、归属列、声明列与排序用的主键', () => {
    const targets = resolveSearchableTargets(dataSource, [
      { module: 'books', fields: ['title', 'author'] },
    ]);

    expect(targets).toHaveLength(1);
    expect(targets[0].module).toBe('books');
    expect(targets[0].entity.target).toBe(Book);
    expect(targets[0].ownerColumn).toBe('userId');
    expect(targets[0].orderColumn).toBe('id');
    // Declaration order, and only what was declared — `status` is not searched unless declared.
    // 按声明顺序，且只搜声明过的 —— `status` 未被声明就不搜。
    expect(targets[0].textColumns).toEqual(['title', 'author']);
  });

  it('声明的列里有的不在实体上 → 只留下存在的那一列（清单是文件，手改得着）', () => {
    const targets = resolveSearchableTargets(dataSource, [
      { module: 'books', fields: ['title', 'no_such_column'] },
    ]);

    expect(targets[0].textColumns).toEqual(['title']);
  });

  it('声明的列在实体上一个都不存在 → 整块跳过（否则那次查询会失败，连带所有模块）', () => {
    expect(
      resolveSearchableTargets(dataSource, [{ module: 'books', fields: ['nope_a', 'nope_b'] }]),
    ).toEqual([]);
  });

  it('没有归属列的实体被跳过（无法收窄到调用方 ⇒ fail-closed）', () => {
    expect(
      resolveSearchableTargets(dataSource, [{ module: 'audit_snippets', fields: ['note'] }]),
    ).toEqual([]);
  });

  it('声明里有、但本进程没有该实体 → 跳过而非报错（清单是文件，进程是它被构建成的样子）', () => {
    expect(
      resolveSearchableTargets(dataSource, [{ module: 'invoices', fields: ['title'] }]),
    ).toEqual([]);
  });

  it('排序用实体自己的主键，不写死 id（主键是 code 也照样可搜）', () => {
    const [target] = resolveSearchableTargets(dataSource, [
      { module: 'owned_slugs', fields: ['caption'] },
    ]);

    expect(target.orderColumn).toBe('code');
    expect(target.textColumns).toEqual(['caption']);
  });

  it('未声明的模块不返回（可搜与否由声明决定，不由实体决定）', () => {
    expect(resolveSearchableTargets(dataSource, [])).toEqual([]);
  });

  it('按声明顺序返回够格的模块，不够格的被跳过', () => {
    const targets = resolveSearchableTargets(dataSource, [
      { module: 'owned_slugs', fields: ['caption'] },
      { module: 'invoices', fields: ['title'] },
      { module: 'audit_snippets', fields: ['note'] },
      { module: 'books', fields: ['title'] },
    ]);

    expect(targets.map((t) => t.module)).toEqual(['owned_slugs', 'books']);
  });
});
