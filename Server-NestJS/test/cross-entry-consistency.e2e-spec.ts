// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { AiService } from '../src/ai/ai.service';
import { AuthorizationDeniedError } from '../src/ai/interfaces/tool.interface';

/**
 * T5 跨入口决策一致性（§22.17 P1）：同一 AI 行为的决策判定（允许/拒绝/确认）与依据
 * （checks/reasons）跨入口应同源。确定性（无 LLM——越权/风险 deny 在
 * AiService._assertToolAllowed、确认在 _requiresConfirmation）。
 *
 * 聚焦 MCP 决策语义补齐（此前 deny → -32603 无审计无 reasons；confirmation 纯文本无标注）：
 *   ① R5 工具 deny → 返回 -32603（决策到达调用方）+ 审计留痕（authorization denied）
 *   ② deny reasons 同源——MCP 与直调 executeToolForExternal 走同一治理判定（risk_policy check）
 *   ③ R3 写工具 confirmation → 未执行 + 审计 detail 标注 requiresConfirmation
 */
describe('Cross-entry decision consistency (T5)', () => {
  let app: INestApplication;
  let token: string;
  let mcpUserId: number;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const { accessToken } = await registerUser(app, {
      username: 'xentry',
      email: 'xentry@example.com',
      password: 'Passw0rd!',
      nickname: 'XEntry',
    });
    token = accessToken;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(token))
      .expect(200);
    mcpUserId = me.body.data.id;

    const regAdmin = await registerUser(app, {
      username: 'xentry_admin',
      email: 'xentry_admin@example.com',
      password: 'Passw0rd!',
      nickname: 'XEntryAdmin',
    });
    const ds = app.get(DataSource);
    const adminMe = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(regAdmin.accessToken))
      .expect(200);
    await ds.getRepository('users').update(adminMe.body.data.id, { role: 'admin' });
    adminToken = (await loginAs(app, 'xentry_admin', 'Passw0rd!')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const mcpCall = (name: string, args: unknown) =>
    request(app.getHttpServer())
      .post('/api/v1/mcp')
      .set(authHeader(token))
      .send({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } });

  async function mcpAuditRows(keyword: string): Promise<Array<{ provider: string | null; detail: string | null; isError: boolean | null }>> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit/logs')
      .query({ userId: String(mcpUserId) })
      .set(authHeader(adminToken))
      .expect(200);
    const data = Array.isArray(res.body.data) ? res.body.data : (res.body.data?.items ?? []);
    return (data as Array<{ provider: string | null; detail: string | null; isError: boolean | null }>)
      .filter((e) => e.provider === 'mcp' && (e.detail ?? '').includes(keyword));
  }

  it('① MCP 调 R5 工具 delete_customer → deny：返回 -32603（决策到达）+ 审计留痕', async () => {
    const res = await mcpCall('delete_customer', { customerId: 1 }).expect(201);
    // deny 决策到达调用方：-32603 + 原因（risk level R5）
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32603);
    expect(String(res.body.error.message)).toMatch(/R5|blocked/i);

    // deny 留审计（修复后 detail 标注 authorization denied）
    const rows = await mcpAuditRows('authorization denied');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => (r.detail ?? '').includes('delete_customer'))).toBe(true);
    expect(rows[0].isError).toBe(true);
  });

  it('② deny 依据同源——直调 executeToolForExternal 抛的 reasons 含 risk_policy（与 MCP 同一治理判定）', async () => {
    const aiService = app.get(AiService);
    await expect(aiService.executeToolForExternal('delete_customer', {}, String(mcpUserId)))
      .rejects.toMatchObject({
        name: 'AuthorizationDeniedError',
      });
    try {
      await aiService.executeToolForExternal('delete_customer', {}, String(mcpUserId));
    } catch (e) {
      const denied = e as AuthorizationDeniedError;
      // 结构化依据：risk_policy（R5 阻断）check——MCP 审计落库的 authorization 即此 reasons
      expect(Array.isArray(denied.reasons)).toBe(true);
      expect(denied.reasons[0]?.name).toBe('risk_policy');
      expect(denied.reasons[0]?.ok).toBe(false);
    }
  });

  it('③ MCP 调 R3 写工具 create_event → requiresConfirmation 未执行 + 审计 detail 标注', async () => {
    const res = await mcpCall('create_event', { title: 'xentry-confirm' }).expect(201);
    // confirmation：未执行（返回文本说明），非 deny 错误
    expect(res.body.error).toBeUndefined();
    const text = JSON.stringify(res.body.result ?? '');
    expect(text).toMatch(/requires confirmation|not executed/i);

    // 审计 detail 标注 requiresConfirmation（可辨识为确认待决而非普通读/写）
    const rows = await mcpAuditRows('requiresConfirmation');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => (r.detail ?? '').includes('create_event'))).toBe(true);
  });
});
