#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Render one Trivy JSON report as a Markdown block for `$GITHUB_STEP_SUMMARY`.
 *
 * The weekly image scan is report-only: its job must not go red because an upstream base gained a CVE.
 * That makes the summary the whole product, so the one thing this script must not do is miscount. It
 * reads only real Trivy reports (`SchemaVersion` + `Results`), names every finding, and separates
 * "fix available" from "no fix yet" — the same split the publish gate acts on.
 *
 * 把一份 Trivy JSON 报告渲染成 `$GITHUB_STEP_SUMMARY` 用的 Markdown 块。
 *
 * 每周镜像扫描只报告、不判红：它不能因为上游基础新增 CVE 就变红。于是这份摘要是全部产物，本脚本最不能
 * 做的事就是数错。它只读真正的 Trivy 报告（`SchemaVersion` + `Results`），逐条点名，并把「有修复」与
 * 「暂无修复」分开 —— 与发布门禁据以判定的同一个划分。
 *
 * Usage: node scripts/trivy-image-summary.mjs <report.json> [label]
 * Exit: 0 = rendered; 2 = not a readable Trivy report (no summary is better than a wrong one).
 * 用法：node scripts/trivy-image-summary.mjs <报告.json> [标签]
 * 退出码：0 = 已渲染；2 = 不是可读的 Trivy 报告（没有摘要好过一份错的摘要）。
 */
import fs from 'node:fs';

const file = process.argv[2];
const label = process.argv[3] || file;

function fail(message) {
  console.error(`[trivy-summary] ${message}`);
  process.exit(2);
}

if (!file) fail('usage: node scripts/trivy-image-summary.mjs <report.json> [label]');

let report;
try {
  report = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (err) {
  fail(`cannot read ${file}: ${err.message}`);
}

// Trivy's JSON always carries `SchemaVersion`; without it this is some other document, not a scan.
// Trivy 的 JSON 一定带 `SchemaVersion`；没有它，这就不是一次扫描的报告。
if (!report || typeof report.SchemaVersion !== 'number' || !Array.isArray(report.Results)) {
  fail(`${file} is not a Trivy JSON report (missing SchemaVersion/Results)`);
}

const SEVERITY_RANK = { CRITICAL: 0, HIGH: 1 };
const rows = [];
for (const result of report.Results) {
  for (const vuln of result.Vulnerabilities || []) {
    if (!(vuln.Severity in SEVERITY_RANK)) continue;
    rows.push({
      severity: vuln.Severity,
      id: vuln.VulnerabilityID,
      pkg: vuln.PkgName,
      version: vuln.InstalledVersion,
      fixed: vuln.FixedVersion && String(vuln.FixedVersion).trim() !== '' ? vuln.FixedVersion : null,
      target: result.Target,
    });
  }
}
rows.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id));

const fixed = rows.filter((r) => r.fixed).length;
const unfixed = rows.length - fixed;

const lines = [];
lines.push(`### ${label}`);
lines.push('');
if (typeof report.ArtifactName === 'string' && report.ArtifactName) {
  lines.push(`Artifact: \`${report.ArtifactName}\``);
  lines.push('');
}
lines.push(`**${rows.length} HIGH/CRITICAL** — ${fixed} with a fixed version, ${unfixed} without.`);
lines.push('');
lines.push('| Severity | Total | With a fix | Without a fix |');
lines.push('|---|---|---|---|');
for (const severity of Object.keys(SEVERITY_RANK)) {
  const of = rows.filter((r) => r.severity === severity);
  lines.push(`| ${severity} | ${of.length} | ${of.filter((r) => r.fixed).length} | ${of.filter((r) => !r.fixed).length} |`);
}

if (rows.length > 0) {
  lines.push('');
  lines.push(`<details><summary>Findings (${rows.length})</summary>`);
  lines.push('');
  for (const row of rows) {
    const fix = row.fixed ? `fixed in ${row.fixed}` : 'no fix yet';
    lines.push(`- **${row.severity}** \`${row.pkg}@${row.version}\` ${row.id} — ${fix} (${row.target})`);
  }
  lines.push('');
  lines.push('</details>');
}

console.log(lines.join('\n'));
