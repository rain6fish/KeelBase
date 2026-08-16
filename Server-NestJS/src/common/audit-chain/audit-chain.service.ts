import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

export interface ChainRow {
  id: number;
  prevHash?: string | null;
  hash?: string | null;
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  /** 断链位置（1 起）——prevHash 不连续或 hash 与重算不符时非 null */
  brokenIndex?: number;
}

/**
 * HS-11 审计哈希链：每条审计记录存 prev_hash（前一条的 hash）+ hash（本条内容 HMAC）。
 * - 防篡改：改任何业务字段 → 重算 hash 不匹配；改 hash → 破坏下一条 prevHash 连续性。
 * - 可验证：GET /audit/logs/verify（admin）沿 id 顺序重算整条链。
 * - 密钥域分离：HMAC key = sha256('keelbase:audit-chain:v1' + (ENCRYPTION_KEY || JWT_SECRET))。
 * 局限：createdAt/id 不入 payload（createdAt 由 DB 生成、id 仅排序）；并发写极小概率链分叉
 * （同 prevHash 两分支），verify 会把分叉当断链标出——审计量低、可接受。
 */
@Injectable()
export class AuditChainService {
  private readonly hmacKey: string;

  constructor(config: ConfigService) {
    const secret =
      config.get<string>('ENCRYPTION_KEY') ||
      config.get<string>('JWT_SECRET') ||
      'dev-audit-chain-insecure';
    this.hmacKey = createHmac('sha256', 'keelbase:audit-chain:v1')
      .update(secret)
      .digest('hex');
  }

  /** 计算当前记录 hash：HMAC(secret, prevHash|canonicalPayload)。payload 键已排序、undefined 剔除。 */
  computeHash(prevHash: string | null, payload: Record<string, unknown>): string {
    const sorted = Object.keys(payload)
      .filter((k) => payload[k] !== undefined)
      .sort();
    const canonical = JSON.stringify(payload, sorted);
    const input = `${prevHash ?? 'genesis'}|${canonical}`;
    return createHmac('sha256', this.hmacKey).update(input).digest('hex');
  }

  /** 沿 id 升序校验整条链。rows 需含 id/prevHash/hash；payloadFor 重建每条的业务字段。 */
  verifyChain<T extends ChainRow>(
    rows: T[],
    payloadFor: (row: T) => Record<string, unknown>,
  ): ChainVerification {
    let prevHash: string | null = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const expected = this.computeHash(prevHash, payloadFor(row));
      if (row.prevHash !== prevHash || row.hash !== expected) {
        return { valid: false, checked: i, brokenIndex: i + 1 };
      }
      prevHash = row.hash ?? null;
    }
    return { valid: true, checked: rows.length };
  }
}
