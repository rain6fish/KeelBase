#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0

/**
 * 测试类型棘轮（test-type ratchet）。
 *
 * **为什么需要它**：生产代码的类型**已被守着**——`tsconfig.build.json` 排除 spec，CI 的 `build` job
 * 跑 `npm run build`，所以 `src/**`（非 spec）类型一旦出错就会红。但**测试文件从来没被类型检查过**：
 * ts-jest 只转译、不做类型诊断，而没有任何门禁跑 `tsc` 覆盖 `test/**` / `**\/*.spec.ts`。于是错误静默
 * 累积——实测 **214 个**，其中 `TS2339`（属性不存在）/`TS2345`（实参不匹配）这类恰恰标记着
 * **测试与接口已经对不上**的地方，而没有人能看见。
 *
 * **为什么是「棘轮」而不是「清零」**：214 里大部分是 jest mock 的空值严格性噪声（`TS18046/47/48`
 * 共 72 个），一次性清掉是低价值的机械劳动。棘轮只做一件事：**不许再变多**。数目降下来了，就把下面的
 * BASELINE 调小；CI 会因此奖励下降、拦住上升。让不可见的变可见，而不逼着现在做一次大扫除。
 *
 * **判据**：只统计「测试文件」里的类型错误（`*.spec.ts` / `*.e2e-spec.ts` / `test/` 下）。
 * 生产文件的错误**不在这里管**——那由 `npm run build` 负责，两者分工明确。
 *
 * 用法（仓库根）：node scripts/check-test-types.mjs
 * 退出码：0 = 未超过基线；1 = 超过了（打印新出现的文件与建议）
 */

import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BE = resolve(__dirname, '../Server-NestJS');

/**
 * 基线：当前测试文件的类型错误数。**只许下调**（修好一批就把这个数改小）。
 * 若要上调，请在提交信息里说明为什么必须接受新的债务。
 */
const BASELINE = 214;

/** 一行 tsc 输出是否属于「测试文件」：`路径(行,列): error TSxxxx: ...` */
const isTestFileError = (line) =>
  /\.spec\.ts\(\d+,\d+\): error TS/.test(line) || /e2e-spec\.ts\(\d+,\d+\): error TS/.test(line);

function runTsc() {
  try {
    execSync('npx tsc --noEmit', { cwd: BE, encoding: 'utf8', stdio: 'pipe' });
    return '';
  } catch (err) {
    // 类型错误会让 tsc 以非零退出——这正是常态，输出在 stdout
    return `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
}

console.log('运行 tsc --noEmit（只看测试文件）…');
const output = runTsc();
const errorLines = output.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
const testErrors = errorLines.filter(isTestFileError);

const byFile = new Map();
for (const line of testErrors) {
  const file = line.split('(')[0];
  byFile.set(file, (byFile.get(file) ?? 0) + 1);
}
const top = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

console.log(`测试文件的类型错误：${testErrors.length}（基线 ${BASELINE}）`);
console.log(`生产文件的类型错误：${errorLines.length - testErrors.length}（由 npm run build 负责，不在本闸判据内）`);
if (top.length) {
  console.log('错误最多的测试文件：');
  for (const [file, n] of top) console.log(`  ${String(n).padStart(3)}  ${file}`);
}

if (testErrors.length > BASELINE) {
  console.error(
    `\n✗ 测试类型错误比基线多了 ${testErrors.length - BASELINE} 个（${testErrors.length} > ${BASELINE}）。`,
  );
  console.error('  新引入的类型错误会掩盖「测试与接口已对不上」这类问题。');
  console.error('  修掉新增的这些；若确属既有债务迁移，请连同 BASELINE 一起上调并说明理由。');
  process.exit(1);
}

if (testErrors.length < BASELINE) {
  console.log(
    `\n✓ 未超基线，且比基线少 ${BASELINE - testErrors.length} 个 —— 请把 scripts/check-test-types.mjs 的 BASELINE 改为 ${testErrors.length}，锁住这次改善。`,
  );
} else {
  console.log('\n✓ 未超基线。');
}
process.exit(0);
