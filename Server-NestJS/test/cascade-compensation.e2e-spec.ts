// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { User, UserRole } from '../src/common/entities/user.entity';
import { AiToolEffectsService } from '../src/ai/tool-effects/ai-tool-effects.service';
import { PmService } from '../src/pm/pm.service';
import { PmProject } from '../src/pm/pm-project.entity';
import { PmTask } from '../src/pm/pm-task.entity';
import { OperationAuditLog } from '../src/operation-audit/operation-audit-log.entity';

/**
 * 级联撤销 / 业务级补偿验收（docs/cascade-compensation.spec.md §8）。
 *
 * 契约承诺「AI 写操作可撤销」在**跨表复合写**下必须依然成立：一次业务动作写了多张表，
 * 撤销任一条就要把整组一次补偿掉——只还原一部分是**伪造的「已撤销」**，比不撤销更危险。
 *
 * 本套件用一条真实链路（无 LLM、确定性）固化该承诺：
 *   真实用户 → 真实单事务复合写（PmService.createProjectWithTasks：1 项目 + N 任务）→
 *   副作用按补偿组登记（recordGroup）→ 本人撤销**任意一条** →
 *   全组目标软删（DB deletedAt 非空）→ 恰一行 action=COMPENSATE 的操作审计行（补偿自身入链）→
 *   两条哈希链均完整 → 回收站可见并可恢复。
 */
