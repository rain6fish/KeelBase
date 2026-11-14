// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiToolResultBody } from '../entities/ai-tool-result-body.entity';

/**
 * Persistence for the 0-B retention rows. Deliberately dumb: it writes, reads and expires; it does
 * not decide what a body is, how it is masked or whether it should be kept. Those choices belong to
 * `ToolResultRetentionService` in the AI layer, which is the only thing allowed to import the AI
 * sanitizer — `governance-shared` must not import `src/ai/**`.
 *
 * The governance runtime imports this module too; the store is harmless there because nothing in
 * that process calls it.
 *
 * 0-B 留存行的持久化。刻意做得笨：只写、读、过期；它不决定「正文是什么、怎么脱敏、要不要留」。
 * 那些选择归 AI 层的 `ToolResultRetentionService`，也只有它被允许 import AI 的脱敏器 ——
 * `governance-shared` 不得 import `src/ai/**`。
 *
 * 治理运行时也 import 本模块；它无害，因为那个进程没有任何东西调用本仓储。
 */
@Injectable()
export class ToolResultBodyStore {
  constructor(
    @InjectRepository(AiToolResultBody)
    private readonly repo: Repository<AiToolResultBody>,
  ) {}

  /**
   * Insert unless the `audit_row_id` is already present. The unique index is the idempotency gate:
   * a retried tool call must not create a second body, and the writer must not have to guess whether
   * it is "the same call".
   *
   * 若 `audit_row_id` 已存在则不插入。唯一索引就是幂等闸：重试的调用不得产生第二份正文，写入方也
   * 不必去猜「是不是同一次调用」。
   */
  async saveIfAbsent(row: Partial<AiToolResultBody>): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(AiToolResultBody)
      .values(row)
      .orIgnore()
      .execute();
  }

  findOneByAuditRow(auditRowId: number): Promise<AiToolResultBody | null> {
    return this.repo.findOne({ where: { auditRowId } });
  }

  /**
   * Clear the text of rows past their window, leaving the tombstone (hashes, sizes, flags). Not a
   * delete: "expired" must stay distinguishable from "never retained".
   *
   * 窗口已过的行清空文本、保留墓碑（哈希/大小/标记）。不是删除：「过期」必须与「从未留存」可区分。
   */
  async expireBefore(now: Date): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update(AiToolResultBody)
      .set({ bodyText: null, modelText: null, bodyState: 'expired' })
      .where('body_state IN (:...states)', { states: ['stored', 'capped'] })
      .andWhere('expires_at < :now', { now })
      .execute();
    return result.affected ?? 0;
  }
}
