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
    expect(row?.deptId == null).toBe(true);

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
});