describe('Cascade Compensation 级联补偿验收（PmProject + N × PmTask）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let effectsService: AiToolEffectsService;
  let pmService: PmService;

  let ownerToken: string;
  let ownerId: number;
  let adminToken: string;

  let projectId: number;
  let taskIds: number[];
  let effectIds: number[];
  let groupId: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    effectsService = app.get(AiToolEffectsService);
    pmService = app.get(PmService);

    const owner = await registerUser(app, {
      username: 'cascade_owner',
      email: 'cascadeowner@test.com',
      password: 'CascadeOwner1',
      nickname: 'CascadeOwner',
    });
    ownerToken = owner.accessToken;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(ownerToken))
      .expect(200);
    ownerId = (me.body.data as { id: number }).id;

    // 管理员：测试库无 seed admin，注册后改 DB 角色再重新登录（access token 携带新 role 声明）
    await registerUser(app, {
      username: 'cascade_admin',
      email: 'cascadeadmin@test.com',
      password: 'CascadeAdmin1',
      nickname: 'CascadeAdmin',
    });
    await ds.getRepository(User).update(
      (await ds.getRepository(User).findOne({ where: { username: 'cascade_admin' } }))!.id,
      { role: UserRole.ADMIN },
    );
    adminToken = (await loginAs(app, 'cascade_admin', 'CascadeAdmin1')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('复合写：单事务落 pm_projects + N × pm_tasks（不留「有项目没任务」的半成品）', async () => {
    const { project, tasks } = await pmService.createProjectWithTasks(
      { name: `级联验收项目-${Date.now()}` },
      [{ title: '梳理干系人清单' }, { title: '确定技术选型' }],
      ownerId,
    );
    projectId = project.id;
    taskIds = tasks.map((t) => t.id);

    expect(projectId).toBeGreaterThan(0);
    expect(taskIds).toHaveLength(2);
    // 子行确实挂在父行上
    const rows = await ds.getRepository(PmTask).find({ where: { projectId } });
    expect(rows.map((r) => r.id).sort()).toEqual([...taskIds].sort());
  });

  it('副作用按补偿组登记：3 条同行、成员键互异、根为项目（parentEffectId null）', async () => {
    const declared = [
      { resultType: 'pm_project', resultId: projectId },
      ...taskIds.map((id) => ({ resultType: 'pm_task', resultId: id })),
    ];
    const saved = await effectsService.recordGroup(
      {
        userId: String(ownerId),
        conversationId: 'e2e-cascade-1',
        toolName: 'create_project_with_tasks',
        args: { name: '级联验收项目' },
      },
      declared,
    );
    effectIds = saved.map((e) => e.id);
    groupId = saved[0].compensationGroup!;

    expect(saved).toHaveLength(3);
    expect(groupId).toBeTruthy();
    // 同组 + 键互异（同键会被唯一约束把整组塌成一行）
    expect(new Set(saved.map((e) => e.compensationGroup)).size).toBe(1);
    expect(new Set(saved.map((e) => e.idempotencyKey)).size).toBe(3);
    // 根成员 = 项目（第 0 条），其余指向根
    expect(saved[0].parentEffectId).toBeNull();
    expect(saved[1].parentEffectId).toBe(saved[0].id);
    expect(saved[2].parentEffectId).toBe(saved[0].id);
    // 组内链相邻（同一事务内顺序接链）
    expect(saved[1].prevHash).toBe(saved[0].hash);
    expect(saved[2].prevHash).toBe(saved[1].hash);
  });

  it('撤销**组内任一条**（此处撤子任务）→ 整组一次补偿，3 条目标全部软删', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${effectIds[1]}`)
      .set(authHeader(ownerToken))
      .expect(200);

    const data = res.body.data as {
      revoked: boolean;
      cascade?: { total: number; revoked: number; failed: number };
    };
    expect(data.revoked).toBe(true);
    expect(data.cascade).toMatchObject({ total: 3, revoked: 3, failed: 0 });

    // DB 直证：三个目标（1 项目 + 2 任务）全部 deletedAt 非空
    const project = await ds
      .getRepository(PmProject)
      .findOne({ where: { id: projectId }, withDeleted: true });
    expect(project?.deletedAt).toBeTruthy();
    const tasks = await ds
      .getRepository(PmTask)
      .find({ where: { id: In(taskIds) }, withDeleted: true });
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.deletedAt)).toBe(true);
  });

  it('补偿自身入 operation_audit：恰一行 COMPENSATE，targetId = 根业务 id（可被证据根捞到）', async () => {
    const repo = ds.getRepository(OperationAuditLog);
    const rows = await repo.find({ where: { action: 'COMPENSATE' } });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.targetId).toBe(String(projectId)); // 根成员（项目）的业务 id，不是副作用 id
    expect(row.path).toBe('/ai/tool-effects/compensate');
    expect(row.featureKey).toBe('ai.compensate');
    expect(row.businessEvent).toBe('AiSideEffectCompensated');

    // 链外列承载逐成员明细（不动链 payload 契约）
    const detail = JSON.parse(row.changes!) as Array<{
      resultType: string;
      resultId: number;
      role: string;
      revoked: boolean;
    }>;
    expect(detail).toHaveLength(3);
    expect(detail[0]).toMatchObject({ resultType: 'pm_project', resultId: projectId, role: 'root' });
    expect(detail.filter((d) => d.role === 'child')).toHaveLength(2);

    // REV-12：这行还**指回**它依据的那次授权——带授权那条链的连接键，使「谁许可 / 执行 / 收回」在一条链上可读
    const body = JSON.parse(row.requestBody!) as { authorization?: Record<string, unknown> };
    expect(body.authorization).toMatchObject({
      conversationId: expect.any(String),
      toolName: expect.any(String),
    });
  });

  it('两条哈希链均完整（补偿行确实入链）', async () => {
    const ops = await request(app.getHttpServer())
      .get('/api/v1/audit/operations/verify')
      .set(authHeader(adminToken))
      .expect(200);
    expect((ops.body.data as { valid: boolean }).valid).toBe(true);

    const effects = await request(app.getHttpServer())
      .get('/api/v1/ai/tool-effects/verify')
      .set(authHeader(adminToken))
      .expect(200);
    expect((effects.body.data as { valid: boolean }).valid).toBe(true);
  });

  it('撤销后归一状态收敛 revoked（AI Action Center 三端同源判定）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ai/my/tool-effects')
      .set(authHeader(ownerToken))
      .expect(200);
    const rows = (res.body.data.items as Array<{ id: number; status: string }>).filter((i) =>
      effectIds.includes(i.id),
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === 'revoked')).toBe(true);
  });

  it('可经 RG-3 回收站恢复：项目 + 两个任务均可见', async () => {
    const trash = await request(app.getHttpServer())
      .get('/api/v1/admin/trash')
      .set(authHeader(adminToken))
      .expect(200);
    const items = trash.body.data.items as Array<{ type: string; id: number }>;
    expect(items.some((i) => i.type === 'project' && i.id === projectId)).toBe(true);
    expect(taskIds.every((id) => items.some((i) => i.type === 'task' && i.id === id))).toBe(true);
  });

  it('批量（会话级）按组折叠：同组只补偿一次，逐条结果摊平', async () => {
    // 第二条链路：新组
    const { project, tasks } = await pmService.createProjectWithTasks(
      { name: `级联验收项目B-${Date.now()}` },
      [{ title: 'A' }, { title: 'B' }],
      ownerId,
    );
    const saved = await effectsService.recordGroup(
      {
        userId: String(ownerId),
        conversationId: 'e2e-cascade-2',
        toolName: 'create_project_with_tasks',
        args: { name: '级联验收项目B' },
      },
      [
        { resultType: 'pm_project', resultId: project.id },
        ...tasks.map((t) => ({ resultType: 'pm_task', resultId: t.id })),
      ],
    );

    const res = await request(app.getHttpServer())
      .delete('/api/v1/ai/my/tool-effects')
      .set(authHeader(ownerToken))
      .query({ conversationId: 'e2e-cascade-2' })
      .expect(200);

    const data = res.body.data as { total: number; revoked: number; results: unknown[] };
    expect(data.revoked).toBe(3);
    expect(data.results).toHaveLength(3);

    // 折叠生效的证据：整组一次补偿 → 只有一个新增 COMPENSATE 行（此前 1 行）
    const compensateRows = await ds
      .getRepository(OperationAuditLog)
      .find({ where: { action: 'COMPENSATE' } });
    expect(compensateRows).toHaveLength(2);
    // 且不会因为逐个成员处理而重复补偿（组内每条的运维态都只是 revoked）
    expect(saved.every((e) => e.compensationGroup === saved[0].compensationGroup)).toBe(true);
  });
});
