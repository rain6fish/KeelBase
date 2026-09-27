// SPDX-License-Identifier: Apache-2.0

/**
 * 夹具身份（REV-15 的 `source` 标签靠它区分「夹具」与「生产」）。
 *
 * **单一源**：**构造**夹具 userId 与**判读**某个 userId 是不是夹具，用同一个前缀。两处各写一次
 * `'eval:'` 就会漂移成「评测确实在用夹具身份，而计数器把它记成生产」——那会让计数器的读数恰好
 * 在它要回答的那个问题上失效。
 *
 * 今天的夹具只有评测套件一个（`ai-eval.service.ts`，CR-18 起每次 run 用独立 userId，不共享系统
 * 账号 `'0'` 的配额/记忆/审计）。
 *
 * ⚠ **安全演示（security-showcase）以真实用户身份运行，因此计为「生产」**——它不是本文件的夹具。
 * 若希望它也算夹具，是**改本文件一处**的事，但那**是个口径选择**（「演示算不算夹具」），
 * 不是实现细节：算作夹具会让 `production` 读数少掉演示场景，算作生产会让「生产是否拒绝过真实
 * 调用」被演示流量稀释。**当前按「真实用户 → 生产」记**，理由是判据只认身份来源、不认调用意图。
 */
export const FIXTURE_USER_ID_PREFIX = 'eval:';

/** 该 userId 是否属于夹具（评测 run）。 */
export function isFixtureUser(userId: string | number | null | undefined): boolean {
  return typeof userId === 'string' && userId.startsWith(FIXTURE_USER_ID_PREFIX);
}

/** 构造一次评测 run 的夹具 userId。构造点与本判据共用前缀，故两者不可能漂移。 */
export function fixtureUserId(started: number): string {
  return `${FIXTURE_USER_ID_PREFIX}${started}`;
}
