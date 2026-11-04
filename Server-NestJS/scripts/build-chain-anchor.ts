#!/usr/bin/env ts-node

// SPDX-License-Identifier: Apache-2.0
/**
 * Build the daily audit-chain anchor (`audit-chain-anchor` v1, `docs/hs11-audit-chain.spec.md` §6.1).
 *
 * It reads the two audit hash chains from the business database, records each chain's hashed row
 * count and last row at `observedAt`, and signs the commitment with the SM2 key from the
 * environment. The output is a single `audit-chain-anchor-<date>.json`.
 *
 * Run it **after** the UTC day has closed: the anchor is a snapshot of `observedAt`, and rows written
 * after that instant are not covered until the next anchor. Publication is not this script's job —
 * the anchor only means something when it is published outside KeelBase's trust domain.
 *
 * Usage:
 *   ts-node scripts/build-chain-anchor.ts [--observed-at <RFC3339 UTC>] [--date YYYY-MM-DD] [--out <dir>]
 *   SM2_PRIVATE_KEY="$(cat k.pem)" npm run anchor:chain
 *
 * Needs: SM2 private key (env `SM2_PRIVATE_KEY`, PKCS#8 PEM) + host openssl (1.1.1+, 3.x preferred).
 * Missing either → explicit error, no unsigned or half-built anchor (the same rule as
 * `build-evidence-anchor.ts`).
 *
 * 产出每日审计链日锚（`audit-chain-anchor` v1，`docs/hs11-audit-chain.spec.md` §6.1）。
 *
 * 它从业务库读两条审计哈希链，在 `observedAt` 记下每条链的已入链行数与末行，并用环境里的 SM2
 * 私钥对这份承诺签名。产物是一份 `audit-chain-anchor-<date>.json`。
 *
 * **UTC 日切之后**再跑：锚是 `observedAt` 那一刻的快照，此后的写入要等下一次锚。发布不是本脚本的
 * 职责 —— 锚只有交到 KeelBase 信任域之外才有意义。
 *
 * 用法：
 *   ts-node scripts/build-chain-anchor.ts [--observed-at <RFC3339 UTC>] [--date YYYY-MM-DD] [--out <dir>]
 *   SM2_PRIVATE_KEY="$(cat k.pem)" npm run anchor:chain
 *
 * 需要：SM2 私钥（环境 `SM2_PRIVATE_KEY`，PKCS#8 PEM）+ 宿主 openssl（1.1.1+，建议 3.x）。缺任一 →
 * 明确报错，不产出未签名或半成品锚（与 `build-evidence-anchor.ts` 同一原则）。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppDataSource } from '../src/config/typeorm-data-source';
import { AiAuditLog } from '../src/governance-shared/entities/ai-audit-log.entity';
import { OperationAuditLog } from '../src/operation-audit/operation-audit-log.entity';
import { ChainTail, buildChainAnchor, tailsFromRows } from '../src/ai/audit/chain-anchor';

function usage(): void {
  console.error(
    '用法：ts-node scripts/build-chain-anchor.ts [--observed-at <RFC3339 UTC>] [--date YYYY-MM-DD] [--out <dir>]',
  );
}

function tailText(tail: ChainTail | null): string {
  return tail ? `${tail.rows} 行，末行 id=${tail.lastId}` : '空链（无已入链行）';
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let outDir = process.cwd();
  let observedAt: string | null = null;
  let date: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') outDir = argv[++i] ?? outDir;
    else if (a === '--observed-at') observedAt = argv[++i] ?? null;
    else if (a === '--date') date = argv[++i] ?? null;
    else if (a === '--help' || a === '-h') {
      usage();
      return;
    } else {
      console.error(`未知参数：${a}`);
      usage();
      process.exitCode = 1;
      return;
    }
  }

  const at = observedAt ?? new Date().toISOString();
  const day = date ?? at.slice(0, 10);
  if (day !== at.slice(0, 10)) {
    console.error(`✗ --date(${day}) 与 observedAt 的 UTC 日期(${at.slice(0, 10)}) 不一致`);
    process.exitCode = 1;
    return;
  }

  await AppDataSource.initialize();
  try {
    const aiRows = await AppDataSource.getRepository(AiAuditLog).find({
      select: { id: true, hash: true },
      order: { id: 'ASC' },
    });
    const opRows = await AppDataSource.getRepository(OperationAuditLog).find({
      select: { id: true, hash: true },
      order: { id: 'ASC' },
    });

    const chains = {
      aiAudit: tailsFromRows(aiRows),
      operationAudit: tailsFromRows(opRows),
    };
    const anchor = buildChainAnchor({ date: day, observedAt: at, chains });

    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `audit-chain-anchor-${day}.json`);
    writeFileSync(outPath, JSON.stringify(anchor, null, 2) + '\n');

    console.log(`✓ ${day}：aiAudit ${tailText(chains.aiAudit)} · operationAudit ${tailText(chains.operationAudit)}`);
    console.log(`  rootDigest ${anchor.rootDigest.slice(0, 16)}…`);
    console.log(`  锚：${outPath}`);
    console.log('  发布提醒：锚须交**信任域之外**的渠道发布，自持锚不构成可举证材料（§6.1）。');
    console.log('  覆盖边界：只到 observedAt、只数已入链的行（hash IS NOT NULL）。');
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

main().catch((e: Error) => {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
});
