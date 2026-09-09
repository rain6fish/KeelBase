// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { User, UserRole } from '../src/common/entities/user.entity';
import { AiToolEffectsService } from '../src/ai/tool-effects/ai-tool-effects.service';

/**
 * Revoke Contract §2 工具级撤销验收（docs/revoke-contract.spec.md §2.1 本地可撤，G4 回归固化）。
 *
 * 契约承诺「本地可撤」= 撤销后目标可经 RG-3 回收站恢复、归一状态收敛到 revoked。
 * 本套件用一条真实链路（无 LLM、确定性）固化该承诺，防止新工具「声明可撤但撤不动」：
 *   真实用户登录 → 真实 REST 创建 event（POST /events）→ service.record 登记 AI 写副作用 →
 *   本人撤销（DELETE /ai/my/tool-effects/:id）→ 目标 deletedAt 非空（事件列表/详情不可见）→
 *   管理端回收站可见（可恢复）→ restore 后归一状态回 executed；另附非本人撤销 404（所有权）。
 */
describe('Revoke Contract §2 本地可撤验收（event）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let effectsService: AiToolEffectsService;

  let ownerToken: string;
  let ownerId: number;
  let adminToken: string;

  // 主链路：一条真实 REST 创建的 event + 其副作用
  let eventId: number;
  let eventTitle: string;
  let effectId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    effectsService = app.get(AiToolEffectsService);

    // 本人（owner）：后续撤销走本人端点
    const owner = await registerUser(app, {
      username: 'g4_owner',
      email: 'g4owner@test.com',
      password: 'G4OwnerPass1',
      nickname: 'G4Owner',
    });
    ownerToken = owner.accessToken;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(ownerToken))
      .expect(200);
    ownerId = (me.body.data as { id: number }).id;

    // 管理员：测试库无 seed admin，注册后改 DB 角色再重新登录（access token 携带新 role 声明）
    const admin = await registerUser(app, {
      username: 'g4_admin',
      email: 'g4admin@test.com',
      password: 'G4AdminPass1',
      nickname: 'G4Admin',
    });
    await ds.getRepository(User).update(
      (await ds.getRepository(User).findOne({ where: { username: 'g4_admin' } }))!.id,
      { role: UserRole.ADMIN },
    );
    adminToken = (await loginAs(app, 'g4_admin', 'G4AdminPass1')).accessToken;

    // 真实 REST 创建本地可撤目标（event，实体带 @DeleteDateColumn → local_compensate 可软删）
    eventTitle = `撤销验收事件-${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set(authHeader(ownerToken))
      .send({
        title: eventTitle,
        description: 'Revoke Contract §2.1 本地可撤验收目标',
        startTime: new Date(Date.now() + 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(201);
    eventId = (created.body.data as { id: number }).id;
    expect(eventId).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await app.close();
  });

  it('service.record 登记 AI 写副作用（真实幂等/哈希链登记路径），撤销前归一状态 executed', async () => {
    // 走 app 内注入的 AiToolEffectsService.record——与 AI 写工具执行后落库同一条真实登记逻辑
    const effect = await effectsService.record(
      {
        userId: String(ownerId),
        conversationId: 'e2e-g4-1',
        toolName: 'create_event',
        args: { title: eventTitle, description: 'Revoke Contract §2.1 本地可撤验收目标' },
      },
      'event',
      eventId,
    );
    effectId = effect.id;
    expect(effectId).toBeGreaterThan(0);
    expect(effect.resultType).toBe('event');
    expect(effect.resultId).toBe(eventId);

    // 撤销前：AI Action Center 中该条 status=executed（目标未软删）
    const before = await request(app.getHttpServer())
      .get('/api/v1/ai/my/tool-effects')
      .set(authHeader(ownerToken))
      .expect(200);
    const row = (before.body.data.items as any[]).find((i: any) => i.id === effectId);
    expect(row).toBeDefined();
    expect(row.status).toBe('executed');
    expect(row.targetSoftDeleted).toBe(false);
  });

  it('本人撤销 DELETE /ai/my/tool-effects/:id → revoked true', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${effectId}`)
      .set(authHeader(ownerToken))
      .expect(200);
    expect((res.body.data as { revoked: boolean }).revoked).toBe(true);
  });

  it('目标真实被软删：详情/列表不可见 + DB deletedAt 非空 + 管理端回收站可见（RG-3 可恢复）', async () => {
    // 事件详情 404（默认查询排除软删行）
    await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}`)
      .set(authHeader(ownerToken))
      .expect(404);

    // 事件列表不含该 id
    const list = await request(app.getHttpServer())
      .get('/api/v1/events')
      .set(authHeader(ownerToken))
      .query({ start: '2026-01-01', end: '2026-12-31' })
      .expect(200);
    const ids = (list.body.data as any[]).map((e: any) => e.id);
    expect(ids).not.toContain(eventId);

    // DB 直证：deletedAt 非空（软删），withDeleted 仍可取到
    const softDeleted = await ds.getRepository('Event').findOne({ where: { id: eventId }, withDeleted: true });
    expect(softDeleted?.deletedAt).toBeTruthy();

    // 管理端回收站可见（type=event + 该 id）→ 证明可经 RG-3 回收站恢复
    const trash = await request(app.getHttpServer())
      .get('/api/v1/admin/trash')
      .set(authHeader(adminToken))
      .expect(200);
    const hit = (trash.body.data.items as any[]).find(
      (i: any) => i.type === 'event' && i.id === eventId,
    );
    expect(hit).toBeDefined();
    expect(hit.title).toBe(eventTitle);
    expect(hit.deletedAt).toBeTruthy();
  });

  it('撤销后归一状态收敛 revoked（AI Action Center）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ai/my/tool-effects')
      .set(authHeader(ownerToken))
      .expect(200);
    const row = (res.body.data.items as any[]).find((i: any) => i.id === effectId);
    expect(row).toBeDefined();
    expect(row.status).toBe('revoked');
    expect(row.targetSoftDeleted).toBe(true);
    expect(row.targetExists).toBe(true); // 软删非物理删：目标仍存在，仅 deletedAt 置位
  });

  it('回收站 restore 后事件恢复 + 归一状态回 executed（RG-3 恢复闭环，可选扩展）', async () => {
    const restore = await request(app.getHttpServer())
      .post(`/api/v1/admin/trash/event/${eventId}/restore`)
      .set(authHeader(adminToken))
      .expect(201);
    expect((restore.body.data as { restored: boolean }).restored).toBe(true);

    // 事件恢复可见
    await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}`)
      .set(authHeader(ownerToken))
      .expect(200);

    // 目标软删取消 → 归一状态回 executed（targetSoftDeleted 为权威 live 信号，见 _normalizeStatus）
    const res = await request(app.getHttpServer())
      .get('/api/v1/ai/my/tool-effects')
      .set(authHeader(ownerToken))
      .expect(200);
    const row = (res.body.data.items as any[]).find((i: any) => i.id === effectId);
    expect(row).toBeDefined();
    expect(row.status).toBe('executed');
    expect(row.targetSoftDeleted).toBe(false);
  });

  it('非本人撤销他人副作用 → 404（所有权边界 revokeOwned）', async () => {
    // 另一用户（other）经真实 REST 建 event + 登记副作用
    const other = await registerUser(app, {
      username: 'g4_other',
      email: 'g4other@test.com',
      password: 'G4OtherPass1',
      nickname: 'G4Other',
    });
    const meOther = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(other.accessToken))
      .expect(200);
    const otherId = (meOther.body.data as { id: number }).id;
    const otherEvt = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set(authHeader(other.accessToken))
      .send({
        title: `他人撤销验收事件-${Date.now()}`,
        startTime: new Date(Date.now() + 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(201);
    const otherEffect = await effectsService.record(
      {
        userId: String(otherId),
        conversationId: 'e2e-g4-other',
        toolName: 'create_event',
        args: { title: '他人撤销验收事件' },
      },
      'event',
      (otherEvt.body.data as { id: number }).id,
    );

    // owner 撤他人副作用 → 404（不暴露存在性）
    await request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${otherEffect.id}`)
      .set(authHeader(ownerToken))
      .expect(404);

    // 本人（other）可正常撤销自己 → 200（对照）
    await request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${otherEffect.id}`)
      .set(authHeader(other.accessToken))
      .expect(200);
  });
});
