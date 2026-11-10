#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Prove the SBOM covers every lockfile the dependency gate scans.
 *
 * An SBOM that silently covers less than the gate is worse than no SBOM: it answers "is package X in
 * our tree?" with a confident no. The scanner is the same one the gate trusts, and its own progress log
 * names every lockfile it read — this check reads that log, compares it with the expected set, and
 * requires one marker component per tree in the BOM.
 *
 * Six of the seven lockfiles carry a package that appears in no other tree, so a missing marker proves
 * the tree is absent. The contract submodule (six packages) has no such marker — every one of its
 * packages also appears elsewhere — so its coverage is the scanner's own `Scanned …` line, made
 * mandatory by the set comparison. `Front-Taro/pnpm-lock.yaml` is shadowed by the npm lockfile in the
 * same directory (CI installs with `npm ci`); it is reported as skipped, exactly as the gate treats it.
 *
 * 证明 SBOM 覆盖了依赖门禁扫描的每一份锁文件。
 *
 * 一份悄悄少覆盖的 SBOM 比没有 SBOM 更糟：它对「X 在不在我们树里」给出自信的「不在」。扫描器与门禁是同一个，
 * 它自己的进度日志会点名读过的每一份锁文件 —— 本检查读那份日志、与期望集合比对，并要求 BOM 里每棵树有一个
 * 标记包。
 *
 * 七份锁文件里有六份带一个只在本树出现的包，标记缺失即证明该树没进 BOM。契约子模块（六个包）没有这样的
 * 标记 —— 它的每个包在别处也出现 —— 所以它的覆盖以扫描器自己的 `Scanned …` 行为证，靠集合比对强制。
 * `Front-Taro/pnpm-lock.yaml` 被同目录的 npm 锁文件遮蔽（CI 用 `npm ci`），按跳过报告，与门禁一致。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * One marker per lockfile: a package that appears only in that tree (checked 2026-11-10). `null` means
 * "no unique marker; prove it from the scanner's own line".
 *
 * 每份锁文件一个标记：只在那一棵树出现的包（2026-11-10 核对）。`null` 表示「没有独占标记，以扫描器
 * 自己的那一行日志为证」。
 */
const MARKERS = new Map([
  ['Front-Flutter/pubspec.lock', 'flutter_secure_storage'],
  ['Front-Taro/package-lock.json', '@tarojs/taro'],
  ['package-lock.json', 'autocannon'],
  ['Server-NestJS/package-lock.json', '@nestjs/core'],
  ['Server-NestJS/specs/protocol/package-lock.json', null],
  ['Web-Admin-React/package-lock.json', '@mui/material'],
  ['Web-Admin-Vue/package-lock.json', 'element-plus'],
]);

