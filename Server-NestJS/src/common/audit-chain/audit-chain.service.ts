// SPDX-License-Identifier: Apache-2.0

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
 * - 密钥域分离（W4-② 2026-08-19）：HMAC key 用独立 `AUDIT_HMAC_KEY`（64 hex），不再混用 ENCRYPTION_KEY/JWT_SECRET。
 *   - 轮换支持：`AUDIT_HMAC_KEY_PREVIOUS` 保留旧密钥；verify 用「候选密钥集」[current, previous, legacy 派生]
 *     任一匹配即通过——换 key 后旧记录仍可验证，新记录用 current 签名。
 *   - legacy：未配置 AUDIT_HMAC_KEY 时回退 sha256('keelbase:audit-chain:v1' + (ENCRYPTION_KEY || JWT_SECRET))，
 *     与历史记录（无独立密钥时代）兼容。
 * - hash 保持 64 hex（不引入版本前缀，key 探测决定匹配）。
 * 局限：createdAt/id 不入 payload（createdAt 由 DB 生成、id 仅排序）；并发写极小概率链分叉
 * （同 prevHash 两分支），verify 会把分叉当断链标出——审计量低、可接受。
 */
@Injectable()
export class AuditChainService {
  /** 候选 HMAC keys（去重）：current（签名新记录）优先，previous 用于旧记录验证，legacy 兼容历史。 */
  private readonly keys: string[];

  constructor(config: ConfigService) {
    const secret =
      config.get<string>('ENCRYPTION_KEY') ||
      config.get<string>('JWT_SECRET') ||
      'dev-audit-chain-insecure';
    const legacy = createHmac('sha256', 'keelbase:audit-chain:v1')
      .update(secret)
      .digest('hex');
    const current = config.get<string>('AUDIT_HMAC_KEY') || legacy;
    const previous = config.get<string>('AUDIT_HMAC_KEY_PREVIOUS') || null;
    this.keys = [...new Set([current, previous, legacy].filter((k): k is string => Boolean(k)))];
  }

  /** 计算当前记录 hash：HMAC(secret, prevHash|canonicalPayload)。payload 键已排序、undefined 剔除。用 current key 签名。 */
  computeHash(prevHash: string | null, payload: Record<string, unknown>): string {
    const canonical = this._canonical(payload);
    return createHmac('sha256', this.keys[0]).update(`${prevHash ?? 'genesis'}|${canonical}`).digest('hex');
  }

  /** 任一候选 key 与给定 prevHash 算出的 hash 是否等于 stored（轮换兼容：旧记录用 previous/legacy key 也可验证）。 */
  private _matches(stored: string | null | undefined, prevHash: string | null, payload: Record<string, unknown>): boolean {
    if (!stored) return false;
    const canonical = this._canonical(payload);
    for (const key of this.keys) {
      const expected = createHmac('sha256', key).update(`${prevHash ?? 'genesis'}|${canonical}`).digest('hex');
      if (expected === stored) return true;
    }
    return false;
  }

  private _canonical(payload: Record<string, unknown>): string {
    const sorted = Object.keys(payload)
      .filter((k) => payload[k] !== undefined)
      .sort();
    return JSON.stringify(payload, sorted);
  }

  /** 沿 id 升序校验整条链。rows 需含 id/prevHash/hash；payloadFor 重建每条的业务字段。 */
  verifyChain<T extends ChainRow>(
    rows: T[],
    payloadFor: (row: T) => Record<string, unknown>,
  ): ChainVerification {
    let prevHash: string | null = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.prevHash !== prevHash || !this._matches(row.hash, prevHash, payloadFor(row))) {
        return { valid: false, checked: i, brokenIndex: i + 1 };
      }
      prevHash = row.hash ?? null;
    }
    return { valid: true, checked: rows.length };
  }
}
