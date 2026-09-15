#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 期间审计报告渲染件（交付物层 D-1，docs/period-audit-report.spec.md）。
 *
 * 输入 = `ActionReportExport`（keelbase-audit-evidence/2，GET /audit/action-report/export 产物）。
 * 输出 = 单文件自包含 HTML（七问 → 段）：**复用 D-2 渲染件**（shell/CSS/i18n/诚实边界），
 * 本件只做**聚合外壳**（摘要 / 动作构成 / 逐条动作索引 / 链行清单）——单动作渲染仍由 D-2 唯一实现（§10-3）。
 *
 * - 逐条动作索引**链接**到各单动作 D-2 报告（相对 `.html`，缺文件降级「未附」，本报告仍可读）。
 * - 零新依赖（node 内置 + 同目录 D-2 渲染件）；确定性（不读时钟/随机数）。
 * - 不新增证据事实：仅聚合既有导出 JSON（不新增端点/表/链）。
 */
import { createHmac } from 'node:crypto';
import { chainHash } from './protocol-algorithms.mjs';
import {
  pageShell, heading, kvTable, dataTable, pair, escapeHtml,
  verdictBanner, honestLimits, missing, headComment,
} from './evidence-report-html.mjs';

/**
 * 期间包验证（判定与渲染分离）：结构 + 包内 hashChain + 可选 --key 全量重算与签名验证。
 * 与 verify-evidence.mjs /1|/2 路径同语义（不 import 其源码——该文件无导出且带 process.exit）。
 * 返回 { ok, mode, chainValid, brokenAt?, recomputed, signatureState, structural, embeddedValid }
 */
export function verifyPeriodPackage(pkg, keys = []) {
  const rows = Array.isArray(pkg.chain) ? pkg.chain : [];
  const embeddedValid = pkg.report?.hashChain?.valid === true;

  let structural = true;
  let brokenAt;
  const seqBad = rows.findIndex((r, i) => r.seq !== i + 1);
  if (seqBad > -1) { structural = false; brokenAt = rows[seqBad]?.seq ?? seqBad + 1; }
  if (structural && rows.some((r) => !/^[0-9a-f]{64}$/.test(r.hash ?? ''))) structural = false;
  if (structural) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].prevHash !== rows[i - 1].hash) { structural = false; brokenAt = rows[i].seq; break; }
    }
  }
  if (structural && rows.length && rows[0].prevHash != null) structural = false;

  let recomputed = null;
  let chainValid = structural && embeddedValid;
  let signatureState = pkg.signature ? 'skipped' : 'absent';

  if (keys.length) {
    let done = 0;
    let mismatchAt = -1;
    for (const r of rows) {
      if (!keys.some((k) => chainHash(k, r.prevHash, r.payload) === r.hash)) { mismatchAt = r.seq; break; }
      done++;
    }
    recomputed = { done, total: rows.length };
    if (mismatchAt > -1) brokenAt = mismatchAt;
    chainValid = structural && mismatchAt < 0;

    if (pkg.signature) {
      // 与导出实现/cli 验签同构：**注意此 canonical 用普通 JSON.stringify 的键序**（非 canonicalJSON）
      const canonical = JSON.stringify({
        summary: pkg.report?.summary,
        hashChain: pkg.report?.hashChain,
        effectDiffs: pkg.report?.effectDiffs,
        ...(pkg.format === 'keelbase-audit-evidence/2' ? { compliance: pkg.compliance } : {}),
        chain: pkg.chain,
        exportedAt: pkg.exportedAt,
      });
      const sigOk = keys.some((k) => createHmac('sha256', k).update(canonical).digest('hex') === pkg.signature);
      signatureState = sigOk ? 'verified' : 'mismatch';
    }
  }

  const ok = chainValid && signatureState !== 'mismatch';
  return { ok, mode: keys.length ? 'full' : 'structure', chainValid, brokenAt, recomputed, signatureState, structural, embeddedValid };
}

const present = (v) => v !== undefined && v !== null && v !== '';

