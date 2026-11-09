// SPDX-License-Identifier: Apache-2.0

import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiWriteClaim } from '../entities/ai-write-claim.entity';
import { AiToolSideEffect } from '../entities/ai-tool-side-effect.entity';

/**
 * The only identity-based bridge from a business object to the audit rows about it.
 *
 * <p>An audit row carries no business object. The write claim does: `audit_row_id` is the row,
 * `effect_id` is what landed, and the effect row carries `result_type` + `result_id`. Pairing by
 * tool name plus time was rejected for evidence pairing (ACT-2/ACT-5) because the same tool called
 * twice in one conversation cannot be told apart that way; the same objection applies here, so this
 * service walks the claim and nothing else.
 *
 * <p><b>Optional repositories on purpose.</b> The standalone governance runtime registers the
 * effect table but not the claim table. There, the index does not exist — and answering "no match"
 * would be a false negative. {@link available} lets the caller say so (503) instead of pretending.
 *
 * 业务对象 → 与它有关的审计行，**唯一**按身份搭起来的桥。
 *
 * <p>审计行本身不带业务对象。写占位行带：`audit_row_id` 是哪一条审计行，`effect_id` 是落下去的
 * 什么，而副作用行带着 `result_type` + `result_id`。按工具名加时间配对在证据配对上早已被否
 * （ACT-2/ACT-5）—— 同一会话里同名工具被调两次，那样分不开；这里同理，故本服务只走占位行。
 *
 * <p><b>仓储刻意可空。</b> 独立治理台注册了副作用表、没注册占位表。在那里索引**不存在**，而
 * 「无匹配」会是假阴性。{@link available} 让调用方如实说不知道（503），而不是装作知道。
 */
@Injectable()
export class AuditObjectIndexService {
  constructor(
    @Optional()
    @InjectRepository(AiWriteClaim)
    private readonly claimsRepo?: Repository<AiWriteClaim>,
    @Optional()
    @InjectRepository(AiToolSideEffect)
    private readonly effectsRepo?: Repository<AiToolSideEffect>,
  ) {}

  /** Whether this process can resolve an object at all. */
  get available(): boolean {
    return Boolean(this.claimsRepo && this.effectsRepo);
  }

  /**
   * Audit row ids linked to one business object. Empty means "nothing links", which is a real
   * answer; callers must check {@link available} first, or an unavailable index reads as "no match".
   *
   * 与一个业务对象相连的审计行 id。空 = 「没有任何链接」，那是**真答案**；调用方必须先查
   * {@link available}，否则「索引不可用」会被读成「无匹配」。
   */
  async auditRowIdsFor(objectType: string, objectId: number): Promise<number[]> {
    if (!this.claimsRepo || !this.effectsRepo) return [];
    const effects = await this.effectsRepo.find({
      where: { resultType: objectType, resultId: objectId },
    });
    if (effects.length === 0) return [];
    const claims = await this.claimsRepo.find({
      where: { effectId: In(effects.map((e) => e.id)) },
    });
    const ids = new Set<number>();
    for (const claim of claims) {
      if (claim.auditRowId != null) ids.add(claim.auditRowId);
    }
    return [...ids];
  }
}
