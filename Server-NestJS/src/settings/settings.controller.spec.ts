import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: jest.Mocked<Pick<SettingsService, 'findAll' | 'set'>>;

  beforeEach(() => {
    service = { findAll: jest.fn(), set: jest.fn() };
    controller = new SettingsController(service as unknown as SettingsService);
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
});
