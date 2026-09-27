// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { Entity, PrimaryGeneratedColumn, Column, DeleteDateColumn } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import {
  SideEffectSnapshotCaptor,
  type CaptureUnavailableReason,
} from './side-effect-snapshot-captor';

/**
 * REV-13: capture availability must be readable **per cause**, and the causes must not mask
 * one another. Before this, four different kinds of "nothing" shared one boolean on the grouped
 * member, so "by design" and "something broke" produced the same reading — while they call for
 * opposite responses.
 *
 * Two of the four are design choices and two are faults:
 *   `no_captor` (nothing wired) · `no_entity_and_empty_fallback` (external write, no fallback data)
 *   `row_missing` (entity resolves, row gone) · `failed` (capture threw)
 *
 * **Deliberately not among them**: `not_declared` belongs to the *before* path (`BEFORE_CAPTURE_TOOLS`
 * lookup) and has no after-side branch; `fell_back` is a mechanism, not a cause — falling back to a
 * fallback that *returns content* yields a valid snapshot and must not be flagged at all.
 *
 * Old implementation cannot produce these observations: the reason column does not exist, so every
 * assertion here is red against it.
 *
 * Real sqlite, not a mock: the reason is a persisted fact, and a mock repository would wave through
 * whether the recording layer actually wrote the column.
 *
 * ⚠ Scope note: the `no_captor` value is *produced* by the caller's ternary in
 * `ToolExecutionService` (captor absent → no capture attempted). This file covers it being
 * **stored and read back distinctly**; the producing line is asserted nowhere, which is stated
 * rather than implied.
 */
const CTX = {
  userId: '42',
  conversationId: 'conv-rev13',
  toolName: 'create_project_with_tasks',
  args: { title: 'X' },
};

/** 只为让 `resolveLocalEntity` 解析得到：需要类名/表名可匹配 **且** 带 `DeleteDateColumn`。 */
@Entity('capture_probe')
class CaptureProbe {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ nullable: true }) title?: string;
  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt?: Date | null;
}

describe('REV-13 捕获不可用：按成因分列', () => {
  let ds: DataSource;
  let captor: SideEffectSnapshotCaptor;

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect, CaptureProbe],
      synchronize: true,
    });
    await ds.initialize();
    captor = new SideEffectSnapshotCaptor(ds.manager);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  describe('捕获器侧：三种「没有」互不等价', () => {
    it('本地实体解析不到且回退为空 → no_entity_and_empty_fallback（外部写的正常形态）', async () => {
      const r = await captor.captureAfter('proxy_call', 7);
      expect(r.json).toBeNull();
      expect(r.reason).toBe('no_entity_and_empty_fallback');
    });

    it('实体解析得到、行却不在 → row_missing（**异常**，与「设计上的缺席」分得开）', async () => {
      const r = await captor.captureAfter('capture_probe', 999, { ignored: 'fallback 不该被用' });
      expect(r.json).toBeNull();
      // 关键：解析得到时**不回退** fallback —— 否则「目标不在了」会被 fallback 掩盖成一次成功捕获
      expect(r.reason).toBe('row_missing');
    });

    it('抓取抛错 → failed（异常路径单独可辨）', async () => {
      const broken = new SideEffectSnapshotCaptor({
        // 元数据照旧（好让 `resolveLocalEntity` 解析得到），只让取仓库这一步炸掉 —— 模拟抓取抛错
        connection: { entityMetadatas: (ds.manager as never as { connection: { entityMetadatas: unknown[] } }).connection.entityMetadatas },
        getRepository: () => {
          throw new Error('boom');
        },
      } as never);
      const r = await broken.captureAfter('capture_probe', 1);
      expect(r.json).toBeNull();
      expect(r.reason).toBe('failed');
    });

    it('反向对照：取到了就没有成因（json 与 reason 不可能同时有值）', async () => {
      await ds.getRepository(CaptureProbe).save({ id: 1, title: '在的' });
      const r = await captor.captureAfter('capture_probe', 1);
      expect(r.json).toContain('在的');
      expect(r.reason).toBeNull();
    });

    it('**回退不是「缺」**：回退拿得到内容时快照有效、不置标（fell_back 不是成因）', async () => {
      const r = await captor.captureAfter('proxy_call', 7, { cancelled: true });
      expect(r.json).toContain('cancelled');
      expect(r.reason).toBeNull();
    });
  });

  describe('登记与读取侧：四种成因分别落列、分别可读', () => {
    const REASONS: CaptureUnavailableReason[] = [
      'no_captor',
      'no_entity_and_empty_fallback',
      'row_missing',
      'failed',
    ];

    it('四种成因各落一行且互不掩盖（可分别计数）', async () => {
      const svc = new AiToolEffectsService(ds.getRepository(AiToolSideEffect));
      for (const [i, reason] of REASONS.entries()) {
        await svc.recordGroup(
          { ...CTX, conversationId: `conv-${reason}`, args: { title: reason } },
          [{ resultType: 'pm_project', resultId: 100 + i }],
          [{ before: null, after: null, afterReason: reason }],
        );
      }

      const rows = await ds.getRepository(AiToolSideEffect).find({ order: { id: 'ASC' } });
      expect(rows.map((r) => r.identityIncompleteReason)).toEqual(REASONS);
      // 四种都置了标 —— 分列不改变「缺变更」这个事实本身
      expect(rows.every((r) => r.identityIncomplete === true)).toBe(true);
    });

    it('置标却没给成因 ⇒ 留 null（「标了但原因不可考」），**不拿默认值冒充已知**', async () => {
      const svc = new AiToolEffectsService(ds.getRepository(AiToolSideEffect));
      await svc.recordGroup(
        { ...CTX, conversationId: 'conv-unknown' },
        [{ resultType: 'pm_project', resultId: 7 }],
        [{ before: null, after: null }],
      );

      const row = await ds.getRepository(AiToolSideEffect).findOneByOrFail({ resultId: 7 });
      expect(row.identityIncomplete).toBe(true);
      expect(row.identityIncompleteReason).toBeNull();
    });

    it('有变更的行既不置标也不记成因（不误报）', async () => {
      const svc = new AiToolEffectsService(ds.getRepository(AiToolSideEffect));
      await svc.recordGroup(
        { ...CTX, conversationId: 'conv-ok' },
        [{ resultType: 'pm_project', resultId: 8 }],
        [{ before: null, after: '{"title":"X"}' }],
      );

      const row = await ds.getRepository(AiToolSideEffect).findOneByOrFail({ resultId: 8 });
      expect(row.identityIncomplete).toBe(false);
      expect(row.identityIncompleteReason).toBeNull();
    });
  });
});
