// SPDX-License-Identifier: Apache-2.0

/**
 * The "not covered by this gate" declaration must stay true, and stay honest in both directions.
 *
 * `npm run check:all` prints what it does not run (`scripts/gate-coverage.mjs`). A printed list is worth
 * nothing if it silently misses a new `test:*` script or keeps naming one that was deleted — the reader
 * would be told the gate covers what it does not, or that a gap exists where there is none. So the
 * declaration and the two package.json files are held against each other here:
 *
 *   - a verification script in neither the covered set nor the declaration → red (the silent gap);
 *   - a declaration naming a script that no longer exists → red (a stale promise);
 *   - a declaration for something `check:all` actually runs → red (it lies in the safe direction, which is
 *     still a lie, and would hide that an entry moved into the gate);
 *   - a declared shell script that is gone → red.
 *
 * The first case is the one that matters: adding `test:foo` to package.json without touching
 * `gate-coverage.mjs` must not be able to merge. Each case below builds the drift in memory and runs the
 * same function the real tree runs, so the test proves the red before it reports the green.
 *
 * Run: node --test scripts/gate-coverage.test.mjs
 *
 * 「本门未覆盖」的声明必须保持为真，且**两个方向**都老实。
 *
 * `npm run check:all` 会打印它不跑什么（`scripts/gate-coverage.mjs`）。如果这份清单悄悄漏掉一个新的
 * `test:*`、或还点着一个已删除的脚本，那它就毫无价值 —— 读者会被告知「覆盖了其实没覆盖的」，或「有空档
 * 其实没有」。于是本测试把声明与两份 package.json 互相对照：
 *
 *   - 某个验证脚本既不在已覆盖集合、也不在声明里 → 红（**无声的空档**）；
 *   - 声明点名的脚本已不存在 → 红（过期的承诺）；
 *   - 声明说的是 `check:all` **其实会跑**的东西 → 红（它往安全的方向撒谎，但仍然是撒谎，而且会掩盖
 *     「某项已经挪进门禁」这件事）；
 *   - 声明的 shell 脚本不存在 → 红。
 *
 * 第一条是关键：往 package.json 加了 `test:foo` 却没改 `gate-coverage.mjs`，**合不进去**。下面每个用例都在
 * 内存里造出漂移、跑真实树在跑的那个函数 —— 于是测试是**先**证明红、**再**报告绿。
 *
 * 运行：node --test scripts/gate-coverage.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { coverageFindings, coveredNames, NOT_COVERED, RELEASE_ONLY, ROOT } from './gate-coverage.mjs';

const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const serverPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'Server-NestJS', 'package.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

test('the real tree: every verification entry point is either run by this gate or declared not covered', () => {
  const findings = coverageFindings({ rootPkg, serverPkg });
  assert.deepEqual(findings, [], `声明与实际脚本已漂移：\n${findings.join('\n')}`);
});

test('drift red: a new test:* script with no declaration', () => {
  const drifted = clone(serverPkg);
  drifted.scripts['test:brand-new'] = 'jest src/brand-new --forceExit';
  const findings = coverageFindings({ rootPkg, serverPkg: drifted });
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /test:brand-new/);
});

test('drift red: a new lint:* script in the root package with no declaration', () => {
  const drifted = clone(rootPkg);
  drifted.scripts['lint:fix-all'] = 'eslint . --fix';
  const findings = coverageFindings({ rootPkg: drifted, serverPkg });
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /lint:fix-all/);
});

test('drift red: a declared script that no longer exists', () => {
  const drifted = clone(rootPkg);
  delete drifted.scripts['cli:test'];
  const findings = coverageFindings({ rootPkg: drifted, serverPkg });
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /cli:test/);
  assert.match(findings[0], /不存在|gone/);
});

test('drift red: a declaration for something check:all actually runs', () => {
  const declaration = [
    { commands: ['npm run check:boundary'], npmScripts: [{ pkg: '', name: 'check:boundary' }], reason: { zh: 'x', en: 'x' } },
  ];
  const findings = coverageFindings({ rootPkg, serverPkg, declarations: declaration });
  assert.ok(
    findings.some((f) => /check:boundary/.test(f) && /实际会跑/.test(f)),
    findings.join('\n'),
  );
});

test('drift red: a declared shell script that is gone, and a declaration with nothing in it', () => {
  const missing = coverageFindings({ rootPkg, serverPkg, fileExists: () => false });
  assert.ok(
    missing.some((f) => /run-adversarial\.sh/.test(f) && /不存在|missing/.test(f)),
    missing.join('\n'),
  );

  const empty = coverageFindings({
    rootPkg,
    serverPkg,
    declarations: [{ commands: ['nothing'], reason: { zh: 'x', en: 'x' } }],
  });
  assert.ok(empty.some((f) => /空声明|empty declaration/.test(f)), empty.join('\n'));
});

test('every declaration carries a reason in both languages', () => {
  for (const entry of NOT_COVERED) {
    assert.ok(entry.reason?.zh?.trim(), `缺中文原因 / no Chinese reason: ${entry.commands?.[0]}`);
    assert.ok(entry.reason?.en?.trim(), `缺英文原因 / no English reason: ${entry.commands?.[0]}`);
    assert.ok(entry.commands?.length, `缺命令 / no command: ${JSON.stringify(entry.npmScripts)}`);
  }
});

test('the covered set starts from every check:* script except the release-only gates, which are declared not covered', () => {
  const covered = coveredNames(rootPkg);
  const gates = Object.keys(rootPkg.scripts).filter(
    (n) => n.startsWith('check:') && n !== 'check:all' && !RELEASE_ONLY.has(n),
  );
  for (const gate of gates) assert.ok(covered.includes(gate), `check:all 不再跑 ${gate}`);
  assert.ok(covered.includes('spec:check'));

  const declared = new Set(
    NOT_COVERED.flatMap((e) => (e.npmScripts ?? []).map((s) => `${s.pkg}:${s.name}`)),
  );
  for (const gate of RELEASE_ONLY) {
    assert.ok(!covered.includes(gate), `${gate} 被算成了已覆盖 / counted as covered`);
    assert.ok(declared.has(`:${gate}`), `${gate} 未写进 NOT_COVERED / missing from NOT_COVERED`);
  }
});
