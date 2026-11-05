// SPDX-License-Identifier: Apache-2.0

/**
 * AW-17: the **deployment fact** the coverage statement needs — "is there an external write target we
 * cannot ask about afterwards?" — as a seam, not an import.
 *
 * `CoverageService` lives on the shared side, which must not reach into `src/ai/**` at runtime
 * (S4-H4 C, D5). The enumeration of outbound targets does live there, so it crosses through this token
 * the same way `TOOL_REGISTRY` does. Unbound (the governance console has no outbound targets, and
 * hand-built test assemblies have no registry) means `false` — the deployment default is "nothing to
 * ask", not an invented caveat.
 *
 * AW-17：覆盖声明所需的**部署事实** ——「有没有一个事后问不到的外部写目标？」—— 以接缝形式给出，
 * 而不是 import。
 *
 * `CoverageService` 在共享侧，而共享侧不得在运行时伸进 `src/ai/**`（S4-H4 C 决策 D5）。枚举出站目标
 * 这件事住在那边，故经这个 token 过来，与 `TOOL_REGISTRY` 同一走法。未绑定（治理台没有出站目标，
 * 手工装配的单测没有注册表）取 `false` —— 部署默认是「没有可问的东西」，不是凭空造一条告诫。
 */
export const OUTBOUND_TARGET_FACTS = 'OUTBOUND_TARGET_FACTS';

export interface OutboundTargetFacts {
  /**
   * True when **at least one** outbound **write** target offers no status query: a B-path write tool
   * without `statusPath`, or any external MCP write tool (there is no status channel at all on that
   * path). Reads do not count — a read's outcome is answered by the read itself.
   *
   * 当**至少一个**出站**写**目标不提供状态查询时为真：没有 `statusPath` 的 B 路径写工具，或任一外部
   * MCP 写工具（那条路上根本没有状态通道）。读不算 —— 读的结局由读本身回答。
   */
  hasWriteTargetWithoutStatusQuery(): Promise<boolean>;
}
