// SPDX-License-Identifier: Apache-2.0

/**
 * 权限-2 Step 2 验收 e2e：**数据范围按角色配置，改配置即改查询、无需改代码**。
 *
 * 场景：同组织两部门（上级 root / 下级 child）。A 在下级创建待办，B 在上级 list——
 * 角色 `user` 配 `own_dept_and_below` → B 看得到（子树含下级）；改成 `own` → 看不到。
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, authHeader } from './helpers';
import { RoleRuleRegistry } from '../src/authz/role-rule-registry.service';

describe('数据范围按角色配置（权限-2 Step 2）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let creator: { token: string; id: number };
  let lister: { token: string; id: number };
  let rootDeptId: number;
  let childDeptId: number;

  const setUserScope = async (scope: string) => {
    await ds.getRepository('roles').update({ code: 'user' }, { dataScope: scope });
    await app.get(RoleRuleRegistry).reload();
  };

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    ds = app.get(DataSource);

    const makeUser = async (username: string) => {
      const reg = await registerUser(app, {
        username,
        email: `${username}@test.com`,
        password: 'RcPass123',
        nickname: username,
      });
      const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set(authHeader(reg.accessToken));
      return { token: reg.accessToken, id: me.body.data.id as number };
    };
    creator = await makeUser('rc_creator');
    lister = await makeUser('rc_lister');

    const org = await ds.getRepository('organizations').save({ name: `RC-${Date.now()}` });
    const root = await ds
      .getRepository('departments')
      .save({ orgId: org.id, name: '总部', parentId: null, ancestors: '/' });
    rootDeptId = root.id;
    const child = await ds
      .getRepository('departments')
      .save({ orgId: org.id, name: '华东', parentId: root.id, ancestors: `/${root.id}/` });
    childDeptId = child.id;

    await ds.getRepository('org_members').save([
      { orgId: org.id, userId: creator.id, deptId: child.id, role: 'member' },
      { orgId: org.id, userId: lister.id, deptId: root.id, role: 'member' },
    ]);

    // 角色行（测试库无迁移种子，手工建一行以驱动配置）
    await ds.getRepository('roles').save({ code: 'user', name: '普通用户', dataScope: 'own', isSystem: false });

    await request(app.getHttpServer())
      .post('/api/v1/todos')
      .set(authHeader(creator.token))
      .send({ title: '下级部门的待办' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  const listAs = async (token: string) => {
    const res = await request(app.getHttpServer()).get('/api/v1/todos').set(authHeader(token)).expect(200);
    return (res.body.data ?? []) as Array<{ userId: number }>;
  };

  it('data_scope=own → 上级看不到下级的行', async () => {
    await setUserScope('own');
    const items = await listAs(lister.token);
    expect(items.some((t) => t.userId === creator.id)).toBe(false);
  });

  it('data_scope=own_dept_and_below → 上级看得到下级子树的行（改配置即生效）', async () => {
    await setUserScope('own_dept_and_below');
    const items = await listAs(lister.token);
    expect(items.some((t) => t.userId === creator.id)).toBe(true);
  });

  it('改回 own → 重新收紧（配置双向可逆）', async () => {
    await setUserScope('own');
    const items = await listAs(lister.token);
    expect(items.some((t) => t.userId === creator.id)).toBe(false);
    expect(rootDeptId).toBeTruthy();
    expect(childDeptId).toBeTruthy();
  });
});
