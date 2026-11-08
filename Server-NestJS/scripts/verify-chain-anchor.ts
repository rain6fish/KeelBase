#!/usr/bin/env ts-node

// SPDX-License-Identifier: Apache-2.0
/**
 * Verify a daily audit-chain anchor (`audit-chain-anchor` v1, docs/hs11-audit-chain.spec.md §6.3).
 *
 * Two questions, kept apart:
 *   1. Is this record the one that was signed? (`verifyChainAnchor`; public key only)
 *   2. Is the tail it commits to still there? (`verifyChainAnchorAgainst`; needs the current rows)
 *
 * The first works offline and is what a verifier outside the trust domain runs. The second reads
 * this instance's chains and is what the operator runs after the fact. `--no-db` skips the second
 * and says so instead of calling an unanswered question a pass.
 *
 * Usage:
 *   ts-node scripts/verify-chain-anchor.ts <anchor.json> [--public-key <hex>] [--no-db] [--json]
 *
 * Exit codes: 0 both questions answered and clean; 1 a verdict is negative; 2 usage/environment.
 *
 * 校验一份审计链日锚（`audit-chain-anchor` v1，docs/hs11-audit-chain.spec.md §6.3）。
 *
 * 两个问题分开回答：① 这份记录是不是被签的那份（`verifyChainAnchor`，只需公钥）；② 它承诺的链尾
 * 还在不在（`verifyChainAnchorAgainst`，需要当前行）。前者离线可跑，是信任域之外的人做的事；后者读
 * 本实例的两条链，是运维事后做的事。`--no-db` 跳过第二问，并**明说**它没被回答，而不是把它当成通过。
 *
 * 用法：ts-node scripts/verify-chain-anchor.ts <anchor.json> [--public-key <hex>] [--no-db] [--json]
 * 退出码：0 两问都已回答且干净；1 有否定结论；2 用法/环境问题。
 */
import { readFileSync } from 'node:fs';
import { AppDataSource } from '../src/config/typeorm-data-source';
import { AiAuditLog } from '../src/governance-shared/entities/ai-audit-log.entity';
import { OperationAuditLog } from '../src/operation-audit/operation-audit-log.entity';
import {
  AuditChainAnchor,
  verifyChainAnchor,
  verifyChainAnchorAgainst,
} from '../src/ai/audit/chain-anchor';

function usage(): void {
  console.error(
    '用法：ts-node scripts/verify-chain-anchor.ts <anchor.json> [--public-key <hex>] [--no-db] [--json]',
  );
  console.error(
    'Usage: ts-node scripts/verify-chain-anchor.ts <anchor.json> [--public-key <hex>] [--no-db] [--json]',
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let file: string | null = null;
  let publicKeyHex: string | undefined;
  let noDb = false;
  let asJson = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--public-key') {
      publicKeyHex = argv[++i];
      if (!publicKeyHex) {
        console.error('✗ --public-key 需要一个值 / --public-key needs a value');
        usage();
        process.exitCode = 2;
        return;
      }
    } else if (a === '--no-db') noDb = true;
    else if (a === '--json') asJson = true;
    else if (a === '--help' || a === '-h') {
      usage();
      return;
    } else if (!a.startsWith('--') && !file) file = a;
    else {
      console.error(`✗ 未知参数 / unknown argument: ${a}`);
      usage();
      process.exitCode = 2;
      return;
    }
  }

  if (!file) {
    usage();
    process.exitCode = 2;
    return;
  }

  let anchor: AuditChainAnchor;
  try {
    anchor = JSON.parse(readFileSync(file, 'utf8')) as AuditChainAnchor;
  } catch (e) {
    console.error(`✗ 锚文件读不出 / cannot read anchor: ${(e as Error).message}`);
    process.exitCode = 2;
    return;
  }

  const self = verifyChainAnchor(anchor, publicKeyHex ? { publicKeyHex } : {});
  if (!publicKeyHex) {
    console.log(
      '  ! 未传 --public-key：用锚内公钥校验。它只证明记录未被改；域外验证请传自持公钥。\n' +
        '  ! No --public-key: verifying with the in-record key. That proves the record was not changed,\n' +
        '    not who signed it; a verifier outside the trust domain should pass its own key.',
    );
  }

  if (!self.ok) {
    const out = { self, comparison: null, tailCompared: false };
    if (asJson) console.log(JSON.stringify(out, null, 2));
    else {
      console.log('✗ 锚自身校验失败 / anchor self-check failed:');
      for (const r of self.reasons) console.log(`  - ${r}`);
    }
    process.exitCode = 1;
    return;
  }

  if (noDb) {
    const out = { self, comparison: null, tailCompared: false };
    if (asJson) console.log(JSON.stringify(out, null, 2));
    else {
      console.log('✓ 锚自身校验通过 / anchor self-check passed.');
      console.log(
        '  · 未跑链尾对照（--no-db）：observedAt 之后的删除未被回答。\n' +
          '  · Tail comparison not run (--no-db): a deletion after observedAt is not answered.',
      );
    }
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
    const comparison = verifyChainAnchorAgainst(anchor, { aiAudit: aiRows, operationAudit: opRows });

    if (asJson) console.log(JSON.stringify({ self, comparison, tailCompared: true }, null, 2));
    else {
      console.log('✓ 锚自身校验通过 / anchor self-check passed.');
      for (const name of ['aiAudit', 'operationAudit'] as const) {
        const c = comparison.chains[name];
        console.log(`  ${c.ok ? '✓' : '✗'} ${name}: ${c.status}`);
        for (const r of c.reasons) console.log(`      ${r}`);
      }
      console.log(
        comparison.ok
          ? '✓ 对照通过：签名过的链尾仍在 / comparison passed: the signed tails are still there.'
          : '✗ 对照失败：见上 / comparison failed: see above.',
      );
    }
    process.exitCode = comparison.ok ? 0 : 1;
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}

main().catch((e: Error) => {
  console.error(`✗ ${e.message}`);
  process.exitCode = 2;
});
