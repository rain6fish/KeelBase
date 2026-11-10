#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Print the HIGH/CRITICAL image findings that have no fixed version.
 *
 * The publish gate runs Trivy with `--ignore-unfixed`, so it fails only when the fix exists — an image
 * with an unfixed finding would otherwise stay unpublishable until upstream ships a fix. That tradeoff
 * is only honest if the unfixed findings are still reported: this script reads the JSON output of the
 * same scan and names them. It never fails on findings; it exits 2 only when the report itself cannot be
 * read, so a broken report cannot read as "no unfixed findings".
 *
 * 打印镜像里没有修复版本的 HIGH/CRITICAL 发现。
 *
 * 发布门禁跑 Trivy 时带 `--ignore-unfixed`，于是只在**有修复版本**时判红 —— 否则一条无修复的发现
 * 会让镜像一直发不出去，直到上游出补丁。这个取舍只有在「无修复的发现仍然被报告」时才算诚实：
 * 本脚本读同一次扫描的 JSON 输出，把它们点名。它从不因发现而失败；只有报告本身读不出来时才以 2 退出，
 * 免得一份坏报告被读成「没有无修复发现」。
 */
import fs from 'node:fs';

const file = process.argv[2] || 'trivy-high-critical.json';

let report;
try {
  report = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`[trivy-unfixed] cannot read ${file}: ${err.message}`);
  console.error('[trivy-unfixed] 读不出报告 —— 本次不证明「没有无修复发现」/ no proof of "no unfixed findings"');
  process.exit(2);
}

// Trivy's JSON always carries `SchemaVersion`; without it this is some other document, not a clean scan.
// Trivy 的 JSON 一定带 `SchemaVersion`；没有它，这就不是一次扫描的报告，不能读成「干净」。
if (!report || typeof report.SchemaVersion !== 'number' || !Array.isArray(report.Results)) {
  console.error(`[trivy-unfixed] ${file} is not a Trivy JSON report (missing SchemaVersion/Results)`);
  console.error('[trivy-unfixed] 不是 Trivy 的 JSON 报告 / not a Trivy JSON report');
  process.exit(2);
}

const rows = [];
for (const result of report.Results) {
  for (const vuln of result.Vulnerabilities || []) {
    if (vuln.Severity !== 'HIGH' && vuln.Severity !== 'CRITICAL') continue;
    if (vuln.FixedVersion && String(vuln.FixedVersion).trim() !== '') continue;
    rows.push({
      target: result.Target,
      pkg: vuln.PkgName,
      version: vuln.InstalledVersion,
      id: vuln.VulnerabilityID,
      severity: vuln.Severity,
    });
  }
}

if (rows.length === 0) {
  console.log('[trivy-unfixed] 0 HIGH/CRITICAL finding(s) without a fixed version.');
  console.log('[trivy-unfixed] 没有无修复版本的 HIGH/CRITICAL 发现。');
  process.exit(0);
}

console.log(`[trivy-unfixed] ${rows.length} HIGH/CRITICAL finding(s) have no fixed version (reported, not gating):`);
for (const row of rows.slice(0, 50)) {
  console.log(`  - [${row.severity}] ${row.pkg}@${row.version} ${row.id} (${row.target})`);
}
if (rows.length > 50) console.log(`  ... ${rows.length - 50} more`);
console.log(`[trivy-unfixed] ${rows.length} 条 HIGH/CRITICAL 发现没有修复版本（照实报告，不判红）。`);
