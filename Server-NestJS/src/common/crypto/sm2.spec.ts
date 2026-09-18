// SPDX-License-Identifier: Apache-2.0

/**
 * SM2 国密签名（docs/evidence-root.spec.md §11）单元测试。
 *
 * 断言都选在「实现错就必然失败」的观测面：改一字节即 FAIL、换 userId 即 FAIL、非 SM2 密钥明确报错。
 * 密钥对在测试内由 openssl 现生成（不落代码库）；openssl 不可用时整套跳过（本机/CI 均有）。
 */
import { execFileSync } from 'node:child_process';
import * as childProcess from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SM2_ALG,
  SM2_DEFAULT_USER_ID,
  Sm2UnavailableError,
  buildSm2Block,
  derToRaw,
  derivePublicKeyHex,
  pointHexToSpkiDer,
  rawToDer,
  signCanonical,
  sm2ConfigFromEnv,
  verifyCanonical,
} from './sm2';

function opensslUsable(): boolean {
  try {
    const out = execFileSync('openssl', ['version'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return /^OpenSSL (1\.1\.1|3|[4-9])/.test(out);
  } catch {
    return false;
  }
}

const HAS_OPENSSL = opensslUsable();
const describeIfOpenssl = HAS_OPENSSL ? describe : describe.skip;

describe('SM2 工具链可用性（本仓实现依赖宿主 openssl）', () => {
  it(HAS_OPENSSL ? 'openssl 可用，SM2 断言真实执行' : 'openssl 不可用 —— SM2 用例已跳过（CI 需 openssl 1.1.1+）', () => {
    expect(typeof HAS_OPENSSL).toBe('boolean');
  });
});

describeIfOpenssl('SM2 签名 / 验签（openssl CLI 委托）', () => {
  let dir: string;
  let priv: string;
  let pub: string;
  const CANONICAL = '{"action":{"id":"crm_task:42"},"exportedAt":"2026-09-18T00:00:00.000Z"}';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sm2-spec-'));
    const privPath = join(dir, 'k.pem');
    execFileSync('openssl', ['genpkey', '-algorithm', 'SM2', '-out', privPath]);
    priv = require('node:fs').readFileSync(privPath, 'utf8') as string;
    pub = derivePublicKeyHex(priv);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('公钥为 04||x||y 非压缩点（130 hex），且与 openssl 导出一致', () => {
    expect(pub).toMatch(/^04[0-9a-f]{128}$/);
    const derHex = execFileSync('openssl', ['pkey', '-in', join(dir, 'k.pem'), '-pubout', '-outform', 'DER']).toString('hex');
    expect(derHex.endsWith(pub)).toBe(true);
    expect(derHex).toBe(pointHexToSpkiDer(pub).toString('hex'));
  });

  it('签出的 raw 值 128 hex，且经公钥验签通过', () => {
    const sig = signCanonical(CANONICAL, priv);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyCanonical(CANONICAL, pub, sig)).toBe(true);
  });

  it('改一字节 → 验签 FAIL（内容篡改必须可测）', () => {
    const sig = signCanonical(CANONICAL, priv);
    const tampered = CANONICAL.replace('crm_task:42', 'crm_task:43');
    expect(verifyCanonical(tampered, pub, sig)).toBe(false);
  });

  it('换 userId（distid）→ 验签 FAIL —— 包内如实标注 userId 才有意义', () => {
    const sig = signCanonical(CANONICAL, priv, '1234567812345678');
    expect(verifyCanonical(CANONICAL, pub, sig, '1234567812345678')).toBe(true);
    expect(verifyCanonical(CANONICAL, pub, sig, '0000000000000000')).toBe(false);
    expect(verifyCanonical(CANONICAL, pub, sig, '')).toBe(false);
  });

  it('raw → DER → raw 往返一致，且 DER 形态同样可验', () => {
    const sigHex = signCanonical(CANONICAL, priv);
    const raw = Buffer.from(sigHex, 'hex');
    const der = rawToDer(raw);
    expect(derToRaw(der).toString('hex')).toBe(sigHex);
    expect(verifyCanonical(CANONICAL, pub, der.toString('hex'), SM2_DEFAULT_USER_ID, 'der')).toBe(true);
  });

  it('非 SM2 曲线公钥明确报错，不静默取错位', () => {
    const other = join(dir, 'p256.pem');
    execFileSync('openssl', ['genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256', '-out', other]);
    const p256Priv = require('node:fs').readFileSync(other, 'utf8') as string;
    expect(() => derivePublicKeyHex(p256Priv)).toThrow(/不是 SM2/);
  });

  it('buildSm2Block：无配置返回 null；有配置产出诚实标注的 sm2 段', () => {
    expect(buildSm2Block(CANONICAL, null)).toBeNull();
    const block = buildSm2Block(CANONICAL, { privateKeyPem: priv, keyId: 'k-1', userId: SM2_DEFAULT_USER_ID });
    expect(block).not.toBeNull();
    expect(block!.alg).toBe(SM2_ALG);
    expect(block!.encoding).toBe('raw');
    expect(block!.userId).toBe(SM2_DEFAULT_USER_ID);
    expect(block!.keyId).toBe('k-1');
    expect(block!.publicKey).toBe(pub);
    expect(verifyCanonical(CANONICAL, block!.publicKey, block!.value, block!.userId, block!.encoding)).toBe(true);
  });
});

describe('SM2 配置读取（环境注入，私钥不入库）', () => {
  it('未配置 / 非 PEM → null', () => {
    expect(sm2ConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(sm2ConfigFromEnv({ SM2_PRIVATE_KEY: 'not-a-pem' } as NodeJS.ProcessEnv)).toBeNull();
  });

  it('配置 PEM → userId 默认国标值，keyId 可选', () => {
    const cfg = sm2ConfigFromEnv({ SM2_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----' } as NodeJS.ProcessEnv);
    expect(cfg).not.toBeNull();
    expect(cfg!.userId).toBe(SM2_DEFAULT_USER_ID);
    expect(cfg!.keyId).toBeUndefined();
  });

  it('userId / keyId 可覆盖', () => {
    const cfg = sm2ConfigFromEnv({
      SM2_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----',
      SM2_USER_ID: 'custom-id',
      SM2_KEY_ID: 'kms-2026-09',
    } as NodeJS.ProcessEnv);
    expect(cfg!.userId).toBe('custom-id');
    expect(cfg!.keyId).toBe('kms-2026-09');
  });
});

// 缺库不静默（执行包 §6.4）见同目录 sm2-unavailable.spec.ts —— 该用例需整模块 mock node:child_process，
// 与其余需真实 openssl 的用例不能同文件（`execFileSync` 为只读属性，不可 spyOn）。
