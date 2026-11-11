#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * The weekly scan's summary is its only product, so a miscount must be caught here rather than read as
 * a clean image. These cases pin the two things that would lie: counts that do not add up, and a file
 * that is not a Trivy report being rendered as "0 findings".
 *
 * 每周扫描的摘要就是它唯一的产物，所以数错必须在这里被抓到，而不是被读成干净镜像。下面几例钉住两种会说谎的
 * 情形：加不起来的计数，以及一份不是 Trivy 报告的文件被渲染成「0 条发现」。
 *
 * Run: node --test scripts/trivy-image-summary.test.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'trivy-image-summary.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'trivy-summary-'));

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

function fixture(name, value) {
  const file = path.join(TMP, name);
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}

const report = {
  SchemaVersion: 2,
  ArtifactName: 'node:22-alpine',
  Results: [
    {
      Target: 'node:22-alpine (alpine 3.24)',
      Vulnerabilities: [
        { VulnerabilityID: 'CVE-0001', PkgName: 'a', InstalledVersion: '1.0', FixedVersion: '1.1', Severity: 'CRITICAL' },
        { VulnerabilityID: 'CVE-0002', PkgName: 'b', InstalledVersion: '2.0', FixedVersion: '', Severity: 'HIGH' },
        { VulnerabilityID: 'CVE-0003', PkgName: 'c', InstalledVersion: '3.0', Severity: 'HIGH' },
      ],
    },
  ],
};

test('counts every HIGH/CRITICAL finding and splits fixed from unfixed', () => {
  const result = run([fixture('report.json', report), 'node-22-alpine']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\*\*3 HIGH\/CRITICAL\*\* — 1 with a fixed version, 2 without\./);
  assert.match(result.stdout, /\| CRITICAL \| 1 \| 1 \| 0 \|/);
  assert.match(result.stdout, /\| HIGH \| 2 \| 0 \| 2 \|/);
  assert.match(result.stdout, /CVE-0002.*no fix yet/);
});

test('a non-Trivy document exits 2 instead of printing a clean summary', () => {
  const result = run([fixture('other.json', { hello: 'world' }), 'other']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not a Trivy JSON report/);
});

test('an unreadable file exits 2', () => {
  const result = run([path.join(TMP, 'missing.json')]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot read/);
});

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
