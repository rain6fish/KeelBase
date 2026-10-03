// SPDX-License-Identifier: Apache-2.0

/**
 * Fails fast, with a readable message, when the runtime is older than this script's requirement.
 *
 * `node:sqlite` — and with it `DatabaseSync` — only exists from Node 22.5. Two scripts in this
 * directory use it, and nothing else in the repo does: the server itself runs on the `better-sqlite3`
 * package, whose own engines allow Node 20. So the repo declares Node >= 22 (the line CI actually
 * tests) and this one narrower requirement is stated by the two scripts that carry it, rather than
 * showing up as a bare "Cannot find module 'node:sqlite'".
 *
 * Import this **before** `node:sqlite` — ESM evaluates imports in source order, so a guard placed
 * first stops the process before the unresolvable import is evaluated.
 *
 * 运行时低于本脚本要求时**立刻停下**并给出可读的说明。
 *
 * `node:sqlite`（连同 `DatabaseSync`）自 Node 22.5 才有。本目录两个脚本用它，仓里没有别处用 ——
 * 后端起在 `better-sqlite3` 包上，而那个包自己的 engines 允许 Node 20。所以本仓声明 Node ≥ 22
 * （CI 真正测过的那条线），而这**一条更窄的要求**由带它的那两个脚本自己讲清楚，而不是抛出光秃秃的
 * `Cannot find module 'node:sqlite'`。
 *
 * 要**先于** `node:sqlite` 导入 —— ESM 按源码顺序求值 import，守卫放在前面就能在解析不了的那个
 * import 被求值之前结束进程。
 */

/** 纯函数，便于实测两个分支（不读环境） */
export function isNodeAtLeast22_5(version = process.versions.node) {
  const [major, minor] = String(version).split('.').map((n) => parseInt(n, 10));
  return major > 22 || (major === 22 && minor >= 5);
}

if (!isNodeAtLeast22_5()) {
  console.error(
    `✗ 本脚本需要 Node ≥ 22.5（node:sqlite 自该版本提供）；当前 v${process.versions.node}。\n` +
      `  后端起服务本身只需 Node ≥ 22 —— 是这一个脚本的要求更窄。\n` +
      `  This script needs Node >= 22.5 (where node:sqlite landed); running v${process.versions.node}.`,
  );
  process.exit(1);
}
