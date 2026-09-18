// SPDX-License-Identifier: Apache-2.0

/**
 * 国密 SM2 签名 / 验签（docs/evidence-root.spec.md §11 + 私库《D4 触发执行包》§3）。
 *
 * 算法与格式已冻结，勿改：摘要固定 SM3（alg 恒为 `SM2-with-SM3`），签名值默认 `raw`（r||s 各 32 字节
 * → 64 字节 → 128 hex），签名对象 = 整包剔除 `signature` 段自身的 canonical（换算法不换对象）。
 *
 * **实现走宿主 openssl CLI**（选型见执行包 §3）：Node 内置 crypto 的 `sign('sm3', …)` 对 SM2 密钥
 * 产出的签名**不符合 SM2 语义**——实测它自签的名连 `openssl dgst -sm3 -verify` 都验不过，甚至经
 * PEM 往返后自身也不一致；故不可用（本仓不引 `sm-crypto` 等第三方国密库，见执行包 §3 供应链权衡）。
 *
 * **distid（区分标识 Z 的 userId）必须显式传**：openssl CLI 的默认 ID 是**空串**，与国标默认值
 * `1234567812345678` 互不兼容——同一签名换个 ID 就验不过（实测矩阵：空 ID 与国标 ID 两两互斥）。
 * 因此签名与验签两侧都显式传 `-sigopt distid:<userId>`，且包内 `sm2.userId` 必须**如实标注实际所用值**。
 *
 * 缺 openssl：抛 `Sm2UnavailableError`（明确失败），**绝不静默**降级为「无签名」或 PASS（执行包 §6.4）。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 冻结算法标识：SM3 摘要 + SM2 签名（GB/T 32918.2-2016 / GM/T 0003.2-2012），不接受 SHA-256 替代。 */
export const SM2_ALG = 'SM2-with-SM3' as const;

/** SM2 区分标识 Z 的国标默认值（§11.2 `userId` 默认；openssl CLI 自身默认为空串，故须显式传）。 */
export const SM2_DEFAULT_USER_ID = '1234567812345678';

/** raw 编码下签名值字节数（r||s 各 32 字节）。 */
export const SM2_RAW_BYTES = 64;

/**
 * SM2 公钥 SPKI DER 前缀（26 字节）：SEQUENCE + AlgorithmIdentifier(id-ecPublicKey + SM2 OID
 * 1.2.156.10197.1.301) + BIT STRING 头（0x42 = 65 字节载荷）；其后紧跟 04||x||y 未压缩点。
 */
const SM2_SPKI_PREFIX = '3059301306072a8648ce3d020106082a811ccf5501822d034200';

/** 签名值编码（§11.2 `encoding`）：`raw` = r||s 各 32 字节（默认）；`der` = ASN.1 DER。 */
export type Sm2Encoding = 'raw' | 'der';

/** 包内 `signature.sm2` 段（§11.2；wire 契约见 specs/protocol/schemas/v3/evidence-package.schema.json）。 */
export interface Sm2SignatureBlock {
  alg: typeof SM2_ALG;
  encoding: Sm2Encoding;
  userId: string;
  /** 04||x||y 非压缩点 hex（65 字节 → 130 hex）。 */
  publicKey: string;
  keyId?: string;
  certChain?: string[];
  /** 对 canonical 的签名值 hex。 */
  value: string;
}

/** openssl 不可用 / 不支持 SM2 时抛出——调用方须向上明报，不得吞掉。 */
export class Sm2UnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Sm2UnavailableError';
  }
}

/** DER（ASN.1 SEQUENCE{r,s}）→ raw（r||s 各 32 字节）。 */
export function derToRaw(der: Buffer): Buffer {
  if (der.length < 8 || der[0] !== 0x30) throw new Error('SM2 签名不是 DER SEQUENCE');
  let i = 2;
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f);
  const readInt = (): Buffer => {
    if (der[i++] !== 0x02) throw new Error('SM2 DER 缺少 INTEGER');
    const len = der[i++];
    let v = der.subarray(i, i + len);
    i += len;
    while (v.length > 32 && v[0] === 0) v = v.subarray(1);
    if (v.length > 32) throw new Error('SM2 DER INTEGER 超过 32 字节');
    return v.length < 32 ? Buffer.concat([Buffer.alloc(32 - v.length), v]) : v;
  };
  const r = readInt();
  const s = readInt();
  return Buffer.concat([r, s]);
}

