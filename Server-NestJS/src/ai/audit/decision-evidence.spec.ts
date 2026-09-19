// SPDX-License-Identifier: Apache-2.0

import { captureDecisionEvidence } from './decision-evidence';

describe('captureDecisionEvidence（§internal.16 A-1 决策证据）', () => {
  it('analyze_* 打分 → 决策 + 证据 + 阈值口径', () => {
    const raw = captureDecisionEvidence('analyze_customer_risk', {
      success: true,
      data: { level: 'high', score: 7, reasons: ['逾期 30 天', '未回复'] },
    });
    expect(JSON.parse(raw!)).toEqual({
      decision: 'high',
      evidence: ['逾期 30 天', '未回复'],
      policy: '风险评分阈值：score≥10 critical / ≥6 high / ≥3 medium',
      confidence: 7 / 12,
    });
  });

  it('confidence 封顶 1（score 超过 12 不越界）', () => {
    const raw = captureDecisionEvidence('analyze_project_risk', {
      success: true,
      data: { level: 'critical', score: 30, reasons: [] },
    });
    expect(JSON.parse(raw!).confidence).toBe(1);
  });

  it('非 analyze 工具 / 缺 score / 缺 level → null（不硬造证据）', () => {
    expect(captureDecisionEvidence('create_event', { success: true, data: { id: 1 } })).toBeNull();
    expect(captureDecisionEvidence('analyze_customer_risk', { success: true, data: {} })).toBeNull();
    expect(
      captureDecisionEvidence('analyze_customer_risk', { success: true, data: { level: 'high' } }),
    ).toBeNull();
  });
});
