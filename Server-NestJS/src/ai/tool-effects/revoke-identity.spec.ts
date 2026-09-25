// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import type { DeclaredSideEffect } from './effect-composition';

/**
 * REV-6「effect 身份可依赖」：身份要**同时**答出目标与变更。
 *
 * - 目标：`result_type` + `result_id`（恒有值）；
 * - 变更：`before_snapshot` / `after_snapshot`（**可空**，只在接了快照捕获器时填）。
 *
 * 身份不能是可选的：缺了变更，跨组判定只能答「两个组碰了同一行」，答不出「是否做了同一变更」。
 * 恒有值的 `args_hash` 顶不上——它是**请求**指纹、同时是组键输入，非确定性工具下做同一变更的两次调用
 * 参数字节不同（那正是组被拆开的成因）。
 *
 * 取舍（三选一：拒绝登记 / 回填历史 / 显式豁免并标注）取**显式豁免并标注**：业务行已写进目标表，
 * 拒登只会让这次写没有任何副作用行（撤销够不到它）——把可恢复换成不可恢复；历史变更无法如实回填。
 *
 * 本组用例钉的是**旧实现不可能产出的观测面**：旧实现连该列都不存在 → `identityIncomplete` 读出来是
 * `undefined`，两条断言（缺变更被标注 / 有变更不被误标）对旧实现都为红。
 * 只断言「登记成功」是抓不住的 —— 那正是旧实现的样子。
 *
 * 用**真 sqlite** 驱动：标注是**落库的持久事实**，mock 仓库会把「登记层到底写没写这一列」一起放过。
 */
const CTX = {
  userId: '42',
  conversationId: 'conv-9',
  toolName: 'create_project_with_tasks',
  args: { title: 'X' },
};

const GROUP: DeclaredSideEffect[] = [
  { resultType: 'pm_project', resultId: 7 },
  { resultType: 'pm_task', resultId: 88 },
];

describe('REV-6 effect 身份：成组成员缺变更时**不得静默通过**', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect],
      synchronize: true,
    });
    await ds.initialize();
    svc = new AiToolEffectsService(ds.getRepository(AiToolSideEffect) as never);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  const rows = (): Promise<AiToolSideEffect[]> =>
    ds.getRepository(AiToolSideEffect).find({ order: { id: 'ASC' } });

  it('成组登记**没有变更快照** → 每一行如实标为 identityIncomplete（不静默当作完整身份）', async () => {
    await svc.recordGroup(CTX, GROUP);

    const saved = await rows();
    expect(saved.map((r) => r.identityIncomplete)).toEqual([true, true]);
    // 标注与「有没有组」同频：这些行确实属于补偿组（跨组身份判定要用的正是它们）
    expect(saved.every((r) => r.compensationGroup !== null)).toBe(true);
  });

  it('成组登记**带变更快照** → 不标（不制造无意义的噪音标记）', async () => {
    await svc.recordGroup(CTX, GROUP, [
      { before: null, after: '{"id":7,"title":"P"}' },
      { before: null, after: '{"id":88,"title":"T"}' },
    ]);

    const saved = await rows();
    expect(saved.map((r) => r.identityIncomplete)).toEqual([false, false]);
    expect(saved.map((r) => r.afterSnapshot)).toEqual([
      '{"id":7,"title":"P"}',
      '{"id":88,"title":"T"}',
    ]);
  });

  it('**逐行**标注：组内只有一条缺变更时，只标那一条（不是整组连坐，也不是整组豁免）', async () => {
    await svc.recordGroup(CTX, GROUP, [
      { before: null, after: '{"id":7,"title":"P"}' },
      undefined, // 抓取失败 / 无捕获器：成员 1 的身份缺了变更那半
    ]);

    const saved = await rows();
    expect(saved.map((r) => r.identityIncomplete)).toEqual([false, true]);
  });

  it('管理端列表能**读出**这个标注（不是只写进库里、读取侧仍默认完整）', async () => {
    await svc.recordGroup(CTX, GROUP);

    const listed = await svc.list({ limit: 10 });

    expect(listed.items.map((i) => i.identityIncomplete)).toEqual([true, true]);
  });

  it('标注是**链外注解列**：不入副作用哈希链 payload（白名单加 key 会破历史链验签）', () => {
    const payload = (
      svc as unknown as {
        _chainPayload: (r: Record<string, unknown>) => Record<string, unknown>;
      }
    )._chainPayload({ identityIncomplete: true, toolName: 't', userId: '1' });

    expect(payload).not.toHaveProperty('identityIncomplete');
    expect(payload).toHaveProperty('toolName', 't');
  });
});
