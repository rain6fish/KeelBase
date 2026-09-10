// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { AiToolEffectsService } from '../src/ai/tool-effects/ai-tool-effects.service';
import { AiToolSideEffect } from '../src/ai/tool-effects/ai-tool-side-effect.entity';

/**
 * §14「下一阶段 Benchmark」确定性矩阵（无 LLM，可重复）——把「Trust 面」的三类
 * 分布式/并发不变量固化为常绿套件：
 *   - Duplicate Request：同会话重复写 → 幂等（一条副作用；幂等键含 conversationId →
 *     跨会话隔离）；已撤条目重复撤销 → 观察并固化实现语义。
 *   - Concurrent：并发同 key 写 → 唯一约束 skip 路径收敛为一行，不向调用方抛错。
 *   - Partial Failure：会话级批量撤销 → 逐条汇总 {total,revoked,skipped,failed}
 *     部分成功如实反映，已撤条目 skipped(reason=already_revoked)。
 *
 * 断言全部基于真实链路：真实用户登录 → 真实 REST 建 event → AiToolEffectsService.record
 * （与 AI 写工具执行后同一条登记逻辑）→ 本人端点撤销。计数以 repo 直查 + HTTP 清单双向佐证。
 */
describe('Trust behavior matrix (§14 Benchmark: Duplicate / Concurrent / Partial Failure)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let effectsService: AiToolEffectsService;
  let effectsRepo: Repository<AiToolSideEffect>;

  let token: string;
  let userId: number;

  /** 稳定的同参数对象（幂等键取自 args，两次调用须传同一对象/同内容） */
  const argsOf = (title: string) => ({ title, description: 'trust-matrix' });

  const ctxOf = (conversationId: string, args: Record<string, unknown>) => ({
    userId: '',
    conversationId,
    toolName: 'create_event',
    args,
  });

  async function createEvent(title: string): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set(authHeader(token))
      .send({
        title,
        startTime: new Date(Date.now() + 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(201);
    return (res.body.data as { id: number }).id;
  }

  const countByKey = (key: string) => effectsRepo.count({ where: { idempotencyKey: key } });
  const countByConversation = (conversationId: string) =>
    effectsRepo.count({ where: { conversationId } });

  async function deleteOwned(effectId: number) {
    return request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${effectId}`)
      .set(authHeader(token))
      .expect(200);
  }

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    effectsService = app.get(AiToolEffectsService);
    effectsRepo = ds.getRepository(AiToolSideEffect);

    const owner = await registerUser(app, {
      username: 'trust_matrix_owner',
      email: 'trust_matrix@test.com',
      password: 'TrustMatrix1',
      nickname: 'TrustMatrix',
    });
    token = owner.accessToken;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(token))
      .expect(200);
    userId = (me.body.data as { id: number }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('§14 Duplicate Request — 同会话同工具同参数 record 两次 → 返回同一条 effect，仅落一行', async () => {
    const eventId = await createEvent(`idem-${Date.now()}`);
    const ctx = { ...ctxOf('conv-idem', argsOf('idem-event')), userId: String(userId) };
    const key = AiToolEffectsService.buildKey(ctx);

    const first = await effectsService.record(ctx, 'event', eventId);
    const second = await effectsService.record(ctx, 'event', eventId);

    // 幂等核心：第二次返回与第一次同一条副作用（同 id，不新增行）
    expect(first.id).toBeGreaterThan(0);
    expect(second.id).toBe(first.id);

    // repo 直证：唯一幂等键仅一行；该会话仅一条副作用
    expect(await countByKey(key)).toBe(1);
    expect(await countByConversation('conv-idem')).toBe(1);

    // HTTP 本人清单（AI Action Center）佐证：该会话恰好 1 条且为同一条
    const res = await request(app.getHttpServer())
      .get('/api/v1/ai/my/tool-effects')
      .set(authHeader(token))
      .expect(200);
    const rows = (res.body.data.items as Array<{ id: number; conversationId: string }>).filter(
      (r) => r.conversationId === 'conv-idem',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
  });

  it('§14 Concurrent — 并发 5 次 record 同一 key → 唯一约束 skip 收敛为 1 行，无异常上抛', async () => {
    const eventId = await createEvent(`conc-${Date.now()}`);
    const ctx = { ...ctxOf('conv-conc', argsOf('conc-event')), userId: String(userId) };
    const key = AiToolEffectsService.buildKey(ctx);

    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, () => effectsService.record(ctx, 'event', eventId)),
    );
    const fulfilled = settled.filter(
      (s): s is PromiseFulfilledResult<AiToolSideEffect> => s.status === 'fulfilled',
    );
    const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');

    // 最终态：并发下该幂等键仅 1 行（record 内唯一冲突 skip 分支生效）
    expect(await countByKey(key)).toBe(1);
    expect(await countByConversation('conv-conc')).toBe(1);

    // 命中幂等 skip 的调用返回同一条（并发下 id 集合收敛为单元素）
    expect(new Set(fulfilled.map((f) => f.value.id)).size).toBe(1);

    // 唯一冲突必须被 record 内部 skip、不得泄漏给调用方；若有残留错误如实暴露为失败
    expect(rejected.map((r) => String(r.reason?.message ?? r.reason))).toEqual([]);
  });

  it('§14 Duplicate Request — 幂等键含 conversationId：同用户同参数不同会话 → 两条独立 effect', async () => {
    const eventId = await createEvent(`iso-${Date.now()}`);
    const args = argsOf('iso-event');
    const ctxA = { ...ctxOf('conv-iso-A', args), userId: String(userId) };
    const ctxB = { ...ctxOf('conv-iso-B', args), userId: String(userId) };

    // 同用户、同工具、同参数，仅会话不同 → 幂等键不同（键含 conversationId）
    expect(AiToolEffectsService.buildKey(ctxA)).not.toBe(AiToolEffectsService.buildKey(ctxB));

    const a = await effectsService.record(ctxA, 'event', eventId);
    const b = await effectsService.record(ctxB, 'event', eventId);

    expect(a.id).not.toBe(b.id);
    expect(await countByConversation('conv-iso-A')).toBe(1);
    expect(await countByConversation('conv-iso-B')).toBe(1);
  });

  it('§14 Partial Failure — 会话级批量撤销：已撤 skipped / 未撤 revoked，汇总如实反映', async () => {
    const conversationId = 'conv-batch';
    const ev1 = await createEvent(`batch-1-${Date.now()}`);
    const ev2 = await createEvent(`batch-2-${Date.now()}`);
    const effect1 = await effectsService.record(
      { ...ctxOf(conversationId, argsOf('batch-1')), userId: String(userId) },
      'event',
      ev1,
    );
    const effect2 = await effectsService.record(
      { ...ctxOf(conversationId, argsOf('batch-2')), userId: String(userId) },
      'event',
      ev2,
    );

    // 先经本名单条撤销撤掉其中一条（写入 revokeStatus=revoked）
    const single = await deleteOwned(effect1.id);
    expect((single.body.data as { revoked: boolean }).revoked).toBe(true);

    // 会话级批量撤销（本人作用域）→ 汇总部分成功
    const res = await request(app.getHttpServer())
      .delete('/api/v1/ai/my/tool-effects')
      .query({ conversationId })
      .set(authHeader(token))
      .expect(200);
    const data = res.body.data as {
      conversationId: string;
      total: number;
      revoked: number;
      skipped: number;
      failed: number;
      results: Array<{ effectId: number; revoked: boolean; skipped?: boolean; reason?: string }>;
    };

    expect(data.conversationId).toBe(conversationId);
    expect(data.total).toBe(2);
    expect(data.revoked).toBe(1);
    expect(data.skipped).toBe(1);
    expect(data.failed).toBe(0);

    // 已撤那条：skipped + 原因 already_revoked（不重复触发撤销）
    const skippedItem = data.results.find((r) => r.effectId === effect1.id);
    expect(skippedItem).toBeDefined();
    expect(skippedItem!.skipped).toBe(true);
    expect(skippedItem!.revoked).toBe(false);
    expect(skippedItem!.reason).toBe('already_revoked');

    // 未撤那条：本次被撤
    const revokedItem = data.results.find((r) => r.effectId === effect2.id);
    expect(revokedItem).toBeDefined();
    expect(revokedItem!.revoked).toBe(true);
    expect(revokedItem!.skipped).toBeFalsy();

    // 两条目标均被真实软删
    const row1 = await ds.getRepository('Event').findOne({ where: { id: ev1 }, withDeleted: true });
    const row2 = await ds.getRepository('Event').findOne({ where: { id: ev2 }, withDeleted: true });
    expect(row1?.deletedAt).toBeTruthy();
    expect(row2?.deletedAt).toBeTruthy();

    // 复数重跑批量撤销 → 幂等全 skipped（无新增撤销、无失败）
    const rerun = await request(app.getHttpServer())
      .delete('/api/v1/ai/my/tool-effects')
      .query({ conversationId })
      .set(authHeader(token))
      .expect(200);
    const rerunData = rerun.body.data as { revoked: number; skipped: number; failed: number };
    expect(rerunData.revoked).toBe(0);
    expect(rerunData.skipped).toBe(2);
    expect(rerunData.failed).toBe(0);
  });

  it('§14 Duplicate Request — 对已撤条目再单条 DELETE：实现为幂等成功（revoked=true，不新增行）', async () => {
    // 如实固化实现语义：本地 revoker 对「目标已缺」仍返回 revoked=true（LocalEntityRevoker.revoke
    // 仅当 findOne 命中才 softDelete，未命中直接返回成功）→ 端点 200 revoked=true，非 404。
    const eventId = await createEvent(`repeat-${Date.now()}`);
    const ctx = { ...ctxOf('conv-repeat', argsOf('repeat-event')), userId: String(userId) };
    const key = AiToolEffectsService.buildKey(ctx);
    const effect = await effectsService.record(ctx, 'event', eventId);

    const first = await deleteOwned(effect.id);
    expect((first.body.data as { revoked: boolean }).revoked).toBe(true);

    const second = await deleteOwned(effect.id);
    expect((second.body.data as { revoked: boolean }).revoked).toBe(true);

    // 重复撤销不产生新副作用行
    expect(await countByKey(key)).toBe(1);
    expect(await countByConversation('conv-repeat')).toBe(1);
  });
});
