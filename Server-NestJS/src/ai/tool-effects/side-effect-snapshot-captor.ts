// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { resolveLocalEntity } from './side-effect-revoker';
import { isSensitiveKey, REDACTED } from '../../common/utils/mask';

const MAX_STRING = 200;
const MAX_ARRAY = 50;
const MAX_DEPTH = 6;

/**
 * REV-13：捕获不可用的**成因**——此前四种不同的「没有」共用一个 boolean（`identity_incomplete`），
 * 于是「设计如此」与「出错了」在读数上不可分。四种**互不等价**：
 * - `no_captor` —— 装配缺席（`@Optional()` 未注入 / 调用方未传快照）：设计上的可选；
 * - `no_entity_and_empty_fallback` —— 本地实体解析不到、且回退数据也是空（外部写的正常形态）；
 * - `row_missing` —— 实体解析得到、按 id 却查不到那一行：**异常**（目标不在了）；
 * - `failed` —— 抓取抛错：**异常**。
 *
 * ⚠ 两个曾被列进来的名字**不在此处**：「`not_declared`」属 **before** 路径（`BEFORE_CAPTURE_TOOLS`
 * 查表），after 侧没有这个分支；「`fell_back`」是**机制不是成因**——回退到 fallback 且**拿得到内容**时
 * 快照有效、本就不该置标，它只在「回退后仍为空」时才成为成因（即上面第二条）。
 */
export type CaptureUnavailableReason =
  | 'no_captor'
  | 'no_entity_and_empty_fallback'
  | 'row_missing'
  | 'failed';

/**
 * 一次 after 捕获的结果。**`json` 与 `reason` 不可能同时有值**：
 * 取到了就没有成因，没取到就必须说清是哪一种「没有」。
 */
export interface CaptureResult {
  json: string | null;
  reason: CaptureUnavailableReason | null;
}

/** §internal.16 A-1 update 类写工具变更前捕获：toolName → args 中目标 id 键 + resultType；create 类无条目 → before null */
const BEFORE_CAPTURE_TOOLS: Record<string, { idKey: string; resultType: string }> = {
  // B 路径 proxy 写（目标在外部系统，无本地实体 → before 用 args 摘要）
  update_customer_status: { idKey: 'customerId', resultType: 'proxy_call' },
};

/**
 * E-1 字段级变更审计：写操作目标记录的标准化快照（JSON 字符串）。
 * - after：本地实体（event/crm_task/pm_task/app_request/todo）按 resultId 重查全量字段；
 *   B 路径外部写（proxy_call）用 execute 返回数据兜底（目标在 Java 系统，无本地表）。
 * - before：本地写工具当前均为 create 类（无 update 场景），留空；未来本地 update 工具出现时
 *   在调用点（ToolExecutionService.executeWrite）execute 前补抓。
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

  /**
   * after 快照：本地实体按 id 重查；外部（无本地实体映射）用 fallback（execute 返回数据）。
   *
   * REV-13：返回 `CaptureResult`（含**成因**），不再只给一个 `null` —— 调用方需要拿它去回答
   * 「为什么没有」，而不是把四种「没有」压成一个 bit。
   */
  async captureAfter(
    resultType: string,
    resultId: number,
    fallback?: unknown,
  ): Promise<CaptureResult> {
    try {
      const target = resolveLocalEntity(this.entityManager, resultType);
      if (!target) {
        // 无本地实体（外部写）→ 回退到 execute 返回数据。**回退本身不是「缺」**：
        // 拿得到内容就是有效快照、不置标；只有回退后仍为空才算这一种「没有」。
        if (fallback == null) return { json: null, reason: 'no_entity_and_empty_fallback' };
        const json = this.normalize(fallback);
        return json ? { json, reason: null } : { json: null, reason: 'failed' };
      }
      const repo = this.entityManager.getRepository(target.name);
      const row = await repo.findOne({ where: { id: resultId } } as any);
      // 实体解析得到、行却不在：**异常**（目标不在了），必须与「设计上的缺席」分得开
      if (!row) return { json: null, reason: 'row_missing' };
      const json = this.normalize(row);
      return json ? { json, reason: null } : { json: null, reason: 'failed' };
    } catch (err) {
      this.logger.warn(`[SnapshotCaptor] captureAfter failed ${resultType}#${resultId}: ${(err as Error).message}`);
      return { json: null, reason: 'failed' };
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
      out[k] = isSensitiveKey(k) ? REDACTED : this._sanitize(v, depth + 1);
    }
    return out;
  }
}
