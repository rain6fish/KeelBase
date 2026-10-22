// SPDX-License-Identifier: Apache-2.0

/**
 * Business-side audit write plane module (Stage 4: module forwardRef cycle radical fix · second cut).
 *
 * It was extracted to break the indirect `ai → events → org → flows → ai` cycle: `FlowRuntimeService`
 * writes `action: 'flow_node'` audit rows through `AuditService` — a real use, not a stray reference —
 * and reaching an "audit writer" used to require `forwardRef(() => AiModule)`.
 *
 * Since S4-H4 C Step 4, `AuditService` itself lives in `GovernanceSharedModule` and this module only
 * owns the **business-side binding** of `GOVERNANCE_REPORTER`. The governance process imports the
 * shared module too and supplies no reporter, so it never reports to itself; here the reporter is
 * provided and, at init, attached to the very `AuditService` instance this module re-exports. Modules
 * that still `imports: [AiModule]` or `[AiAuditModule]` therefore keep getting one and the same
 * instance, never a second one.
 *
 * AI 审计写入面的业务侧模块（阶段 4：module forwardRef 环根治 · 第二刀）。
 *
 * 抽它为的是打断 `ai → events → org → flows → ai` 这条间接环：`FlowRuntimeService` 用
 * `AuditService` 写 `action: 'flow_node'` 的审计行（工作流节点留痕）—— 这是真实用途、不是误引；
 * 而为了拿一个「审计写入器」，flows 过去必须 `forwardRef(() => AiModule)`。
 *
 * 自 S4-H4 C 第四步起，`AuditService` 本体住在 `GovernanceSharedModule`，本模块只负责
 * `GOVERNANCE_REPORTER` 的**业务侧绑定**：治理进程同样 import 共享模块且不提供 reporter，故它
 * 不会自我上报；这里提供 reporter，并在初始化时把它挂到本模块再导出的**那一个** `AuditService`
 * 实例上。仍 `imports: [AiModule]` 或 `[AiAuditModule]` 的消费者因此始终拿到同一个实例，绝不会多出
 * 第二个。
 */
import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { GovernanceSharedModule } from '../../governance-shared/governance-shared.module';
import { AuditService } from '../../governance-shared/services/audit.service';
import {
  GovernanceReporter,
  GOVERNANCE_REPORTER,
} from '../../governance-shared/services/governance-reporter.service';

@Module({
  imports: [GovernanceSharedModule],
  providers: [GovernanceReporter, { provide: GOVERNANCE_REPORTER, useClass: GovernanceReporter }],
  // GOVERNANCE_REPORTER 一并导出：留在 ai 的 AiToolEffectsService 也注入它
  exports: [GovernanceSharedModule, GOVERNANCE_REPORTER],
})
export class AiAuditModule implements OnModuleInit {
  constructor(
    private readonly auditService: AuditService,
    @Inject(GOVERNANCE_REPORTER) private readonly reporter: GovernanceReporter,
  ) {}

  onModuleInit(): void {
    this.auditService.attachReporter(this.reporter);
  }
}
