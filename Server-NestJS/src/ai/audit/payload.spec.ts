// SPDX-License-Identifier: Apache-2.0

/**
 * 审计链 payload 规范形态（`buildPayload`）单元测试。
 *
 * 契约绑定这条从 `audit.service.spec` 迁来：它测的是 **payload 形状本身**，
 * 而形状现在住在 `payload.ts`（写入 / 链校验 / 证据导出三处共用的单源），所以它本就该在这里。
 * **断言一字未改**——搬迁只改调用目标，不改判据。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPayload } from './payload';

describe('buildPayload（审计链 payload 单源）', () => {
    it('② 绑定：AI 审计 payload 键集 == audit-payload 冻结契约（v2 行）', () => {
      const props = Object.keys(
        (
          JSON.parse(
            readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v1/audit-payload.schema.json'), 'utf8'),
          ) as { properties: Record<string, unknown> }
        ).properties,
      );
      const payload = buildPayload({
        payloadVersion: 2,
      });
      expect(Object.keys(payload).sort()).toEqual(props.sort());
    });


});
