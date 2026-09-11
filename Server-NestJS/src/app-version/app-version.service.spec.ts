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

  it('latestVersion 单源于 package.json——防「发版漏更新此处」再发生', () => {
    // 1.0.7/1.0.8 两次 bump 漏更新手写的 latestVersion → 对外显示 1.0.6（落后两版）。
    // 现改为运行时读 package.json：本断言即该不变量的守卫。
    const pkg = JSON.parse(
      require('node:fs').readFileSync(require('node:path').join(__dirname, '../../package.json'), 'utf8'),
    ) as { version: string };
    expect(APP_VERSION.latestVersion).toBe(pkg.version);
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
