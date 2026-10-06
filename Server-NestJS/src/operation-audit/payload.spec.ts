// SPDX-License-Identifier: Apache-2.0

/**
 * The operation chain's payload shape (`buildOperationPayload`).
 *
 * The contract binding below moved here from `operation-audit.service.spec.ts`: it tests the
 * payload shape itself, and the shape now lives in `payload.ts` (the single source the write path
 * and both read paths share), so it belongs here — the same move the AI chain made when its payload
 * was extracted. **The assertion is unchanged**; only the call target moved.
 *
 * 操作链的 payload 形态（`buildOperationPayload`）。下面那条契约绑定从
 * `operation-audit.service.spec.ts` 搬来这里：它测的是 **payload 形状本身**，而形状现在住在
 * `payload.ts`（写入路径与两条读路径共用的单源），所以它本就该在这里 —— 与 AI 链提取 payload 时
 * 做的是同一个搬迁。**断言一字未改**，只改了调用目标。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOperationPayload } from './payload';

describe('buildOperationPayload（操作审计链 payload 单源）', () => {
  it('收口：键集 == operation-audit-payload 冻结契约（链内 canonical payload）', () => {
    const schema = JSON.parse(
      readFileSync(resolve(__dirname, '../../specs/protocol/schemas/v1/operation-audit-payload.schema.json'), 'utf8'),
    ) as { properties: Record<string, unknown> };
    const payload = buildOperationPayload({});
    expect(Object.keys(payload).sort()).toEqual(Object.keys(schema.properties).sort());
  });

  it('写入侧与读取侧同形：同一组值，无论从 entry 还是从已存行来，payload 相同', () => {
    // 这条断言钉住的正是提取的**理由**：两侧曾各有一份实现，分叉不会报错、只会算出不同的 hash。
    // 现在两侧走同一个函数，于是「它们必须一致」由结构保证，而不是靠注释和运气。
    const values = {
      userId: 7,
      action: 'CREATE',
      method: 'POST',
      path: '/api/v1/contracts',
      featureKey: 'contracts.create',
      featureFallback: 'Contracts · Create',
      targetId: '42',
      requestBody: '{"a":1}',
      ip: '203.0.113.9',
      userAgent: 'jest',
      statusCode: 201,
    };
    // 写入侧：entry 先截断（截断发生在落库前，不属于 payload 决定），再交给同一个函数。
    const fromEntry = buildOperationPayload({
      ...values,
      requestBody: values.requestBody.slice(0, 2000),
      ip: values.ip.slice(0, 64),
      userAgent: values.userAgent.slice(0, 255),
    });
    // 读取侧：已存行直接交给同一个函数。
    const fromRow = buildOperationPayload(values);

    expect(fromEntry).toEqual(fromRow);
  });

  it('缺席的字段一律落为 null（不省略键——省略会改变 canonical JSON 与 hash）', () => {
    const payload = buildOperationPayload({});
    for (const [key, value] of Object.entries(payload)) {
      expect([key, value]).toEqual([key, null]);
    }
  });
});
