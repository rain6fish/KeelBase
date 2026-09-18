#!/usr/bin/env ts-node

// SPDX-License-Identifier: Apache-2.0
/**
 * 产出证据根定期锚（docs/evidence-root.spec.md §11.3，D-4b）。
 *
 * 输入：一批已导出的证据包 JSON（`GET /ai/governance/evidence-root/:resultType/:resultId` 的产物）。
 * 行为：按 `exportedAt` 的 UTC 日期分组 → 每组抽 `root.digest` 聚合 → 用 SM2 私钥对 rootDigest 签名
 *       → 写 `evidence-anchor-<date>.json`。
 *
 * **发布渠道不在本脚本职责内**（§11.3 / 执行包 §5 待拍板项）：锚必须交**信任域之外**的渠道发布/接收
 * （自持锚 = 空心承诺）。本脚本只负责把锚**做出来并签好**。
 *
 * 用法：
 *   ts-node scripts/build-evidence-anchor.ts <pkg.json...> [--date YYYY-MM-DD] [--out <dir>]
 *   SM2_PRIVATE_KEY="$(cat k.pem)" SM2_KEY_ID=kms-2026-09 npm run anchor:evidence -- pkg1.json pkg2.json
 *
 * 需要：SM2 私钥（环境 SM2_PRIVATE_KEY，PKCS#8 PEM）+ 宿主 openssl（1.1.1+，建议 3.x）。
 * 缺任一 → 明确报错退出，**不产出未签名或半成品锚**（执行包 §6.4「缺库不静默」）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  AnchorSourcePackage,
  buildAnchor,
  groupDigestsByDate,
  verifyAnchor,
} from '../src/ai/audit/evidence-anchor';

function main(): void {
  const argv = process.argv.slice(2);
  const files: string[] = [];
  let date: string | null = null;
  let outDir = process.cwd();

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date') date = argv[++i] ?? null;
    else if (a === '--out') outDir = argv[++i] ?? outDir;
    else if (a.startsWith('--')) {
      console.error(`未知参数：${a}`);
      process.exit(1);
    } else files.push(a);
  }

  if (files.length === 0) {
    console.error('用法：ts-node scripts/build-evidence-anchor.ts <pkg.json...> [--date YYYY-MM-DD] [--out <dir>]');
    process.exit(1);
  }

  const packages: AnchorSourcePackage[] = [];
  for (const f of files) {
    const p = resolve(f);
    if (!existsSync(p)) {
      console.error(`✗ 文件不存在：${p}`);
      process.exit(1);
    }
    try {
      packages.push(JSON.parse(readFileSync(p, 'utf8')) as AnchorSourcePackage);
    } catch (e) {
      console.error(`✗ 无法解析证据包 ${f}：${(e as Error).message}`);
      process.exit(1);
    }
  }

  const byDate = groupDigestsByDate(packages);
  const dates = [...byDate.keys()].sort().filter((d) => !date || d === date);
  if (dates.length === 0) {
    console.error(
      date
        ? `✗ ${files.length} 个包中没有导出日期为 ${date} 的（实际日期：${[...byDate.keys()].sort().join(', ') || '无'}）`
        : '✗ 没有可从包中抽出 root.digest 的记录（包缺 root.digest / exportedAt？）',
    );
    process.exit(1);
  }

  let failed = false;
  for (const d of dates) {
    const digests = byDate.get(d) ?? [];
    try {
      const anchor = buildAnchor({ date: d, digests });
      const check = verifyAnchor(anchor);
      if (!check.ok) {
        console.error(`✗ ${d}：锚自校验未过 —— ${check.reasons.join('；')}`);
        failed = true;
        continue;
      }
      const outPath = join(outDir, `evidence-anchor-${d}.json`);
      writeFileSync(outPath, JSON.stringify(anchor, null, 2) + '\n');
      console.log(`✓ ${d}：${digests.length} 个包 → rootDigest ${anchor.rootDigest.slice(0, 16)}…`);
      console.log(`  锚：${outPath}（keyId=${anchor.sm2.keyId ?? '—'} userId=${anchor.sm2.userId}）`);
      console.log('  发布提醒：锚须交**信任域之外**的渠道发布，自持锚不构成可举证材料（§11.3 / 执行包 §6.2）。');
    } catch (e) {
      console.error(`✗ ${d}：${(e as Error).message}`);
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
