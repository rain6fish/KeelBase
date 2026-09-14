// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { AiToolEffectsService } from '../src/ai/tool-effects/ai-tool-effects.service';

/**
 * 30 分钟创造闭环 · 生成模块「治理缺省」—— 把 onboarding-30min §5 的**手工验收清单**升为**自动化闭环**。
 *
 * 断言一个由 `keelbase init` 生成的模块（contracts）的 AI 工具，与旗舰工具走**同一条治理链**（无手写治理代码）：
 *   ① 读工具 query_contracts（R1）→ 自动执行 + 本人数据范围（越权不可见，无需手写权限）
 *   ② 写工具 create_contract（R3）→ 确认门控：**未确认不执行**（MCP 入口同一门控）
 *   ③ 审计哈希链可验证（/audit/verify）
 *   ④ 撤销：生成模块的副作用可撤（record → DELETE → 生成实体软删；`contract` 在 revoker 映射内）
 *
 * **覆盖边界（诚实）**：本套件证的是生成模块治理的**决策层 + 可撤销层**（确定性、无 LLM）。
 * 「approve → 执行 → 落库」属**引擎通用路径**（`_executeWriteTool`，由等待中的 SSE 流驱动；无流则
 * `POST /ai/confirmations/:token` 只 resolve），已由旗舰工具覆盖（app.e2e-spec.ts T.7 / golden）。
 * 生成模块的 REST CRUD（含越权 403）另见 generated-modules.e2e-spec.ts。
 */
describe('Generated module governance (30-min loop · 治理缺省, e2e)', () => {
  let app: INestApplication;
  let token: string;
  let userId: number;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const reg = await registerUser(app, {
      username: 'genmod_user',
      email: 'genmod@test.com',
      password: 'GenMod123',
      nickname: 'GenMod',
    });
    token = reg.accessToken;
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set(authHeader(token)).expect(200);
    userId = me.body.data.id;

    const regAdmin = await registerUser(app, {
      username: 'genmod_admin',
      email: 'genmod_admin@test.com',
      password: 'GenModAdm1',
      nickname: 'GenModAdmin',
    });
    const adminMe = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(regAdmin.accessToken))
      .expect(200);
    await app.get(DataSource).getRepository('users').update(adminMe.body.data.id, { role: 'admin' });
    adminToken = (await loginAs(app, 'genmod_admin', 'GenModAdm1')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const mcpCall = (name: string, args: unknown, tk = token) =>
    request(app.getHttpServer())
      .post('/api/v1/mcp')
      .set(authHeader(tk))
      .send({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } });

  const createContract = (over: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/contracts')
      .set(authHeader(token))
      .send({ name: '采购合同', counterparty: '乙方公司', status: 'draft', amount: 10000, ...over })
      .expect(201);

  const listContracts = async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/contracts').set(authHeader(token)).expect(200);
    return Array.isArray(res.body.data) ? res.body.data : (res.body.data?.items ?? []);
  };

  it('① 读工具 query_contracts（R1）自动执行，且只返回本人数据（生成模块数据隔离）', async () => {
    const created = await createContract({ name: 'genmod-own-contract' });

    const res = await mcpCall('query_contracts', {}).expect(201);
    expect(res.body.error).toBeUndefined();
    expect(JSON.stringify(res.body.result)).toContain('genmod-own-contract');

    // 越权：另一用户的读工具看不到本人行（工具内按 userId 过滤，无需手写权限）
    const other = await registerUser(app, {
      username: 'genmod_other',
      email: 'genmod_other@test.com',
      password: 'GenModOth1',
      nickname: 'GenModOther',
    });
    const otherRes = await mcpCall('query_contracts', {}, other.accessToken).expect(201);
    expect(JSON.stringify(otherRes.body.result)).not.toContain('genmod-own-contract');

    await request(app.getHttpServer())
      .delete(`/api/v1/contracts/${created.body.data.id}`)
      .set(authHeader(token))
      .expect(200);
  });

  it('② 写工具 create_contract（R3）确认门控：未确认不执行（MCP 入口同一门控）', async () => {
    const res = await mcpCall('create_contract', { name: 'genmod-gated', counterparty: '乙方' }).expect(201);
    expect(res.body.error).toBeUndefined();
    expect(JSON.stringify(res.body.result ?? '')).toMatch(/requires confirmation|not executed/i);

    // 未执行 → 落库列表不含该名称
    expect(JSON.stringify(await listContracts())).not.toContain('genmod-gated');

    // 审计标注 requiresConfirmation（与旗舰工具同形，无需手写审计）
    const audit = await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .query({ userId: String(userId) })
      .set(authHeader(adminToken))
      .expect(200);
    const items = Array.isArray(audit.body.data) ? audit.body.data : (audit.body.data?.items ?? []);
    expect(
      items.some(
        (r: any) =>
          String(r.detail ?? '').includes('create_contract') && String(r.detail ?? '').includes('requiresConfirmation'),
      ),
    ).toBe(true);
  });

  it('③ 审计哈希链可验证', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/audit/verify').set(authHeader(adminToken)).expect(200);
    expect(res.body.data.valid).toBe(true);
  });

  it('④ 生成模块的副作用可撤销：record → DELETE → 生成实体软删（revoker 映射内，无需手写）', async () => {
    const created = await createContract({ name: 'genmod-revoke' });
    const contractId = created.body.data.id;

    // 记录一次 AI 写副作用（resultType=contract，生成模块的实体在 revoker 映射内）
    const effects = app.get(AiToolEffectsService);
    const effect = await effects.record(
      { userId: String(userId), toolName: 'create_contract', args: { name: 'genmod-revoke' } },
      'contract',
      contractId,
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/ai/my/tool-effects/${effect.id}`)
      .set(authHeader(token))
      .expect(200);

    // 目标软删 → 本人列表不再含被撤行（revoke 走 revoker 映射，非硬删）
    expect((await listContracts()).some((c: any) => c.id === contractId)).toBe(false);
  });
});
