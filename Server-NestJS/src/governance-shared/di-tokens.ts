// SPDX-License-Identifier: Apache-2.0

/**
 * DI tokens for business-side capabilities the shared side may use when a process provides them.
 *
 * `GovernanceSharedModule` and the services it hosts must not import `src/ai/**` at runtime (S4-H4 C
 * decision D5), so dependencies that only exist in the business process come in through these
 * tokens. The **binding** stays in the process module that owns the implementation: `AiModule` binds
 * both to its own providers; the governance process binds neither and the `@Optional()` parameters
 * stay undefined, exactly as before.
 *
 * 业务侧能力的 DI token —— 当某个进程提供了它们时，共享侧可用。
 *
 * `GovernanceSharedModule` 及其服务不得在运行时 import `src/ai/**`（S4-H4 C 决策 D5），故只存在于
 * 业务进程的依赖经这些 token 注入。**绑定**留在拥有实现的进程模块：`AiModule` 把两者绑到自己的
 * provider；治理进程一个都不绑，`@Optional()` 参数保持 undefined —— 与改动前一致。
 */
export const TOOL_REGISTRY = 'GOVERNANCE_TOOL_REGISTRY';
export const AUTHORIZATION_EXPLAINER = 'GOVERNANCE_AUTHORIZATION_EXPLAINER';
