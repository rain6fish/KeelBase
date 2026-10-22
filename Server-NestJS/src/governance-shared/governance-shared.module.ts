// SPDX-License-Identifier: Apache-2.0

/**
 * Shared governance module — Step 1 skeleton (S4-H4 C, shape B).
 *
 * `governance-core/` stays pure (helpers only) and this new directory holds what the AI path and
 * the standalone governance runtime genuinely share: the seven entities now, the shared services
 * and controllers later. This file is deliberately empty: it declares no providers and exports
 * nothing yet, so importing it changes no wiring. It is also deliberately not imported by
 * `app.module.ts` — Step 1 only lays the directory down; wiring starts with the entity step.
 *
 * Dependency direction (must hold once this module has content):
 *
 *     entities / services / controllers  →  governance-core (pure)  →  (no ai)
 *
 * 共享治理模块 —— Step 1 空骨架（S4-H4 C，形状 B）。
 *
 * `governance-core/` 保持纯目录（只放助手），本新目录承载 AI 路径与独立治理运行时真正共用的东西：
 * 现在先放七个实体，之后才轮到共享服务与控制器。本文件刻意留空：不声明任何 provider、不导出任何
 * 东西，import 它不会改变任何装配。它也刻意**不**被 `app.module.ts` 引入 —— Step 1 只落目录；
 * 接线从实体那一步才开始。
 *
 * 依赖方向（本模块有内容后必须成立）：
 *
 *     实体 / 服务 / 控制器  →  governance-core（纯）  →  （不引 ai）
 */
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  providers: [],
  exports: [],
})
export class GovernanceSharedModule {}
