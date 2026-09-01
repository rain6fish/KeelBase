// SPDX-License-Identifier: Apache-2.0

import { AppVersionService } from './app-version.service';
import { APP_VERSION } from './app-version.config';

describe('AppVersionService', () => {
  let service: AppVersionService;

  beforeEach(() => {
    service = new AppVersionService();
  });

  it('returns version metadata with required fields', () => {
    const info = service.getVersionInfo();

    expect(info).toEqual({
      latestVersion: APP_VERSION.latestVersion,
      minRequiredVersion: APP_VERSION.minRequiredVersion,
      updateUrl: APP_VERSION.updateUrl,
      changelog: APP_VERSION.changelog,
    });
  });

  it('latestVersion is newer than or equal to minRequiredVersion', () => {
    const toNum = (v: string) => v.split('.').map(Number);
    const latest = toNum(APP_VERSION.latestVersion);
    const min = toNum(APP_VERSION.minRequiredVersion);

    for (let i = 0; i < 3; i++) {
      if (latest[i] > min[i]) break;
      expect(latest[i]).toBeGreaterThanOrEqual(min[i]);
    }
  });
});
