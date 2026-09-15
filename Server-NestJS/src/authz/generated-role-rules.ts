// SPDX-License-Identifier: Apache-2.0

import type { RoleRuleSeed } from '../common/casl/builtin-role-rules';

/**
 * 生成模块的角色规则（**代码即配置**）。
 *
 * 为什么是代码而不是 DB 行：`keelbase init`（`scripts/generator/wire.mjs`）在**构建期**生成业务模块，
 * 它无法向**部署期**的数据库"种一行数据"。故生成模块的所有权规则写在这里，由
 * `RoleRuleRegistry` 在装配时并入内存注册表（与 DB 里的授予合并）。
 *
 * 由生成器追加，勿手改。格式：`{ roleCode: 'user', subject: '<实体名>', ownerField: 'userId' }`。
 */
export const GENERATED_ROLE_RULES: RoleRuleSeed[] = [];
