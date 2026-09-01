// SPDX-License-Identifier: Apache-2.0

import { getPolicyPreset, getPolicyPresets } from './governance-policy-presets';

describe('governance-policy-presets (§22.15 策略模板库)', () => {
  it('exposes finance / government / general three presets', () => {
    const presets = getPolicyPresets();
    const ids = presets.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['finance', 'government', 'general']));
  });

  it('finance preset: audit all + write tools require confirmation', () => {
    const finance = getPolicyPreset('finance');
    expect(finance?.policy.audit.granularity).toBe('all');
    expect(finance?.policy.tools.create_event?.requiresConfirmation).toBe(true);
    expect(finance?.policy.tools.create_followup_task?.requiresConfirmation).toBe(true);
  });

  it('government preset: audit write + core write tools require confirmation', () => {
    const gov = getPolicyPreset('government');
    expect(gov?.policy.audit.granularity).toBe('write');
    expect(gov?.policy.tools.create_event?.requiresConfirmation).toBe(true);
    // 非核心写工具不在政府预设覆盖内
    expect(gov?.policy.tools.create_note?.requiresConfirmation).toBeUndefined();
  });

  it('general preset: audit all + no tool overrides', () => {
    const general = getPolicyPreset('general');
    expect(general?.policy.audit.granularity).toBe('all');
    expect(Object.keys(general?.policy.tools ?? {}).length).toBe(0);
  });

  it('returns undefined for unknown preset id', () => {
    expect(getPolicyPreset('unknown')).toBeUndefined();
  });
});