/** raw（r||s 各 32 字节）→ DER（ASN.1 SEQUENCE{r,s}）。 */
export function rawToDer(raw: Buffer): Buffer {
  if (raw.length !== SM2_RAW_BYTES) {
    throw new Error(`SM2 raw 签名必须 ${SM2_RAW_BYTES} 字节（r||s），实得 ${raw.length}`);
  }
  const enc = (v: Buffer): Buffer => {
    let x = v;
    while (x.length > 1 && x[0] === 0) x = x.subarray(1);
    if (x[0] & 0x80) x = Buffer.concat([Buffer.from([0]), x]);
    return Buffer.concat([Buffer.from([0x02, x.length]), x]);
  };
  const body = Buffer.concat([enc(raw.subarray(0, 32)), enc(raw.subarray(32))]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

/** 调用 openssl；ENOENT / 能力缺失一律转为 `Sm2UnavailableError`（明确失败）。 */
function openssl(args: string[], input?: Buffer): Buffer {
  try {
    return execFileSync('openssl', args, { input, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    const e = err as { code?: string; message?: string; stderr?: Buffer };
    if (e?.code === 'ENOENT') {
      throw new Sm2UnavailableError('未找到 openssl 可执行文件（SM2 签名/验签需宿主 openssl 1.1.1+，建议 3.x）');
    }
    const detail = e?.stderr?.toString().trim() || e?.message || String(err);
    throw new Sm2UnavailableError(`openssl 调用失败（${args[0]}）：${detail}`);
  }
}

/** 私钥 PEM 落临时文件（0600，目录随用随删）——私钥不落代码库，运行时经环境注入。 */
function withKeyFile<T>(pem: string, fn: (path: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'kb-sm2-'));
  try {
    const p = join(dir, 'key.pem');
    writeFileSync(p, pem, { mode: 0o600 });
    return fn(p);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** DER 公钥（SPKI）→ 未压缩点 hex（04||x||y）；非 SM2 公钥明确报错而非静默取错位。 */
function spkiDerToPointHex(der: Buffer): string {
  const hex = der.toString('hex');
  if (!hex.startsWith(SM2_SPKI_PREFIX)) {
    throw new Error('公钥不是 SM2（SPKI AlgorithmIdentifier 前缀不符）——SM2 签名不接受 EC 其他曲线密钥');
  }
  return hex.slice(SM2_SPKI_PREFIX.length);
}

/** 点 hex → SPKI DER（验签侧由包内 publicKey 复原，不需私钥）。 */
export function pointHexToSpkiDer(publicKeyHex: string): Buffer {
  const hex = publicKeyHex.toLowerCase();
  if (!/^(04[0-9a-f]{128}|0[23][0-9a-f]{64})$/.test(hex)) {
    throw new Error('SM2 公钥点格式非法（须 04||x||y 非压缩或 02/03||x 压缩）');
  }
  if (hex.startsWith('04')) return Buffer.from(SM2_SPKI_PREFIX + hex, 'hex');
  // 压缩点：openssl 需要显式解压——交由调用方走 pkey 转换，这里不支持裸压缩前缀拼接
  throw new Error('SM2 压缩公钥需先解压为未压缩点（04||x||y）再验签');
}

/** 由私钥推导验签公钥点（04||x||y hex）——包内 publicKey 取自这里，轮换后旧包仍可凭其自身公钥验。 */
export function derivePublicKeyHex(privateKeyPem: string): string {
  return withKeyFile(privateKeyPem, (p) => {
    const der = openssl(['pkey', '-in', p, '-pubout', '-outform', 'DER']);
    return spkiDerToPointHex(der);
  });
}

/** 对 canonical 做 SM2 签名（SM3 摘要），返回 raw（r||s）hex。 */
export function signCanonical(
  canonical: string,
  privateKeyPem: string,
  userId: string = SM2_DEFAULT_USER_ID,
): string {
  return withKeyFile(privateKeyPem, (p) => {
    const der = openssl(
      ['dgst', '-sm3', '-sign', p, '-sigopt', `distid:${userId}`],
      Buffer.from(canonical, 'utf8'),
    );
    return derToRaw(der).toString('hex');
  });
}

/**
 * 用公钥验签 canonical。返回 false = 签名不匹配（内容被改 / 密钥或 userId 不符）；openssl 缺失时
 * 抛 `Sm2UnavailableError`——**与「验签失败」严格区分**，调用方不得把前者当后者。
 */
export function verifyCanonical(
  canonical: string,
  publicKeyHex: string,
  signatureHex: string,
  userId: string = SM2_DEFAULT_USER_ID,
  encoding: Sm2Encoding = 'raw',
): boolean {
  const pubDer = pointHexToSpkiDer(publicKeyHex);
  const sig = Buffer.from(signatureHex, 'hex');
  const sigDer = encoding === 'der' ? sig : rawToDer(sig);
  const dir = mkdtempSync(join(tmpdir(), 'kb-sm2-'));
  const pubPath = join(dir, 'pub.der');
  const sigPath = join(dir, 'sig.bin');
  try {
    writeFileSync(pubPath, pubDer);
    writeFileSync(sigPath, sigDer);
    try {
      const out = execFileSync(
        'openssl',
        ['dgst', '-sm3', '-verify', pubPath, '-keyform', 'DER', '-signature', sigPath, '-sigopt', `distid:${userId}`],
        {
          input: Buffer.from(canonical, 'utf8'),
          maxBuffer: 64 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      return out.toString().includes('Verified OK');
    } catch (err) {
      const e = err as { code?: string; status?: number; stderr?: Buffer; message?: string };
      if (e?.code === 'ENOENT') {
        throw new Sm2UnavailableError('未找到 openssl 可执行文件（SM2 验签需宿主 openssl 1.1.1+，建议 3.x）');
      }
      // openssl 验签失败以 exit 1 表达（stderr 含 "Verification failure"）——这是「验签不通过」而非缺库
      if (typeof e?.status === 'number') return false;
      throw new Sm2UnavailableError(`openssl 验签调用失败：${e?.stderr?.toString().trim() || e?.message}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 从环境读 SM2 配置（§11.2 密钥管理：私钥不落代码库）。
 * `SM2_PRIVATE_KEY` = PKCS#8 PEM 内容；`SM2_KEY_ID` = 可选指纹（轮换追溯）。
 * 未配置 → null（调用方据此决定 signature 段形态）。
 */
export function sm2ConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { privateKeyPem: string; keyId?: string; userId: string } | null {
  const pem = env.SM2_PRIVATE_KEY;
  if (!pem || !pem.includes('PRIVATE KEY')) return null;
  return {
    privateKeyPem: pem,
    keyId: env.SM2_KEY_ID || undefined,
    userId: env.SM2_USER_ID || SM2_DEFAULT_USER_ID,
  };
}

/** 按配置产出 `signature.sm2` 段（无配置 → null）。缺 openssl / 密钥非法 → 抛错，绝不静默降级。 */
export function buildSm2Block(
  canonical: string,
  cfg: { privateKeyPem: string; keyId?: string; userId: string } | null,
): Sm2SignatureBlock | null {
  if (!cfg) return null;
  const publicKey = derivePublicKeyHex(cfg.privateKeyPem);
  return {
    alg: SM2_ALG,
    encoding: 'raw',
    userId: cfg.userId,
    publicKey,
    ...(cfg.keyId ? { keyId: cfg.keyId } : {}),
    value: signCanonical(canonical, cfg.privateKeyPem, cfg.userId),
  };
}