function relFromLogPath(raw) {
  let value = raw.trim();
  if (path.isAbsolute(value)) value = path.relative(ROOT, value);
  return value.split(path.sep).join('/').replace(/^\.\//, '');
}

/** The scanner reports each lockfile it read on its own line, to stderr. */
function parseScanLog(text) {
  return [...`${text}`.matchAll(/^Scanned (.+) file and found (\d+) packages?$/gm)].map((match) => ({
    file: relFromLogPath(match[1]),
    packages: Number(match[2]),
  }));
}

/**
 * Same rule as the dependency gate: a directory with `package-lock.json` shadows a pnpm/yarn lockfile,
 * because CI installs that tree with `npm ci`.
 * 与依赖门禁同一条规则：目录里有 `package-lock.json` 时，pnpm / yarn 锁文件被遮蔽，因为 CI 用 `npm ci`
 * 安装那棵树。
 */
function isShadowed(file) {
  if (path.basename(file) === 'package-lock.json') return false;
  return fs.existsSync(path.join(ROOT, path.dirname(file), 'package-lock.json'));
}

/** Component names from `name`/`group` and the purl, which URL-encodes scoped npm names. */
function componentNames(bom) {
  const names = new Set();
  for (const component of bom.components || []) {
    if (component.group && component.name) names.add(`${component.group}/${component.name}`);
    if (component.name) names.add(component.name);
    const purl = component.purl;
    if (typeof purl === 'string' && purl.startsWith('pkg:npm/')) {
      const rest = purl.slice('pkg:npm/'.length);
      const at = rest.lastIndexOf('@');
      try {
        names.add(decodeURIComponent(at > 0 ? rest.slice(0, at) : rest));
      } catch {
        names.add(at > 0 ? rest.slice(0, at) : rest);
      }
    }
  }
  return names;
}

function check({ sbomPath, logPath }) {
  let bom;
  try {
    bom = JSON.parse(fs.readFileSync(sbomPath, 'utf8'));
  } catch (err) {
    return { status: 2, problems: [`cannot read ${sbomPath}: ${err.message}`] };
  }
  let log;
  try {
    log = fs.readFileSync(logPath, 'utf8');
  } catch (err) {
    return { status: 2, problems: [`cannot read ${logPath}: ${err.message}`] };
  }
  if (bom?.bomFormat !== 'CycloneDX' || !Array.isArray(bom.components)) {
    return { status: 2, problems: [`${sbomPath} is not a CycloneDX document with a components array`] };
  }

  const problems = [];
  const all = parseScanLog(log);
  const discovered = all.filter((entry) => !isShadowed(entry.file));
  const skipped = all.filter((entry) => isShadowed(entry.file));
  const names = componentNames(bom);

  for (const entry of discovered) {
    if (!MARKERS.has(entry.file)) {
      problems.push(`scanned but not declared: ${entry.file} (${entry.packages} packages) — add a marker or decide it is out of scope`);
    }
  }
  for (const [lockfile, marker] of MARKERS) {
    if (!discovered.some((entry) => entry.file === lockfile)) {
      problems.push(`declared but not scanned: ${lockfile}`);
      continue;
    }
    if (marker && !names.has(marker)) {
      problems.push(`${lockfile}: BOM has no component named "${marker}"`);
    }
  }

  return { status: problems.length ? 1 : 0, problems, components: bom.components.length, discovered, skipped };
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbom-coverage-selftest-'));
  const sbomPath = path.join(tmp, 'sbom.cdx.json');
  const logPath = path.join(tmp, 'sbom-scan.log');

  const expected = [...MARKERS.keys()].map((file) => `Scanned ${file} file and found 10 packages`);
  const markers = [...MARKERS.values()].filter(Boolean);
  const write = (components, logLines) => {
    fs.writeFileSync(sbomPath, JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', components }, null, 2));
    fs.writeFileSync(logPath, `${logLines.join('\n')}\n`);
  };
  const asComponents = (packageNames) =>
    packageNames.map((name) => ({ name, purl: `pkg:npm/${encodeURIComponent(name)}@1.0.0`, version: '1.0.0' }));

  let failures = 0;
  const checkCase = (label, ok, result) => {
    console.log(`[sbom-coverage] ${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` — ${(result.problems || []).join(' | ')}`}`);
    if (!ok) failures += 1;
  };

  write(asComponents(markers), expected);
  let result = check({ sbomPath, logPath });
  checkCase('green: every declared lockfile is scanned and its marker is in the BOM', result.status === 0, result);

  write(asComponents(markers.filter((name) => name !== 'element-plus')), expected);
  result = check({ sbomPath, logPath });
  checkCase(
    'red: a missing marker is named with its lockfile',
    result.status === 1 && result.problems.some((p) => p.includes('Web-Admin-Vue/package-lock.json') && p.includes('element-plus')),
    result,
  );

  write(
    asComponents(markers),
    expected.filter((line) => !line.includes('specs/protocol')),
  );
  result = check({ sbomPath, logPath });
  checkCase(
    'red: a lockfile the scanner did not read is named',
    result.status === 1 && result.problems.some((p) => p.includes('Server-NestJS/specs/protocol/package-lock.json')),
    result,
  );

  write(asComponents(markers), [...expected, 'Scanned new/package-lock.json file and found 3 packages']);
  result = check({ sbomPath, logPath });
  checkCase(
    'red: a scanned lockfile outside the declared set is named',
    result.status === 1 && result.problems.some((p) => p.includes('new/package-lock.json')),
    result,
  );

  write(asComponents(markers), [...expected, 'Scanned Front-Taro/pnpm-lock.yaml file and found 1390 packages']);
  result = check({ sbomPath, logPath });
  checkCase('green: the shadowed pnpm lockfile is reported, not demanded', result.status === 0 && result.skipped.length === 1, result);

  fs.writeFileSync(sbomPath, '{"bomFormat":"SPDX"}');
  fs.writeFileSync(logPath, '');
  result = check({ sbomPath, logPath });
  checkCase('unverified: a non-CycloneDX document exits 2, never 0', result.status === 2, result);

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures) {
    console.error(`[sbom-coverage] self-test: ${failures} expectation(s) not met`);
    process.exit(1);
  }
  console.log('[sbom-coverage] self-test: coverage, drift and the shadowed lockfile all behave as specified');
}

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const sbomPath = arg('--sbom', path.join(ROOT, 'sbom.cdx.json'));
  const logPath = arg('--scan-log', path.join(ROOT, 'sbom-scan.log'));
  const result = check({ sbomPath, logPath });

  for (const entry of result.discovered || []) console.log(`[sbom-coverage] scanned ${entry.file} (${entry.packages} packages)`);
  for (const entry of result.skipped || []) console.log(`[sbom-coverage] skipped shadowed ${entry.file}`);
  if (typeof result.components === 'number') console.log(`[sbom-coverage] BOM components: ${result.components}`);

  if (result.status === 2) {
    console.error('[sbom-coverage] 未核 (unverified) — the SBOM or the scan log could not be read.');
    for (const problem of result.problems) console.error(`  - ${problem}`);
    process.exit(2);
  }
  if (result.status === 1) {
    console.error(`[sbom-coverage] FAIL — ${result.problems.length} coverage problem(s):`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    console.error('[sbom-coverage] FAIL —— SBOM 没有覆盖门禁扫描的全部锁文件。');
    process.exit(1);
  }
  console.log(`[sbom-coverage] PASS — ${result.discovered.length} lockfile(s) scanned, every declared tree has its marker`);
  console.log(`[sbom-coverage] 通过 —— 扫描了 ${result.discovered.length} 份锁文件，每棵已声明的树都有标记。`);
}
