// SPDX-License-Identifier: Apache-2.0

/**
 * 权限-2 通用数据范围 e2e：在真实 DI + DB 下验证
 * ① 写入时盖章 `org_id`/`dept_id`（OrgModule 接线打通）
 * ② 行级范围语义「本人 OR 同组织」——同组织成员可见、非组织成员不可见。
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, authHeader } from './helpers';

describe('数据范围（权限-2）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let userA: { token: string; id: number };
  let userB: { token: string; id: number };
  let userC: { token: string; id: number };
  let deptId: number;

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    ds = app.get(DataSource);

    const makeUser = async (username: string) => {
      const reg = await registerUser(app, {
        username,
        email: `${username}@test.com`,
        password: 'DsPass123',
        nickname: username,
      });
      const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set(authHeader(reg.accessToken));
      return { token: reg.accessToken, id: me.body.data.id as number };
    };

    userA = await makeUser('ds_a');
    userB = await makeUser('ds_b');
    userC = await makeUser('ds_c');

    // A 与 B 同组织同部门；C 无组织。直连 DB 建模，绕开邀请流程。
    const org = await ds.getRepository('organizations').save({ name: `DS-${Date.now()}` });
    const dept = await ds
      .getRepository('departments')
      .save({ orgId: org.id, name: '研发', parentId: null, ancestors: '/' });
    deptId = dept.id;
    await ds.getRepository('org_members').save([
      { orgId: org.id, userId: userA.id, deptId: dept.id, role: 'member' },
      { orgId: org.id, userId: userB.id, deptId: dept.id, role: 'member' },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('创建时盖章 org/dept，且同组织成员可见、非组织成员不可见', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/todos')
      .set(authHeader(userA.token))
      .send({ title: 'A 的待办' })
      .expect(201);

    // ① 盖章
    const row = await ds.getRepository('todos').findOne({ where: { userId: userA.id } });
    expect(row?.orgId).toBeTruthy();
    // 权限-2 Step2：写入时盖章 org_id/dept_id（dept_id 供 own_dept(_and_below) 范围过滤；见 docs/data-scope.spec.md §写入盖章）
    expect(row?.deptId).toBe(deptId);

    // ② 行级范围：同组织 B 可见，非组织 C 不可见
    const listB = await request(app.getHttpServer())
      .get('/api/v1/todos')
      .set(authHeader(userB.token))
      .expect(200);
    expect((listB.body.data ?? []).some((t: { userId: number }) => t.userId === userA.id)).toBe(true);

    const listC = await request(app.getHttpServer())
      .get('/api/v1/todos')
      .set(authHeader(userC.token))
      .expect(200);
    expect((listC.body.data ?? []).some((t: { userId: number }) => t.userId === userA.id)).toBe(false);
  });

  it('非组织成员创建的自待办不带 orgId，仅本人可见', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/todos')
      .set(authHeader(userC.token))
      .send({ title: 'C 的待办' })
      .expect(201);

    const row = await ds.getRepository('todos').findOne({ where: { userId: userC.id } });
    expect(row?.orgId == null).toBe(true);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/todos')
      .set(authHeader(userA.token))
      .expect(200);
    expect((listA.body.data ?? []).some((t: { userId: number }) => t.userId === userC.id)).toBe(false);
  });

  /**
   * 生成模块走的是**同一套**数据范围：`reports` 的 spec 声明了 `scope: ["org"]`，于是它由生成器
   * 产出范围列、盖章、`buildScopeWhere` 与 `rowInScope`，并在自己的服务里**自登记**。
   *
   * 这条 e2e 用的是**真生成物**（不是替身、不是手写模型）：它同时钉住「生成的代码真的接上了范围体系」
   * 与「登记真的发生了」—— 后者单靠字符串断言不够（见 docs/module-protocol.md §3.2 那条实测）。
   */
  it('生成模块（reports 声明 scope）同样按组织可见，非组织成员不可见', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(authHeader(userA.token))
      .send({ title: 'A 的报告', status: 'draft' })
      .expect(201);

    // ① 生成物也盖章（org 列由协议 scope 声明带出）
    const row = await ds.getRepository('reports').findOne({ where: { userId: userA.id } });
    expect(row?.orgId).toBeTruthy();

    // ② 同组织 B 可见
    const listB = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set(authHeader(userB.token))
      .expect(200);
    expect((listB.body.data ?? []).some((r: { userId: number }) => r.userId === userA.id)).toBe(true);

    // ③ 非组织成员 C 不可见
    const listC = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set(authHeader(userC.token))
      .expect(200);
    expect((listC.body.data ?? []).some((r: { userId: number }) => r.userId === userA.id)).toBe(false);
  });

  /**
   * ① 强制点（docs/authorization-architecture.md §10）：同一 subject 的**列表与按 id 读取必须走同一
   * 行级谓词**。此前 events 明细只走 CASL（本人），于是出现「列表可见（同组织）而明细 403」的半套隔离。
   * 这条钉住两者一致：B 在列表里看得到 A 的事件，就必须能按 id 打开它；非组织成员 C 两者都看不到。
   */
  it('events 明细与列表同一谓词：同组织成员按 id 可读，非组织成员 403', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set(authHeader(userA.token))
      .send({ title: 'A 的事件', startTime: new Date().toISOString(), endTime: new Date().toISOString() })
      .expect(201);
    const eventId = created.body.data.id as number;

    // 列表可见（既有 ORG-3 语义）
    const listB = await request(app.getHttpServer())
      .get('/api/v1/events')
      .query({ start: '2026-01-01', end: '2026-12-31' })
      .set(authHeader(userB.token))
      .expect(200);
    expect((listB.body.data ?? []).some((e: { id: number }) => e.id === eventId)).toBe(true);

    // 明细与列表一致：同组织 B 可读
    await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}`)
      .set(authHeader(userB.token))
      .expect(200);

    // 非组织成员 C：列表看不到，按 id 也拒绝
    const listC = await request(app.getHttpServer())
      .get('/api/v1/events')
      .query({ start: '2026-01-01', end: '2026-12-31' })
      .set(authHeader(userC.token))
      .expect(200);
    expect((listC.body.data ?? []).some((e: { id: number }) => e.id === eventId)).toBe(false);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}`)
      .set(authHeader(userC.token))
      .expect(403);
  });
});
