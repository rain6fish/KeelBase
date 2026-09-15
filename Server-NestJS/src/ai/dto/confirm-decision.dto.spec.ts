// SPDX-License-Identifier: Apache-2.0

/**
 * CE-2 ② 实现侧绑定：ConfirmDecisionDto 的**校验字段集** == `confirm-decision-body` v2 冻结契约。
 *
 * DTO 无运行时可枚举键集（字段为 definite-assignment，未实例化填值不产出键），故经 class-validator
 * 元数据（各字段的校验装饰器）枚举其属性，与契约 properties 对齐——契约加/删字段而 DTO 未同步即红。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMetadataStorage } from 'class-validator';
import { ConfirmDecisionDto } from './confirm-decision.dto';

describe('ConfirmDecisionDto ② 实现侧绑定', () => {
  it('DTO 校验字段集 == confirm-decision-body v2 冻结契约', () => {
    const metas = getMetadataStorage().getTargetValidationMetadatas(ConfirmDecisionDto, '', false, false);
    const dtoProps = [...new Set(metas.map((m) => m.propertyName))].sort();
    const schemaProps = Object.keys(
      (
        JSON.parse(
          readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v2/confirm-decision-body.schema.json'), 'utf8'),
        ) as { properties: Record<string, unknown> }
      ).properties,
    ).sort();
    expect(dtoProps).toEqual(schemaProps);
  });
});
