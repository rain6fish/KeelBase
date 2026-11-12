// SPDX-License-Identifier: Apache-2.0

/**
 * Names the one runtime known to hard-crash the e2e suite on Windows, before jest starts.
 *
 * On Windows, Node 24 below 24.19.0 can die mid-run with 0xC0000409 (STATUS_STACK_BUFFER_OVERRUN) —
 * no FAIL line, no JS stack, no summary (nodejs/node#62260, an upstream V8/Maglev defect).
 * `run-e2e-shards.mjs` already reports such a shard by its exit code and retries it; that is correct
 * but silent about the cause. This module states the cause up front and points at the measured
 * readings, so a crash budget is not mistaken for a flaky suite.
 *
 * It warns rather than exits, because the crash is probabilistic and a retried run can still finish
 * green — this is not the "script cannot work" case that `require-node-22-5.mjs` handles by exiting.
 * CI runs Node 22 on Linux, outside the reported surface, and the repo's `engines` stays `>=22` for
 * the same reason. 24.19.0 is the boundary because the upstream issue records 24.12.0 and 24.15.0
 * crashing while 24.19.0 and 24.22.2 do not.
 *
 * 在 jest 起跑之前，点名唯一已知会在 Windows 上把 e2e 硬崩的那个运行时。
 *
 * Windows 上 Node 24 低于 24.19.0 可能在跑批中途以 0xC0000409（STATUS_STACK_BUFFER_OVERRUN）死亡 ——
 * 没有 FAIL 行、没有 JS 栈、没有汇总行（nodejs/node#62260，上游 V8/Maglev 缺陷）。`run-e2e-shards.mjs`
 * 已按退出码报出这种分片并重试；那是对的，但没说成因。本模块把成因提前讲明并指向实测读数，免得把
 * 「崩溃预算」误当成套件本身不稳。
 *
 * 只警告、不退出：崩溃是概率性的，重试后仍可能跑绿，所以这不是 `require-node-22-5.mjs` 那种「脚本
 * 无法工作」的情形。CI 跑在 Linux 的 Node 22 上，不在已报告的影响面内，仓的 `engines` 也出于同一
 * 理由保持 `>=22`。边界取 24.19.0：上游单里 24.12.0 与 24.15.0 实测崩、24.19.0 与 24.22.2 不崩。
 */

export const E2E_CRASH_DOC = 'docs/manual/e2e-crash-1111.md';

/** Pure, so both branches are testable without touching the real runtime. */
export function isKnownE2eCrashRuntime(platform = process.platform, version = process.versions.node) {
  if (platform !== 'win32') return false;
  const [major, minor] = String(version).split('.').map((n) => parseInt(n, 10));
  return major === 24 && minor < 19;
}

/** Prints the warning when affected; returns the predicate's answer. */
export function warnIfKnownE2eCrashRuntime(platform = process.platform, version = process.versions.node) {
  if (!isKnownE2eCrashRuntime(platform, version)) return false;
  console.error(
    `⚠ Node ${version} on Windows is inside the known e2e hard-crash window (24.x < 24.19.0, ` +
      `nodejs/node#62260).\n` +
      `  Such a crash has no FAIL line and no JS stack; it exits with 0xC0000409. This runner reports ` +
      `it as unfinished and retries.\n` +
      `  Upgrading to 24.19.0+ removes it (24.22.2 measured 16/16 green). Readings: ${E2E_CRASH_DOC}\n` +
      `⚠ Node ${version} 在 Windows 上落在 e2e 硬崩的已知坏窗口内（24.x < 24.19.0，nodejs/node#62260）。\n` +
      `  这种崩没有 FAIL 行、没有 JS 栈，退出码 0xC0000409；本 runner 会按「未跑完」报出并重试。\n` +
      `  抬到 24.19.0+（24.22.2 实测 16/16 绿）即可消失。读数与判据：${E2E_CRASH_DOC}`,
  );
  return true;
}
