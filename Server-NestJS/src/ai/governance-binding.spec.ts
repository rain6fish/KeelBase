// SPDX-License-Identifier: Apache-2.0

/**
 * CE-3 薄片 governance binding：TS 实现 ↔ 协议语料 漂移门。
 * - TS RISK_STRATEGY（tool.interface）== 语料 riskStrategy（语料由 scripts/lib/protocol-algorithms.mjs 单源生成）
 *   —— 闭合 .ts / .mjs 双处 RISK_STRATEGY 的潜在漂移。
 * - 语料 gateOutcomeByStrategy 覆盖 RISK_STRATEGY 全部策略值。
 * - deny 依据词表（DENY_CHECKS）在 ai.service / authorization-explainer 源码中真实出现（拒绝词汇未被改名）。
 * 策略↔决策一致性由 conformance（verify-protocol-conformance.mjs §4.3/§4.4）在算法侧校验。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RISK_STRATEGY } from './interfaces/tool.interface';

const VECTOR = resolve(__dirname, '../../specs/protocol/governance-binding-v1-vector.json');
const AI_SERVICE = resolve(__dirname, 'ai.service.ts');
const AUTHZ_EXPLAINER = resolve(__dirname, 'authorization-explainer.service.ts');

const vector = JSON.parse(readFileSync(VECTOR, 'utf8')) as {
  riskStrategy: Record<string, string>;
  gateOutcomeByStrategy: Record<string, { outcome: string; blocked: boolean }>;
  denyChecks: string[];
};

describe('CE-3 governance binding · TS↔语料 漂移门', () => {
  it('TS RISK_STRATEGY == 语料 riskStrategy（.ts ↔ 单源 .mjs 不漂移）', () => {
    expect(RISK_STRATEGY).toEqual(vector.riskStrategy);
  });

  it('语料 gateOutcomeByStrategy 覆盖 RISK_STRATEGY 全部策略值', () => {
    const strategies = [...new Set(Object.values(RISK_STRATEGY))].sort();
    expect(Object.keys(vector.gateOutcomeByStrategy).sort()).toEqual(strategies);
  });

  it('deny 依据词表每个 name 在实现源码中真实出现（拒绝词汇未改名）', () => {
    const src = readFileSync(AI_SERVICE, 'utf8') + readFileSync(AUTHZ_EXPLAINER, 'utf8');
    for (const name of vector.denyChecks) {
      expect(src.includes(`'${name}'`)).toBe(true);
    }
  });
});
