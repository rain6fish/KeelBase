// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { UploadSignService } from '../src/upload/upload-sign.service';

function splitSignature(url: string): { e: string; s: string } {
  const [, q] = url.split('?');
  const params = new URLSearchParams(q);
  return { e: params.get('e')!, s: params.get('s')! };
}

/**
 * CR-21 stage C (e2e): the write side stores a bare `/uploads/<file>` reference, the read side
 * re-signs it, and a legacy row whose signature has expired heals on read.
 *
 * CR-21 stage C（e2e）：写侧入库只存裸引用，读侧每次重签；存量行即使签名已过期，读取时也会自愈。
 */
describe('CR-21 stage C — bare refs on write, fresh signatures on read (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let uploadSign: UploadSignService;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    uploadSign = app.get(UploadSignService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('写侧：PUT /users/:id 回传带签名 URL ⇒ 库里是裸引用', async () => {
    const { accessToken } = await registerUser(app, {
      username: 'stagec_write',
      email: 'stagec_write@example.com',
      password: 'Passw0rd!',
      nickname: 'StageC Write',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(accessToken))
      .expect(200);
    const userId = me.body.data.id as number;

    const signed = uploadSign.signUrl('/uploads/avatar-stage-c.png');
    expect(signed).toContain('?e=');
    expect(signed).toContain('&s=');

    await request(app.getHttpServer())
      .put(`/api/v1/users/${userId}`)
      .set(authHeader(accessToken))
      .send({ avatarUrl: signed })
      .expect(200);

    const row = await dataSource.getRepository('users').findOne({ where: { id: userId } });
    expect(row!.avatarUrl).toBe('/uploads/avatar-stage-c.png');
  });

  it('读侧：存量行带过期旧签名 ⇒ /auth/me 返回重新签名的可用 URL', async () => {
    const { accessToken } = await registerUser(app, {
      username: 'stagec_read',
      email: 'stagec_read@example.com',
      password: 'Passw0rd!',
      nickname: 'StageC Read',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(accessToken))
      .expect(200);
    const userId = me.body.data.id as number;

    // Simulate a row written before stage C: the signature was frozen at upload time and has expired.
    // 模拟 stage C 之前的存量行：签名在上传时冻结，且已过期。
    const legacy = uploadSign.signUrl('/uploads/avatar-legacy.png', -1);
    const legacySig = splitSignature(legacy);
    expect(uploadSign.verify('/uploads/avatar-legacy.png', legacySig.e, legacySig.s)).toBe(false);

    await dataSource.getRepository('users').update(userId, { avatarUrl: legacy });

    const read = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(accessToken))
      .expect(200);
    const fresh = read.body.data.avatarUrl as string;
    expect(fresh).not.toBe(legacy);
    expect(fresh.startsWith('/uploads/avatar-legacy.png?e=')).toBe(true);

    const freshSig = splitSignature(fresh);
    expect(freshSig).not.toEqual(legacySig);
    expect(uploadSign.verify('/uploads/avatar-legacy.png', freshSig.e, freshSig.s)).toBe(true);
  });

  it('对照：不经读侧剥签的过期签名本身不可用（病），绝对 URL 不剥不改', async () => {
    const legacy = uploadSign.signUrl('/uploads/avatar-legacy.png', -1);
    const legacySig = splitSignature(legacy);
    expect(uploadSign.verify('/uploads/avatar-legacy.png', legacySig.e, legacySig.s)).toBe(false);

    const presigned = 'https://cdn.example.com/bucket/x.png?X-Amz-Signature=deadbeef';
    expect(uploadSign.signUrl(presigned)).toBe(presigned);
  });
});
