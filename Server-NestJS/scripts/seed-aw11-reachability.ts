#!/usr/bin/env ts-node

// SPDX-License-Identifier: Apache-2.0

/**
 * A-5 reading fixture: deterministic AI-audit rows with known reachability outcomes.
 *
 * This seeds an empty PostgreSQL database so `measure:reachability` has something real to walk.
 * The row shapes are the ones `audit-reachability.spec.ts` already builds (audit → claim → effect
 * + confirmation); they are copied here rather than imported because that file keeps them inside a
 * `describe` block. No model key and no network are involved: every row is written by TypeORM
 * directly, and the counts below are fixed, so a second run over the same database is byte-identical.
 *
 * Four groups, each pinning one outcome the reader must be able to report:
 *
 *   A  fully linked (45, of which 5 sit in the narrow window)  → no gap
 *   B  historical rows with `write_claim_id = NULL` (14)        → claim(no_write_claim_id) and
 *                                                                effect/confirmation(claim_unreachable)
 *   C  linked claim, downstream row absent (4)                  → effect_missing ×2, confirmation_missing ×2
 *   D  dry-run / automatic write (3)                            → notApplicable, not a gap
 *
 * A-5 读数夹具：可达性结局已知的确定性 AI 审计行。
 *
 * 本脚本给空 PostgreSQL 播种，好让 `measure:reachability` 有真行可走。行形状取自
 * `audit-reachability.spec.ts` 已有的写法（审计 → 占位 → 副作用 + 确认）；这里复制而非引用，是因为
 * 那份写法留在 `describe` 块内。全程不涉及模型 key 与网络：每行都由 TypeORM 直接写入，下面的计数是
 * 固定的，故在同一库上复跑逐字相同。
 *
 * 四组，各钉住读取器必须报得出的一种结局：
 *
 *   A  完全链上（45 条，其中 5 条落在窄窗口）  → 无缺口
 *   B  历史行 `write_claim_id = NULL`（14 条）  → claim(no_write_claim_id) 与
 *                                                 effect/confirmation(claim_unreachable)
 *   C  占位在、下游行缺席（4 条）                → effect_missing ×2，confirmation_missing ×2
 *   D  dry-run / 自动写（3 条）                  → notApplicable，不是缺口
 */

import { AppDataSource } from '../src/config/typeorm-data-source';
import { AiAuditLog } from '../src/governance-shared/entities/ai-audit-log.entity';
import { AiWriteClaim, WRITE_CLAIM_STATUS } from '../src/governance-shared/entities/ai-write-claim.entity';
import { AiToolSideEffect } from '../src/governance-shared/entities/ai-tool-side-effect.entity';
import { AiConfirmationRequest } from '../src/governance-shared/entities/ai-confirmation-request.entity';

const RUN_ID = 'aw11pg1103';
const OLD_GROUP_MS = 6 * 24 * 60 * 60 * 1000;
const NARROW_GROUP_MS = 5 * 60 * 1000;

