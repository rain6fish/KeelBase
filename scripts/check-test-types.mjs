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
 *
 * 2026-09-28 由 212 下调至 **195**：`ai.service.spec.ts` 清掉了两族存量债 —— 13 处对 `AsyncIterable`
 * 调 `.next()`（改按声明的接口取迭代器，不加类型断言）、4 处把半截对象当 `AiTool` 传（改用一个满足该
 * 接口的 `mockTool` 助手）。下调即**锁住**这次改善：同样的债再回来会立刻被这道闸拦住。
 *
 * **⚠ 同一批里先犯过一次，写在这儿免得再犯**：第一版把 `const it = stream[Symbol.asyncIterator]()`
 * 直接套在**同时还会 `for await` 那 6 个块**上 —— `AsyncIterator` 本身不再可取迭代器，于是新增了
 * **6 条 TS2504 + 1 条 TS7053**；而当时**只看了条数（12）没看错误码**，就把基线从 212 下调到 202，
 * 等于**把自己新造的错误洗进了基线**（棘轮「不比基线多」照样满足，闸门是绿的）。
 * ⇒ **规程：先列错误码确认没有新增，再动这个数。** 现在两个句柄各司其职（`stream` 供 `for await`、
 * `it` 供 `.next()`），基线 195 才是诚实的读数。
 *
 * **195 → 193（2026-10-02）**：管理端用户视图收敛到单一实现（`sanitizeUserForAdmin`）时，
 * `getUserDetail` 里那串 `Record<string, unknown>` 造型不再需要，消掉 2 条 TS2339。
 * **按上面的规程做过比对**：错误码分布除 TS2339 33→31 外完全相同，**新增集合为空**。
 * The admin user view was collapsed into one implementation, retiring two TS2339s; the
 * code-by-code diff showed no additions, only those two removals.
 *
 * **193 → 188 (2026-10-19)**: a recheck against commit `67519821` (the state that set 193)
 * found the same set of error codes and no additions. The net five fewer errors come from
 * retired TS2339/TS18048/TS2739/TS2322 entries; TS2345/TS18047/TS2769 moved only inside
 * files that already carried them. The ratchet is locked at the current reading.
 * **193 → 188（2026-10-19）**：对落定 193 的提交 `67519821` 复跑 tsc 复核，错误码集合无新增；
 * 净减 5 条来自 TS2339/TS18048/TS2739/TS2322 的既有清理，TS2345/TS18047/TS2769 只在既有文件内
 * 增减。按「先列错误码、确认无新增再下调」的规程，锁住当前读数。
 *
 * **188，口径修正 (2026-10-20)**: the predicate now also counts files under `test/`
 * (`test/ai-service.testbed.ts` had been filed as production code since the gate's first
 * version). The two errors that the widened scope exposed were fixed — the testbed's
 * `mockAuditService` was missing `reserveDailyUsage`/`releaseDailyUsage`, and a new
 * `confirmation.store.spec.ts` assertion read `decidedAt` off a fixture that did not declare
 * it — so the reading stays 188 under the wider predicate.
 * **188，口径修正（2026-10-20）**：判据改为也统计 `test/` 下的文件（`test/ai-service.testbed.ts`
 * 自闸门第一版起一直被算作「生产文件」）。放宽后暴露的两条已修——testbed 的 `mockAuditService`
 * 缺 `reserveDailyUsage`/`releaseDailyUsage`；`confirmation.store.spec.ts` 新增的断言读了一个
 * 未声明 `decidedAt` 的夹具字段——故放宽后读数仍是 188。
 */
const BASELINE = 188;

/**
 * 一行 tsc 输出是否属于「测试文件」：`路径(行,列): error TSxxxx: ...`
 *
 * Matches the predicate documented above: `*.spec.ts`, `*.e2e-spec.ts`, and anything under
 * `test/` — including helper files such as `test/ai-service.testbed.ts`, which a spec-only
 * pattern silently counted as production code.
 * 与上面的判据一致：`*.spec.ts`、`*.e2e-spec.ts`、`test/` 下的全部文件——包括
 * `test/*.testbed.ts` 这类辅助文件；只认 `.spec.ts` 时它们会被默默算进「生产文件」。
 */
const isTestFileError = (line) =>
  /\.spec\.ts\(\d+,\d+\): error TS/.test(line) || /(^|[\\/])test[\\/][^(]*\(\d+,\d+\): error TS/.test(line);

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