/** 期间包指纹：链行数 + 末行 hash（封面用）。 */
export function periodFingerprint(pkg) {
  const rows = Array.isArray(pkg.chain) ? pkg.chain : [];
  return { rows: rows.length, lastHash: rows.length ? rows[rows.length - 1]?.hash ?? null : null };
}

/** 逐条动作索引的默认链接：相对同目录 `<id>.report.html`（D-2 单动作报告）。 */
const defaultHref = (item) => (item?.id === undefined || item?.id === null ? null : `./${item.id}.report.html`);

/**
 * D-1：期间审计报告整页。
 * verdict = verifyPeriodPackage(...) 的返回；opts = { lang, pkgName, actionReportHref? }
 */
export function renderPeriodHtml(pkg, verdict, opts = {}) {
  const lang = opts.lang ?? 'both';
  const href = typeof opts.actionReportHref === 'function' ? opts.actionReportHref : defaultHref;
  const rep = pkg.report ?? {};
  const period = rep.period ?? {};
  const fp = periodFingerprint(pkg);
  const v = { ok: verdict.ok, mode: verdict.mode, brokenAt: verdict.brokenAt };
  const secs = [];

  secs.push(`<h1>${pair('期间审计报告', 'Period Audit Report', lang)}</h1>`);
  secs.push(`<p class="muted">${pair('一段时间内 AI 与人工行为的审计汇总（离线自包含；逐条链接到单动作证据报告）', 'Audit summary over a period (offline, self-contained; each action links to its single-action evidence report)', lang)}</p>`);
  secs.push(verdictBanner(v, lang));

  // 封面（何时）
  secs.push(heading('封面', 'Cover', lang));
  secs.push(kvTable([
    ['期间起', 'Period from', present(period.since) ? escapeHtml(period.since) : escapeHtml('(自始至今)')],
    ['期间止', 'Period to', present(period.to) ? escapeHtml(period.to) : '—'],
    ['导出时间', 'Exported at', present(pkg.exportedAt) ? escapeHtml(pkg.exportedAt) : '—'],
    ['包格式', 'Package format', present(pkg.format) ? `<code>${escapeHtml(pkg.format)}</code>` : '—'],
    ['生成器', 'Generator', present(pkg.generator) ? escapeHtml(pkg.generator) : '—'],
    ['包指纹', 'Package fingerprint', `${escapeHtml(fp.rows)} ${pair('链行', 'chain rows', lang)} · <code>${escapeHtml((fp.lastHash ?? '—').slice(0, 16))}…</code>`],
  ], lang));

  // 期间摘要（何时·结果）
  secs.push(heading('期间摘要', 'Period summary', lang));
  const sum = rep.summary;
  if (!sum || typeof sum !== 'object') secs.push(missing(lang, '本包无摘要段', 'No summary section'));
  else {
    secs.push(kvTable([
      ['执行', 'Executed', escapeHtml(sum.executed ?? 0)],
      ['人工批准', 'Approved', escapeHtml(sum.approved ?? 0)],
      ['人工拒绝', 'Rejected', escapeHtml(sum.rejected ?? 0)],
      ['阻断', 'Blocked', escapeHtml(sum.blocked ?? 0)],
      ['错误', 'Errors', escapeHtml(sum.errors ?? 0)],
      ['副作用', 'Effects', escapeHtml(sum.effects ?? 0)],
    ], lang));
  }
  const byDay = Array.isArray(rep.byDay) ? rep.byDay : [];
  if (!byDay.length) secs.push(missing(lang, '本包无按日趋势', 'No per-day trend in this package'));
  else {
    secs.push(dataTable(
      [['日期 (UTC)', 'Date (UTC)'], ['执行', 'Executed'], ['批准', 'Approved'], ['拒绝', 'Rejected'], ['阻断', 'Blocked'], ['错误', 'Errors']],
      byDay.map((d) => [escapeHtml(d.date), escapeHtml(d.executed ?? 0), escapeHtml(d.approved ?? 0), escapeHtml(d.rejected ?? 0), escapeHtml(d.blocked ?? 0), escapeHtml(d.errors ?? 0)]),
      lang,
    ));
  }

  // 动作构成（做了什么）
  secs.push(heading('动作构成', 'By action', lang));
  const byAction = Array.isArray(rep.byAction) ? rep.byAction : [];
  if (!byAction.length) secs.push(missing(lang, '本包无动作构成', 'No action breakdown'));
  else secs.push(dataTable(
    [['动作', 'Action'], ['计数', 'Count']],
    byAction.map((a) => [`<code>${escapeHtml(a.action)}</code>`, escapeHtml(a.count)]),
    lang,
  ));

  // 逐条动作索引（谁·做了什么·为什么）
  secs.push(heading('逐条动作索引', 'Action index', lang));
  const items = (Array.isArray(pkg.compliance) && pkg.compliance.length ? pkg.compliance : (Array.isArray(rep.samples) ? rep.samples : []));
  if (!items.length) secs.push(missing(lang, '本包无逐条明细', 'No per-action detail in this package'));
  else {
    secs.push(dataTable(
      [['#', '#'], ['谁', 'Who'], ['做了什么', 'What'], ['为什么', 'Why'], ['结果', 'Result'], ['证据报告', 'Evidence report']],
      items.map((it, i) => {
        const who = it?.identityChain?.human?.username ?? it?.identityChain?.human?.userId ?? it?.username ?? '—';
        const what = [it?.businessEvent, it?.toolName ?? it?.action].filter(present).join(' · ') || '—';
        const why = present(it?.summary?.sentence) ? escapeHtml(it.summary.sentence) : `<span class="missing">${pair('本包无摘要', 'No summary', lang)}</span>`;
        const result = it?.isError ? `<span class="warn">${pair('失败', 'Failed', lang)}</span>` : pair('成功', 'OK', lang);
        const link = href(it);
        const evidence = link
          ? `<a href="${escapeHtml(link)}">${pair('单动作报告', 'Action report', lang)}</a>`
          : `<span class="missing">${pair('未附', 'Not attached', lang)}</span>`;
        return [escapeHtml(i + 1), escapeHtml(who), escapeHtml(what), why, result, evidence];
      }),
      lang,
    ));
    secs.push(`<p class="muted">${pair('逐条报告由单动作证据包渲染（`verify-evidence.mjs --format=html`）；未附文件时链接不可用，本报告自身仍可读。', 'Per-action reports are rendered from single-action evidence packages (`verify-evidence.mjs --format=html`); if a file is not attached its link is unavailable, and this report remains readable.', lang)}</p>`);
  }

  // 链行清单（可否独立验证）
  secs.push(heading('链行清单', 'Chain manifest', lang));
  const rows = Array.isArray(pkg.chain) ? pkg.chain : [];
  if (!rows.length) secs.push(missing(lang, '本包无链行', 'No chain rows'));
  else {
    secs.push(`<p class="muted">${pair(
      `共 ${rows.length} 行；包内 hashChain.checked=${escapeHtml(rep.hashChain?.checked ?? '—')}，valid=${escapeHtml(rep.hashChain?.valid ?? '—')}${verdict.brokenAt ? `，断链 @ 行 ${escapeHtml(verdict.brokenAt)}` : ''}`,
      `Total ${rows.length} rows; in-package hashChain.checked=${escapeHtml(rep.hashChain?.checked ?? '—')}, valid=${escapeHtml(rep.hashChain?.valid ?? '—')}${verdict.brokenAt ? `, broken @ row ${escapeHtml(verdict.brokenAt)}` : ''}`,
      lang,
    )}</p>`);
    secs.push(dataTable(
      [['序号', 'Seq'], ['id', 'id'], ['prevHash', 'prevHash'], ['hash', 'hash']],
      rows.slice(0, 100).map((r) => [escapeHtml(r.seq), escapeHtml(r.id), `<code>${escapeHtml((r.prevHash ?? 'null').slice(0, 16))}…</code>`, `<code>${escapeHtml(String(r.hash ?? '').slice(0, 16))}…</code>`]),
      lang,
    ));
    if (rows.length > 100) secs.push(`<p class="muted">${pair(`（仅显示前 100 行；全量见包内 chain[]）`, '(Showing first 100 rows; full list in the package chain[])', lang)}</p>`);
  }

  // 签名
  secs.push(heading('签名', 'Signature', lang));
  if (verdict.signatureState === 'absent') secs.push(`<p>${pair('本包无签名（导出时未配密钥）——无法验签。', 'No signature in this package (no key configured at export) — cannot be verified.', lang)}</p>`);
  else if (verdict.signatureState === 'skipped') secs.push(`<p class="warn">${pair('本包含签名，但未提供 --key，未验签。', 'This package carries a signature, but no --key was provided — not verified.', lang)}</p>`);
  else if (verdict.signatureState === 'verified') secs.push(`<p>${pair('签名验证通过（HMAC-SHA256；覆盖 summary + hashChain + effectDiffs + compliance + chain + exportedAt）。', 'Signature verified (HMAC-SHA256; covers summary + hashChain + effectDiffs + compliance + chain + exportedAt).', lang)}</p>`);
  else secs.push(`<p class="warn">${pair('签名不匹配——导出后包内容被改动，或密钥不符。', 'Signature mismatch — the package was altered after export, or the key differs.', lang)}</p>`);

  // 验证步骤
  secs.push(heading('验证步骤', 'How to verify yourself', lang));
  const pkgName = escapeHtml(opts.pkgName ?? '<export.json>');
  secs.push(`<ol>
<li>${pair('整包结构验证（无需密钥）：', 'Whole-package structure check (no key):', lang)}<pre>node scripts/verify-evidence.mjs ${pkgName}</pre></li>
<li>${pair('全量重算 + 验签：', 'Full recompute + signature:', lang)}<pre>node scripts/verify-evidence.mjs ${pkgName} --key &lt;AUDIT_HMAC_KEY&gt;</pre></li>
<li>${pair('单动作报告（逐条索引指向的产物）：', 'Single-action reports (what the index links to):', lang)}<pre>node scripts/verify-evidence.mjs &lt;action-pkg.json&gt; --format=html --out &lt;id&gt;.report.html</pre></li>
<li>${pair('本报告可离线复现：', 'Reproduce this report offline:', lang)}<pre>node scripts/render-period-report.mjs ${pkgName} --out report.html</pre></li>
</ol>`);

  // 诚实边界
  secs.push(heading('诚实边界', 'Honest limits', lang));
  const nSamples = items.length;
  const cap = present(opts.limit) ? opts.limit : 50;
  const m = present(rep.hashChain?.checked) ? rep.hashChain.checked : (byAction.reduce((s, a) => s + (Number(a.count) || 0), 0) || '—');
  const extra = [
    pair(
      `**明细为样本**：明细样本 ${nSamples}（上限 ${cap}）/ 总数 ${m}（M = 本包链行数 hashChain.checked；期间 summary 计数另见「期间摘要」）。明细 **不等于全量**，需某动作全量请打开其单动作报告。`,
      `**Detail is a sample**: ${nSamples} detail samples (cap ${cap}) / total ${m} (M = chain rows in package, hashChain.checked; period summary counts are above). Details are **not the full set** — open a single-action report for a specific action.`,
      lang,
    ),
    pair(
      '期间完整性：`period.since` 为空表示「自始至今」；本报告的链只覆盖**该库当前链**，跨库/跨系统不在内。',
      'Period completeness: an empty `period.since` means "from the beginning"; the chain covers only the current database chain — cross-DB/cross-system is out of scope.',
      lang,
    ),
    pair(
      '签名范围：HMAC 覆盖 summary + hashChain + effectDiffs + compliance + chain + exportedAt；未配密钥时 signature=null（无法验签）。',
      'Signature scope: HMAC covers summary + hashChain + effectDiffs + compliance + chain + exportedAt; when no key is configured signature=null (cannot be verified).',
      lang,
    ),
  ];
  secs.push(honestLimits({ mode: v.mode, extra }, lang));

  const titleBase = lang === 'zh' ? '期间审计报告' : lang === 'en' ? 'Period Audit Report' : '期间审计报告 / Period Audit Report';
  return pageShell({
    lang,
    title: `${titleBase} — ${period.since ?? 'start'} → ${period.to ?? 'now'}`,
    headComment: headComment({ format: pkg.format, anchor: fp.lastHash, mode: v.mode }),
    body: secs.join('\n'),
  });
}
