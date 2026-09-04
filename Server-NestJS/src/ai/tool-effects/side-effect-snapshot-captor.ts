// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { resolveLocalEntity } from './side-effect-revoker';

/** 敏感键掩码：快照不落明文密钥/口令/token（与审计 redactSensitive 同源思路） */
const SENSITIVE_KEY = /password|passwd|secret|token|salt|api[_-]?key|refresh/i;

const MAX_STRING = 200;
const MAX_ARRAY = 50;
const MAX_DEPTH = 6;

/** §22.16 A-1 update 类写工具变更前捕获：toolName → args 中目标 id 键 + resultType；create 类无条目 → before null */
const BEFORE_CAPTURE_TOOLS: Record<string, { idKey: string; resultType: string }> = {
  // B 路径 proxy 写（目标在外部系统，无本地实体 → before 用 args 摘要）
  update_customer_status: { idKey: 'customerId', resultType: 'proxy_call' },
};

/**
 * E-1 字段级变更审计：写操作目标记录的标准化快照（JSON 字符串）。
 * - after：本地实体（event/crm_task/pm_task/app_request/todo）按 resultId 重查全量字段；
 *   B 路径外部写（proxy_call）用 execute 返回数据兜底（目标在 Java 系统，无本地表）。
 * - before：本地写工具当前均为 create 类（无 update 场景），留空；未来本地 update 工具出现时
 *   在调用点（_executeWriteTool）execute 前补抓。
 * 快照存副作用表独立列，不参与审计哈希链（副作用表本身不入链），纯展示/证据包内容。
 * 任何抓取失败都降级返回 null，绝不断写路径。
 */
@Injectable()
export class SideEffectSnapshotCaptor {
  private readonly logger = new Logger(SideEffectSnapshotCaptor.name);

  constructor(@InjectEntityManager() private readonly entityManager: EntityManager) {}

  /** before 快照：update 类写工具 execute 前抓变更前状态；create 类无条目 → null；proxy 无本地实体 → args 摘要。 */
  async captureBefore(toolName: string, args: Record<string, unknown>): Promise<string | null> {
    try {
      const spec = BEFORE_CAPTURE_TOOLS[toolName];
      if (!spec) return null;
      const target = resolveLocalEntity(this.entityManager, spec.resultType);
      if (!target) {
        // B 路径外部写：无本地实体可查，用 args 摘要（变更请求输入，非完整状态）
        return this.normalize(args);
      }
      const id = args[spec.idKey];
      if (typeof id !== 'number') return null;
      const repo = this.entityManager.getRepository(target.name);
      const row = await repo.findOne({ where: { id } } as any);
      return this.normalize(row);
    } catch (err) {
      this.logger.warn(`[SnapshotCaptor] captureBefore failed ${toolName}: ${(err as Error).message}`);
      return null;
    }
  }

  /** after 快照：本地实体按 id 重查；外部（无本地实体映射）用 fallback（execute 返回数据）。 */
  async captureAfter(
    resultType: string,
    resultId: number,
    fallback?: unknown,
  ): Promise<string | null> {
    try {
      const target = resolveLocalEntity(this.entityManager, resultType);
      if (!target) {
        return this.normalize(fallback);
      }
      const repo = this.entityManager.getRepository(target.name);
      const row = await repo.findOne({ where: { id: resultId } } as any);
      return this.normalize(row);
    } catch (err) {
      this.logger.warn(`[SnapshotCaptor] captureAfter failed ${resultType}#${resultId}: ${(err as Error).message}`);
      return null;
    }
  }

  /** 标准化对象 → JSON 字符串；空值返回 null。 */
  normalize(value: unknown): string | null {
    if (value == null) return null;
    try {
      return JSON.stringify(this._sanitize(value));
    } catch {
      return null;
    }
  }

  private _sanitize(value: unknown, depth = 0): unknown {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    if (typeof value !== 'object') return value;
    if (depth > MAX_DEPTH) return '[max-depth]';
    if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((v) => this._sanitize(v, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : this._sanitize(v, depth + 1);
    }
    return out;
  }
}
