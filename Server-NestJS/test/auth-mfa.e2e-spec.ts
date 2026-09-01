// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import request from 'supertest';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';

/** 独立 RFC 6238 TOTP 计算器（验证真实 MFA 链路）。 */
function totp(secretBase32: string): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of secretBase32.toUpperCase().replace(/=+$/, '')) {
    value = (value << 5) | table.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const key = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 1000000).padStart(6, '0');
}

/**
 * WEB-FRONT-4 e2e：MFA(TOTP) 启用/登录需验证/停用 + 强制改密完整流。
 */
describe('WEB-FRONT-4 MFA & force-change-password (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('MFA 完整流：setup → verify 启用 → 登录需 TOTP → disable 停用', async () => {
    const { accessToken } = await registerUser(app, {
      username: 'mfauser',
      email: 'mfauser@example.com',
      password: 'Passw0rd!',
      nickname: 'MfaUser',
    });

    // 1) setup 生成 secret + otpauth
    const setup = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/setup')
      .set(authHeader(accessToken))
      .expect(201);
    expect(setup.body.data.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.body.data.otpauthUrl).toContain('otpauth://');
    expect(setup.body.data.alreadyEnabled).toBe(false);
    const secret = setup.body.data.secret as string;

    // 2) verify 绑定并启用
    const code = totp(secret);
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .set(authHeader(accessToken))
      .send({ secret, code })
      .expect(201)
      .expect((res) => expect(res.body.data.enabled).toBe(true));

    // 3) 登录：错 TOTP → 401 MFA_REQUIRED
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'mfauser', password: 'Passw0rd!', totp: '000000' })
      .expect(401);

    // 4) 登录：正确 TOTP → 成功
    const goodLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'mfauser', password: 'Passw0rd!', totp: totp(secret) })
      .expect(200);
    expect(goodLogin.body.data.accessToken).toBeDefined();

    // 5) disable（正确 code）→ 停用
    await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/disable')
      .set(authHeader(accessToken))
      .send({ code: totp(secret) })
      .expect(201);

    // 6) 停用后登录无需 TOTP
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'mfauser', password: 'Passw0rd!' })
      .expect(200);
  });

  it('强制改密：admin 标记 → 登录带标志 → 改密清除', async () => {
    // 目标用户 A（被强制改密）+ 操作者 B（提升为 admin）
    const { accessToken: targetToken } = await registerUser(app, {
      username: 'changepw_user',
      email: 'changepw@example.com',
      password: 'OldPass123',
      nickname: 'ChangePwUser',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(targetToken))
      .expect(200);
    const targetId = me.body.data.id as number;

    await registerUser(app, {
      username: 'mfa_admin_op',
      email: 'mfaadmin@example.com',
      password: 'AdminOp123',
      nickname: 'MfaAdminOp',
    });
    // 提升 B 为 admin：改 DB role 后重登
    const ds = app.get(DataSource);
    const adminMe = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'mfa_admin_op', password: 'AdminOp123' })
      .expect(200);
    const adminOpId = adminMe.body.data.user.id as number;
    await ds.query('UPDATE users SET role = ? WHERE id = ?', ['admin', adminOpId]);
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'mfa_admin_op', password: 'AdminOp123' })
      .expect(200);
    const adminToken = adminLogin.body.data.accessToken as string;

    // admin(B) 标记目标用户 A 需改密
    await request(app.getHttpServer())
      .post(`/api/v1/users/${targetId}/must-change-password`)
      .set(authHeader(adminToken))
      .expect(201);

    // 目标用户 A 登录：响应带 mustChangePassword=true
    const flaggedLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'changepw_user', password: 'OldPass123' })
      .expect(200);
    expect(flaggedLogin.body.data.mustChangePassword).toBe(true);
    const freshToken = flaggedLogin.body.data.accessToken as string;

    // 改密（用强制改密登录后的新 token）：错误当前密码 → 拒绝（INVALID_CREDENTIALS 401）；正确 → 成功并清标志
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set(authHeader(freshToken))
      .send({ currentPassword: 'WrongPass', newPassword: 'NewPass456' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set(authHeader(freshToken))
      .send({ currentPassword: 'OldPass123', newPassword: 'NewPass456' })
      .expect(201);

    // 改密后登录：mustChangePassword=false，新密码生效
    const finalLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'changepw_user', password: 'NewPass456' })
      .expect(200);
    expect(finalLogin.body.data.mustChangePassword).toBe(false);
  });
});
