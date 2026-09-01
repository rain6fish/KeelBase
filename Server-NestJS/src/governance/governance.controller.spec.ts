// SPDX-License-Identifier: Apache-2.0

import { GovernanceController } from './governance.controller';
import { GovernancePolicyService } from '../ai/governance/governance-policy.service';
import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';
import { GovernanceApprovalService } from './governance-approval.service';
import { SidecarRegistryService } from './sidecar-registry.service';

describe('GovernanceController（D2-2 治理台 / B2 策略推送）', () => {
  let controller: GovernanceController;
  let policy: { getPolicy: jest.Mock; applyPreset: jest.Mock; getPresets: jest.Mock };
  let sidecars: { pushPolicy: jest.Mock; register: jest.Mock; list: jest.Mock };

  beforeEach(() => {
    policy = {
      getPolicy: jest.fn(),
      getPresets: jest.fn(),
      applyPreset: jest.fn().mockResolvedValue({ tools: { send_email: { enabled: false } } }),
    };
    sidecars = {
      pushPolicy: jest.fn().mockResolvedValue({ pushed: 1, failed: 0 }),
      register: jest.fn(),
      list: jest.fn(),
    };
    controller = new GovernanceController(
      {} as GovernanceApprovalService,
      policy as unknown as GovernancePolicyService,
      {} as AiToolEffectsService,
      sidecars as unknown as SidecarRegistryService,
    );
  });

  it('B2 apply-preset：策略应用后向已注册 sidecar 实时推送', async () => {
    const out = await controller.applyPolicyPreset('financial');
    expect(out).toEqual({ tools: { send_email: { enabled: false } } });
    expect(sidecars.pushPolicy).toHaveBeenCalledWith({ tools: { send_email: { enabled: false } } });
  });
});
