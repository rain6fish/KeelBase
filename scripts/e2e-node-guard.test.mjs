// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for Server-NestJS/scripts/lib/e2e-runtime-guard.mjs (node:test, zero dependencies).
 *
 * Both sides of every boundary, because a guard that is either too wide or too narrow is worse than
 * none: flagging Linux or Node 22 would fire on the CI it is meant to leave alone, and letting
 * 24.15.0 through would leave the measured crash named nowhere.
 *
 * Run: node --test scripts/e2e-node-guard.test.mjs
 *
 * `Server-NestJS/scripts/lib/e2e-runtime-guard.mjs` 的测试（node:test，零依赖）。
 *
 * 每条边界两侧都要：判宽了会在本不该动的 Linux / Node 22 上报警，判窄了等于没把实测过的 24.15.0
 * 点名。
 *
 * 运行：node --test scripts/e2e-node-guard.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isKnownE2eCrashRuntime } from '../Server-NestJS/scripts/lib/e2e-runtime-guard.mjs';

const cases = [
  // inside the window: both versions the upstream issue records crashing
  ['win32', '24.12.0', true],
  ['win32', '24.15.0', true],
  // just below the boundary
  ['win32', '24.18.9', true],
  // at and above the boundary: measured 16/16 green on 24.22.2
  ['win32', '24.19.0', false],
  ['win32', '24.22.2', false],
  ['win32', '24.30.1', false],
  // other lines: CI's Node 22 and a future 25
  ['win32', '22.23.2', false],
  ['win32', '25.0.0', false],
  // outside Windows, where the defect is not reported
  ['linux', '24.15.0', false],
  ['darwin', '24.15.0', false],
];

for (const [platform, version, expected] of cases) {
  test(`${platform} node ${version} → ${expected ? 'warns' : 'silent'}`, () => {
    assert.equal(isKnownE2eCrashRuntime(platform, version), expected);
  });
}
