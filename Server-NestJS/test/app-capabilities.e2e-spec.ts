// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';

/**
 * e2e coverage for Capability Metadata (MOD-4):
 * GET /api/v1/app/capabilities — Public 端点，三端（Flutter/Taro/管理台）据此隐藏未启用模块导航。
 * 本 spec 验证「协议生态 → Capability Metadata → 生成模块登记 → 三端消费」闭环。
 */
describe('App Capabilities (MOD-4, e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  }, 90000);

  it('GET /app/capabilities 无需认证返回 preset/features/businessModules', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/app/capabilities')
      .expect(200);

    expect(res.body.data).toHaveProperty('preset');
    expect(res.body.data).toHaveProperty('features');
    expect(Array.isArray(res.body.data.businessModules)).toBe(true);
  });

  it('businessModules 包含协议生成的模块（suppliers/contracts/books 等）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/app/capabilities')
      .expect(200);

    const ids = res.body.data.businessModules.map((m: { id: string }) => m.id);
    expect(ids).toContain('suppliers');
    expect(ids).toContain('contracts');
    expect(ids).toContain('books');
  });

  it('businessModules 元素结构 { id, label, description }（供前端渲染导航）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/app/capabilities')
      .expect(200);

    for (const m of res.body.data.businessModules as Array<Record<string, unknown>>) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('label');
      expect(m).toHaveProperty('description');
    }
  });

  it('features 布尔字段决定模块可见性（full 预设下业务模块默认启用）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/app/capabilities')
      .expect(200);

    const flags = res.body.data.features as Record<string, unknown>;
    // 生成模块 feature key 与 manifest id 对应（MOD-4）
    expect(flags['suppliers']).not.toBe(false);
    expect(flags['contracts']).not.toBe(false);
  });
});
