// SPDX-License-Identifier: Apache-2.0

import { ExternalGovernanceController } from './external-governance.controller';
import { AuditService } from '../ai/audit/audit.service';
import { GovernancePolicyService } from '../ai/governance/governance-policy.service';
import { AiToolEffectsService } from '../ai/tool-effects/ai-tool-effects.service';
import { SidecarRegistryService } from './sidecar-registry.service';

describe('ExternalGovernanceController（D2-3 业务接入 / B2 sidecar 注册）', () => {
  let controller: ExternalGovernanceController;
  let sidecars: { register: jest.Mock; pushPolicy: jest.Mock; list: jest.Mock };

  beforeEach(() => {
    sidecars = {
      register: jest.fn().mockReturnValue({ registered: true, total: 1 }),
      pushPolicy: jest.fn(),
      list: jest.fn(),
    };
    controller = new ExternalGovernanceController(
      {} as AuditService,
      {} as GovernancePolicyService,
      {} as AiToolEffectsService,
      sidecars as unknown as SidecarRegistryService,
    );
  });

  it('B2 registerSidecar：sidecar 启动注册回调地址', async () => {
    const out = await controller.registerSidecar('http://sidecar:3200');
    expect(sidecars.register).toHaveBeenCalledWith('http://sidecar:3200');
    expect(out).toEqual({ registered: true, total: 1 });
  });
});
