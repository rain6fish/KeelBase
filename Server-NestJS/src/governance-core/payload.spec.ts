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
import { ConfigService } from '@nestjs/config';
import { buildPayload } from './payload';
import { AuditChainService } from '../common/audit-chain/audit-chain.service';

describe('buildPayload（审计链 payload 单源）', () => {
    it('② 绑定：AI 审计 payload 键集 == audit-payload 冻结契约（v2 行）', () => {
      const props = Object.keys(
        (
          JSON.parse(
            readFileSync(resolve(__dirname, '../../specs/protocol/schemas/v1/audit-payload.schema.json'), 'utf8'),
          ) as { properties: Record<string, unknown> }
        ).properties,
      );
      const payload = buildPayload({
        payloadVersion: 2,
      });
      expect(Object.keys(payload).sort()).toEqual(props.sort());
    });

    it('AW-11: `write_claim_id` is an off-chain column — it never enters the payload, so setting it cannot change a hash', () => {
      const row = {
        payloadVersion: 2,
        userId: 'u-1',
        conversationId: 'c-1',
        action: 'tool_call',
        tool: 'create_event',
        outcome: 'executed',
        isError: false,
      };
      const withEdge = { ...row, writeClaimId: 27 };

      expect(buildPayload(withEdge)).toEqual(buildPayload(row));
      expect(Object.keys(buildPayload(withEdge))).not.toContain('writeClaimId');
    });

    it('AW-11: existing chain verification is unchanged — a row carrying the new column verifies the same way', () => {
      const chain = new AuditChainService({ get: () => 'aw11-test-key' } as unknown as ConfigService);
      const row1 = {
        id: 1,
        payloadVersion: 2,
        userId: 'u-1',
        conversationId: 'c-1',
        action: 'tool_call',
        isError: false,
      };
      const row2 = { ...row1, id: 2, writeClaimId: 27 };

      const hash1 = chain.computeHash(null, buildPayload(row1));
      const hash2 = chain.computeHash(hash1, buildPayload(row2));
      // The same second row without the annotation must hash to the same value.
      expect(chain.computeHash(hash1, buildPayload({ ...row2, writeClaimId: null }))).toBe(hash2);

      const check = chain.verifyChain(
        [
          { ...row1, prevHash: null, hash: hash1 },
          { ...row2, prevHash: hash1, hash: hash2 },
        ],
        (r) => buildPayload(r),
      );
      expect(check).toEqual({ valid: true, checked: 2 });
    });
});
