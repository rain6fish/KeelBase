// SPDX-License-Identifier: Apache-2.0

import { AppVersionService } from './app-version.service';
import { APP_VERSION } from './app-version.config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
    // ①补 绑定：版本元数据键集 == app-version 冻结契约
    const vProps = Object.keys(
      (
        JSON.parse(
          readFileSync(resolve(__dirname, '../../specs/protocol/schemas/v1/app-version.schema.json'), 'utf8'),
        ) as { properties: Record<string, unknown> }
      ).properties,
    );
    expect(Object.keys(info).sort()).toEqual(vProps.sort());
  });

  it('latestVersion 单源于 package.json——防「发版漏更新此处」再发生', () => {
    // 1.0.7/1.0.8 两次 bump 漏更新手写的 latestVersion → 对外显示 1.0.6（落后两版）。
    // 现改为运行时读 package.json：本断言即该不变量的守卫。
    const pkg = JSON.parse(
      require('node:fs').readFileSync(require('node:path').join(__dirname, '../../package.json'), 'utf8'),
    ) as { version: string };
    expect(APP_VERSION.latestVersion).toBe(pkg.version);
  });

  it('changelog 按当前版本取——防「bump 了版本却没写更新要点」再发生', () => {
    // 1.0.10 / 1.0.11 两次发版都忘了替换手写的那份平铺数组 → 升级提示一直讲 1.0.9 的功能
    // （与上面 latestVersion 那起事故同型）。现改为按版本索引：bump 版本却不写要点 → 查不到 → 本断言红。
    // The notes are keyed by the product version, so a version bump without notes yields an empty
    // list and this assertion fails — the staleness can no longer ship silently.
    expect(APP_VERSION.changelog.length).toBeGreaterThan(0);
    for (const note of APP_VERSION.changelog) {
      expect(typeof note).toBe('string');
      expect(note.trim().length).toBeGreaterThan(0);
    }
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
