// SPDX-License-Identifier: Apache-2.0

import { validateEnv } from './env.config';

/** 一组格式合法的密钥（≥32 字符 / ENCRYPTION_KEY 为 64 位 hex）。 */
const validSecrets = {
  JWT_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  ENCRYPTION_KEY: 'c'.repeat(64),
};

// The previously shipped value that made the published single-container image sign tokens with a
// key everyone holds. Production must refuse it, not fall back to it.
// 曾随单容器镜像发布的签名密钥：它让已发布镜像签出的 token 人人都能签。生产必须拒绝，而不是回退到它。
const PUBLISHED_JWT_SECRET = 'keelbase-single-container-dev-secret-at-least-32-chars!!';

describe('validateEnv', () => {
  it('合法配置通过，并套用 Joi 默认值', () => {
    const out = validateEnv({ ...validSecrets });
    expect(out.NODE_ENV).toBe('development');
    expect(out.PORT).toBe(3000);
    expect(out.JWT_SECRET).toBe(validSecrets.JWT_SECRET);
  });

  it('缺 JWT_SECRET → 启动即抛，报错点名变量并给出生成方法', () => {
    const withoutJwt: Record<string, unknown> = { ...validSecrets };
    delete withoutJwt.JWT_SECRET;
    expect(() => validateEnv(withoutJwt)).toThrow(/JWT_SECRET/);
    expect(() => validateEnv(withoutJwt)).toThrow(/openssl rand -hex 32/);
  });

  it('ENCRYPTION_KEY 长度不对 → 启动即抛（不会静默接受弱值）', () => {
    expect(() => validateEnv({ ...validSecrets, ENCRYPTION_KEY: 'too-short' })).toThrow(/ENCRYPTION_KEY/);
  });

  it('生产环境用已随镜像发布的默认 JWT_SECRET → 拒绝启动', () => {
    expect(() =>
      validateEnv({ ...validSecrets, NODE_ENV: 'production', JWT_SECRET: PUBLISHED_JWT_SECRET }),
    ).toThrow(/publicly known secret/);
  });

  it('生产环境用 .env.example 里的占位密钥 → 同样拒绝启动', () => {
    expect(() =>
      validateEnv({
        ...validSecrets,
        NODE_ENV: 'production',
        ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      }),
    ).toThrow(/publicly known secret/);
  });

  it('开发环境仍可用模板值（本地 cp .env.example .env 的零配置路径不变）', () => {
    expect(() =>
      validateEnv({ ...validSecrets, NODE_ENV: 'development', JWT_SECRET: PUBLISHED_JWT_SECRET }),
    ).not.toThrow();
  });
});
