// SPDX-License-Identifier: Apache-2.0

import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: jest.Mocked<Pick<SettingsService, 'findAll' | 'set'>>;
  let featureFlags: jest.Mocked<Pick<FeatureFlagsService, 'applyPreset'>>;

  beforeEach(() => {
    service = { findAll: jest.fn(), set: jest.fn() };
    featureFlags = { applyPreset: jest.fn() };
    controller = new SettingsController(
      service as unknown as SettingsService,
      featureFlags as unknown as FeatureFlagsService,
    );
  });

  it('findAll 委托 service', async () => {
    const all = [{ key: 'maintenanceMode', value: 'false', type: 'boolean' }];
    service.findAll.mockResolvedValue(all as never);
    await expect(controller.findAll()).resolves.toEqual(all);
    expect(service.findAll).toHaveBeenCalled();
  });

  it('update 委托 service.set 传 key/value/type', async () => {
    const updated = { key: 'maintenanceMode', value: 'true', type: 'boolean' };
    service.set.mockResolvedValue(updated as never);
    const dto = { value: 'true', type: 'boolean' };
    await expect(controller.update('maintenanceMode', dto as any)).resolves.toEqual(updated);
    expect(service.set).toHaveBeenCalledWith('maintenanceMode', 'true', 'boolean');
  });

  it('applyPreset 委托 featureFlags.applyPreset 并返回 flags', async () => {
    const flags = { ai: true, push: false } as never;
    featureFlags.applyPreset.mockResolvedValue(flags);
    await expect(controller.applyPreset({ preset: 'small' })).resolves.toEqual(flags);
    expect(featureFlags.applyPreset).toHaveBeenCalledWith('small');
  });
});