const A_FULLY_LINKED_OLD = 40;
const A_FULLY_LINKED_NARROW = 5;
const B_HISTORICAL = 14;
const C_EFFECT_MISSING = 2;
const C_CONFIRMATION_MISSING = 2;
const D_DRY_RUN = 3;

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const auditRepo = AppDataSource.getRepository(AiAuditLog);
  const claimRepo = AppDataSource.getRepository(AiWriteClaim);
  const effectRepo = AppDataSource.getRepository(AiToolSideEffect);
  const confirmationRepo = AppDataSource.getRepository(AiConfirmationRequest);

  let seq = 0;
  const bump = (): number => ++seq;

  const seedEffect = (): Promise<AiToolSideEffect> =>
    effectRepo.save(
      effectRepo.create({
        idempotencyKey: `${RUN_ID}-effect-${bump()}`,
        userId: 'aw11-demo-user',
        conversationId: 'aw11-conv-1',
        toolName: 'create_followup',
        argsHash: 'h',
        resultType: 'crm_task',
        resultId: bump(),
      }),
    );

  const seedConfirmation = (token: string): Promise<AiConfirmationRequest> =>
    confirmationRepo.save(
      confirmationRepo.create({
        token,
        toolName: 'create_followup',
        args: '{}',
        operatorId: 'aw11-demo-user',
        riskLevel: 'R3',
        status: 'approved',
      }),
    );

  const seedClaim = (over: Partial<AiWriteClaim> = {}): Promise<AiWriteClaim> =>
    claimRepo.save(
      claimRepo.create({
        idempotencyKey: `${RUN_ID}-claim-${bump()}`,
        userId: 'aw11-demo-user',
        conversationId: 'aw11-conv-1',
        toolName: 'create_followup',
        argsHash: 'h',
        status: WRITE_CLAIM_STATUS.SETTLED,
        claimedAt: new Date(),
        attempts: 1,
        ...over,
      }),
    );

  const seedAudit = (writeClaimId?: number | null): Promise<AiAuditLog> =>
    auditRepo.save(
      auditRepo.create({
        userId: 'aw11-demo-user',
        conversationId: 'aw11-conv-1',
        action: 'tool_call',
        tool: 'create_followup',
        outcome: 'executed',
        isError: false,
        writeClaimId: writeClaimId ?? null,
      }),
    );

  const oldAuditIds: number[] = [];
  const narrowAuditIds: number[] = [];

  const fullyLinked = async (target: number[]): Promise<void> => {
    const effect = await seedEffect();
    const token = `${RUN_ID}-token-${bump()}`;
    await seedConfirmation(token);
    const claim = await seedClaim({ effectId: effect.id, authorizationRef: token });
    target.push((await seedAudit(claim.id)).id);
  };

  for (let i = 0; i < A_FULLY_LINKED_OLD; i++) await fullyLinked(oldAuditIds);

  for (let i = 0; i < B_HISTORICAL; i++) oldAuditIds.push((await seedAudit(null)).id);

  for (let i = 0; i < C_EFFECT_MISSING; i++) {
    const token = `${RUN_ID}-token-${bump()}`;
    await seedConfirmation(token);
    const claim = await seedClaim({ effectId: 99_000_000 + i, authorizationRef: token });
    oldAuditIds.push((await seedAudit(claim.id)).id);
  }

  for (let i = 0; i < C_CONFIRMATION_MISSING; i++) {
    const effect = await seedEffect();
    const claim = await seedClaim({ effectId: effect.id, authorizationRef: `${RUN_ID}-absent-token-${i}` });
    oldAuditIds.push((await seedAudit(claim.id)).id);
  }

  for (let i = 0; i < D_DRY_RUN; i++) {
    const claim = await seedClaim({ effectId: null, authorizationRef: null });
    oldAuditIds.push((await seedAudit(claim.id)).id);
  }

  for (let i = 0; i < A_FULLY_LINKED_NARROW; i++) await fullyLinked(narrowAuditIds);

  // `createdAt` is a `@CreateDateColumn`, so TypeORM overwrites whatever the insert carries.
  // 时间列是 `@CreateDateColumn`，插入时携带来的值会被 TypeORM 覆盖，故插完再显式改。
  await AppDataSource.query(`UPDATE ai_audit_logs SET "createdAt" = $1 WHERE id = ANY($2::int[])`, [
    new Date(Date.now() - OLD_GROUP_MS),
    oldAuditIds,
  ]);
  await AppDataSource.query(`UPDATE ai_audit_logs SET "createdAt" = $1 WHERE id = ANY($2::int[])`, [
    new Date(Date.now() - NARROW_GROUP_MS),
    narrowAuditIds,
  ]);

  const claims = await claimRepo.count();
  const effects = await effectRepo.count();
  const confirmations = await confirmationRepo.count();
  console.log(
    [
      'seeded / 已播种',
      `  A fully linked           ${A_FULLY_LINKED_OLD + A_FULLY_LINKED_NARROW}`,
      `  B historical (null edge) ${B_HISTORICAL}`,
      `  C effect_missing         ${C_EFFECT_MISSING}`,
      `  C confirmation_missing   ${C_CONFIRMATION_MISSING}`,
      `  D dry-run                ${D_DRY_RUN}`,
      `  audit rows               ${oldAuditIds.length + narrowAuditIds.length}`,
      `  old group ids            #${Math.min(...oldAuditIds)}–#${Math.max(...oldAuditIds)}`,
      `  narrow group ids         #${Math.min(...narrowAuditIds)}–#${Math.max(...narrowAuditIds)}`,
      `  claims / effects / confirmations  ${claims} / ${effects} / ${confirmations}`,
    ].join('\n'),
  );
}

main()
  .catch((err: Error) => {
    console.error(`✗ seed failed / 播种失败：${err.message}`);
    process.exitCode = 2;
  })
  .finally(() => {
    if (AppDataSource.isInitialized) void AppDataSource.destroy();
  });
