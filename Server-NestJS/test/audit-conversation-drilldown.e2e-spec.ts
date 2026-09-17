// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { User, UserRole } from '../src/common/entities/user.entity';
import { ConversationService } from '../src/ai/conversation/conversation.service';

/**
 * AU-4（§22.19 归因层）验收：从 AI 审计行**一跳看对话**。
 *
 * 契约判据（roadmap §22.19 AU-4）：**从审计行一跳可见该次对话（管理员/本人权限内）**。
 * 护栏②要求「**引用优先、不落全文**」——本套件证明该约束落在**服务端**而非仅 UI：
 *   ① meta 端点只给结构元数据，**响应体里不含任何消息文本**（连 summary 也不含）；
 *   ② 正文须**再显式**请求会话本体才拿得到；
 *   ③ 越权不可读（普通用户读他人会话 403），管理员与本人可读（既有 CASL 规则，无新增鉴权分支）。
 */
const SECRET_TEXT = '转账口令是 sunrise-9912'; // 正文哨兵：绝不该出现在元数据响应里

describe('AU-4 审计行 → 会话下钻（§22.19）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let convService: ConversationService;

  let ownerToken: string;
  let ownerId: number;
  let otherToken: string;
  let adminToken: string;
  let conversationId: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    convService = app.get(ConversationService);

    const owner = await registerUser(app, {
      username: 'drill_owner',
      email: 'drillowner@test.com',
      password: 'DrillOwner1',
      nickname: 'DrillOwner',
    });
    ownerToken = owner.accessToken;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(ownerToken))
      .expect(200);
    ownerId = (me.body.data as { id: number }).id;

    const other = await registerUser(app, {
      username: 'drill_other',
      email: 'drillother@test.com',
      password: 'DrillOther1',
      nickname: 'DrillOther',
    });
    otherToken = other.accessToken;

    await registerUser(app, {
      username: 'drill_admin',
      email: 'drilladmin@test.com',
      password: 'DrillAdmin1',
      nickname: 'DrillAdmin',
    });
    await ds.getRepository(User).update(
      (await ds.getRepository(User).findOne({ where: { username: 'drill_admin' } }))!.id,
      { role: UserRole.ADMIN },
    );
    adminToken = (await loginAs(app, 'drill_admin', 'DrillAdmin1')).accessToken;

    // 造一条真实会话（含两轮消息，正文带哨兵串）
    const conv = await convService.createConversation(String(ownerId), 'deepseek', 'deepseek-v4-flash');
    conversationId = conv.id;
    await convService.appendMessage(conversationId, { role: 'user', content: SECRET_TEXT });
    await convService.appendMessage(conversationId, { role: 'assistant', content: '已收到，稍后处理。' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('管理员取元数据：拿到结构信息，且**响应体不含任何消息正文**（护栏②的服务端落点）', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/ai/conversations/${conversationId}/meta`)
      .set(authHeader(adminToken))
      .expect(200);

    const meta = res.body.data as Record<string, unknown>;
    expect(meta.messageCount).toBe(2);
    expect(meta.id).toBe(conversationId);
    expect(meta.userId).toBe(String(ownerId));
    expect(meta.provider).toBe('deepseek');
    expect(typeof meta.lastActivityAt).toBe('string');

    // 核心断言：元数据里没有正文载体，且哨兵串一次都不出现
    expect(meta).not.toHaveProperty('messages');
    expect(meta).not.toHaveProperty('summary');
    expect(JSON.stringify(meta)).not.toContain('sunrise-9912');
  });

  it('正文须**再显式请求**才可见（引用 → 正文两步，而非一次给全）', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/ai/conversations/${conversationId}`)
      .set(authHeader(adminToken))
      .expect(200);

    const data = res.body.data as { messages: Array<{ content: string }> };
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0].content).toBe(SECRET_TEXT);
  });

  it('本人可读自己的元数据', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/ai/conversations/${conversationId}/meta`)
      .set(authHeader(ownerToken))
      .expect(200);
    expect((res.body.data as { messageCount: number }).messageCount).toBe(2);
  });

  it('他人不可读（越权 403）——「管理员/本人权限内」由既有 CASL 规则保证', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/ai/conversations/${conversationId}/meta`)
      .set(authHeader(otherToken))
      .expect(403);

    // 正文端点同权：越权同样被拒（两条路径不会一条松一条紧）
    await request(app.getHttpServer())
      .get(`/api/v1/ai/conversations/${conversationId}`)
      .set(authHeader(otherToken))
      .expect(403);
  });

  it('未认证不可读（401）', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/ai/conversations/${conversationId}/meta`)
      .expect(401);
  });
});
