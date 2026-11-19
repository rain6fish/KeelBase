// SPDX-License-Identifier: Apache-2.0

/**
 * Tests for scripts/check-artifact-contract.mjs (node:test, zero dependencies, no network).
 *
 * The published artifacts answer `undeclared` today, so the real artifact cannot exercise the match and
 * mismatch branches — and a gate whose only reachable outcome is one exit code has not been shown to
 * discriminate anything. These cases build small stored (uncompressed) jars in a temp directory and run
 * the **real script** against them via `--jar`, so the exit codes asserted here are the exit codes an
 * operator gets:
 *
 *   - a declared, matching version → 0;
 *   - a declared, different version → 1, and the observed value is printed;
 *   - nothing declared → 2 (and `Implementation-Version` is not mistaken for a contract version).
 *
 * Run: node --test scripts/check-artifact-contract.test.mjs
 *
 * `scripts/check-artifact-contract.mjs` 的测试（node:test，零依赖，不联网）。
 *
 * 已发布构件今天答的都是「未声明」，于是真构件**跑不到**一致与不一致这两支 —— 而一道只有一个可达退出码的
 * 门禁，等于没被证明能分辨任何东西。下面的用例在临时目录里搭小的**存储型**（不压缩）jar，用 `--jar`
 * 对它们跑**真脚本**，于是这里断言的退出码就是操作者拿到的那一个：
 *
 *   - 有声明且一致 → 0；
 *   - 有声明但不同 → 1，并打印观测值；
 *   - 没有任何声明 → 2（且 `Implementation-Version` 不会被误读成契约版本）。
 *
 * 运行：node --test scripts/check-artifact-contract.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareVersions,
  findContractVersion,
  normalizeVersion,
  parseManifest,
  readManifestContractVersion,
  readPomContractVersion,
  readPropertiesContractVersion,
  readProvenanceContractVersion,
} from './check-artifact-contract.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-artifact-contract.mjs');

// ── a stored (method 0) zip writer, so the end-to-end cases need no dependency ──
// ── 存储型（method 0）zip 写入器，端到端用例因此不需要任何依赖 ──

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function makeStoredZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, body] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(body, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

function withJar(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-artifact-contract-'));
  try {
    const jar = join(dir, 'artifact.jar');
    writeFileSync(jar, makeStoredZip(files));
    return fn(jar);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const run = (jar, expect) =>
  spawnSync(process.execPath, [SCRIPT, '--jar', jar, '--version', '0.1.19', '--expect', expect], {
    encoding: 'utf8',
  });

const MANIFEST_ONLY_VERSION = 'Manifest-Version: 1.0\nImplementation-Version: 0.1.19\n\n';
const MANIFEST_WITH_CONTRACT = 'Manifest-Version: 1.0\nKeelBase-Contract-Version: v1.22.0\n\n';

// ── unit: the declaration sites ───────────────────────────────────────────────

test('manifest: reads the contract version, and folds continuation lines', () => {
  const hit = readManifestContractVersion(
    'Manifest-Version: 1.0\nKeelBase-Contract-Version: v1.\n 22.0\n\n',
  );
  assert.equal(hit?.value, 'v1.22.0');
  assert.match(hit.site, /MANIFEST\.MF/);
  assert.equal(parseManifest('A: 1\nB: 2\n').get('b'), '2');
});

test('manifest: Implementation-Version alone is not a contract version', () => {
  assert.equal(readManifestContractVersion(MANIFEST_ONLY_VERSION), null);
});

test('properties: reads keelbase.contract.version', () => {
  const hit = readPropertiesContractVersion('keelbase.contract.version=1.22.0\n', 'p');
  assert.equal(hit?.value, '1.22.0');
  assert.equal(readPropertiesContractVersion('# nothing here\n', 'p'), null);
});

test('provenance: reads contractVersion, rejects a non-string', () => {
  assert.equal(readProvenanceContractVersion('{"contractVersion":"v1.22.0"}', 'j')?.value, 'v1.22.0');
  assert.equal(readProvenanceContractVersion('{"contractVersion":1}', 'j'), null);
  assert.equal(readProvenanceContractVersion('not json', 'j'), null);
});

test('embedded pom: reads the properties block only', () => {
  const pom = '<project><properties><keelbase.contract.version>v1.22.0</keelbase.contract.version></properties></project>';
  assert.equal(readPomContractVersion(pom)?.value, 'v1.22.0');
  assert.equal(readPomContractVersion('<project><description>v1.22.0</description></project>'), null);
});

test('findContractVersion: reports every site it looked at', () => {
  const entries = new Map([
    ['META-INF/MANIFEST.MF', MANIFEST_ONLY_VERSION],
    ['META-INF/maven/cn.com.keelbase/keelbase4j-core/pom.xml', '<project/>'],
  ]);
  const { found, examined } = findContractVersion(entries);
  assert.equal(found, null);
  assert.ok(examined.length >= 4);
  assert.ok(examined.some((e) => e.site === 'META-INF/MANIFEST.MF' && e.status === 'present, no declaration'));
  assert.ok(examined.some((e) => e.site === 'META-INF/keelbase-contract.properties' && e.status === 'absent'));
});

test('comparison: v-prefix and whitespace are not differences', () => {
  assert.equal(normalizeVersion(' v1.22.0 '), '1.22.0');
  assert.equal(compareVersions('1.22.0', 'v1.22.0'), 'match');
  assert.equal(compareVersions('v1.22.0', 'v1.21.0'), 'mismatch');
});

// ── end to end: the three exit codes ──────────────────────────────────────────

test('exit 0 when the declared version matches', () => {
  withJar({ 'META-INF/MANIFEST.MF': MANIFEST_WITH_CONTRACT }, (jar) => {
    const r = run(jar, 'v1.22.0');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /observed contract version: v1\.22\.0/);
  });
});

test('exit 1 when the declared version differs, and the observed value is printed', () => {
  withJar({ 'META-INF/MANIFEST.MF': MANIFEST_WITH_CONTRACT }, (jar) => {
    const r = run(jar, 'v1.21.0');
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /MISMATCH/);
    assert.match(r.stderr, /v1\.22\.0/);
  });
});

test('exit 2 — not 0 — when nothing is declared', () => {
  withJar({ 'META-INF/MANIFEST.MF': MANIFEST_ONLY_VERSION }, (jar) => {
    const r = run(jar, 'v1.22.0');
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /UNDECLARED/);
  });
});
