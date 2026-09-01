// SPDX-License-Identifier: Apache-2.0

import { AppVersionController } from './app-version.controller';
import { AppVersionService } from './app-version.service';

describe('AppVersionController', () => {
  let controller: AppVersionController;
  let appVersionService: Record<string, jest.Mock>;

  beforeEach(() => {
    appVersionService = { getVersionInfo: jest.fn() };
    controller = new AppVersionController(appVersionService as unknown as AppVersionService);
  });

  it('获取版本元数据委托 service', () => {
    appVersionService.getVersionInfo.mockReturnValue({ version: '0.9.1', latest: true });
    expect(controller.getVersionInfo()).toEqual({ version: '0.9.1', latest: true });
    expect(appVersionService.getVersionInfo).toHaveBeenCalled();
  });
});
