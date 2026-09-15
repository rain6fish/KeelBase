#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 审计报告 HTML 渲染件（交付物层 · 唯一渲染实现）。
 *
 * 定位（docs/evidence-report.spec.md D-2 §8 / docs/period-audit-report.spec.md D-1 §10-3）：
 *   - D-2 单动作证据报告（renderHtml）——由证据包 JSON 渲染自包含 HTML。
 *   - D-1 期间报告只做**索引/摘要/链接**，复用本件原语（shell/CSS/i18n/诚实边界），不复制渲染。
 *
 * 硬约束（两 spec 同）：**单文件自包含**（CSS 内联、零外链、无 `<script src>`/`fetch`）、
 * **中英并列**默认（`--lang zh|en` 可选覆盖）、**零新依赖**（只用 Node 内置）、
 * **确定性**（同输入 → 语义一致；渲染不读时钟/随机数，段顺序恒为输入序）。
 *
 * 本件只做**渲染**——验证判定由调用脚本计算后以 `verdict` 传入（rendering ≠ verification）。
 */

/** 内联样式（含打印样式；无任何外链/远程字体）。 */
export const CSS = `
:root{--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--bg:#fff;--soft:#f6f8fa;--ok:#1a7f37;--bad:#cf222e;--warn:#9a6700;--accent:#0969da}
*{box-sizing:border-box}
body{margin:0;padding:32px;background:var(--bg);color:var(--fg);font:14px/1.6 -apple-system,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:960px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:15px;margin:28px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.verdict{padding:14px 16px;border-radius:8px;border:1px solid var(--line);background:var(--soft);margin:16px 0}
.verdict .big{font-size:22px;font-weight:700}
.verdict.pass .big{color:var(--ok)}
.verdict.fail .big{color:var(--bad)}
.verdict .meta{color:var(--muted);font-size:12px;margin-top:4px}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{background:var(--soft);font-weight:600}
code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
pre{background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:10px;overflow:auto}
.muted{color:var(--muted)}
.warn{color:var(--warn)}
.missing{color:var(--muted);font-style:italic}
.pair{display:block}
.pair .en{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.limits{border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:6px;background:var(--soft);padding:10px 14px}
.limits ul{margin:6px 0 0;padding-left:18px}
.kv td:first-child{width:200px;color:var(--muted)}
a{color:var(--accent)}
@media print{body{padding:0}.verdict{break-inside:avoid}h2{break-after:avoid}table{break-inside:auto}}
`;

/** HTML 文本转义（& < > " '）。 */
export function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const normLang = (lang) => (lang === 'zh' || lang === 'en' ? lang : 'both');

/**
 * 中英并列（默认 both：同段同框；--lang 单语覆盖）。文本会被转义。
 * 传入已转义片段时用 rawPair。
 */
export function pair(zh, en, lang = 'both') {
  return rawPair(escapeHtml(zh), escapeHtml(en), lang);
}

/** 同 pair，但两参数视为**已转义**的 HTML 片段（供内嵌计数/链接）。 */
export function rawPair(zhHtml, enHtml, lang = 'both') {
  const l = normLang(lang);
  if (l === 'zh') return `<span class="zh">${zhHtml}</span>`;
  if (l === 'en') return `<span class="en">${enHtml}</span>`;
  return `<span class="pair"><span class="zh">${zhHtml}</span><span class="en">${enHtml}</span></span>`;
}

/** 双语小节标题。 */
export function heading(zh, en, lang = 'both') {
  return `<h2>${pair(zh, en, lang)}</h2>`;
}

/** 「本包无此段」标注。 */
export function missing(lang = 'both', zh = '本包无此段', en = 'Section absent in this package') {
  return `<p class="missing">${pair(zh, en, lang)}</p>`;
}

/** 键值表。rows = [[labelZh, labelEn, valueHtml], ...]（valueHtml 已转义或受控 HTML）。 */
export function kvTable(rows, lang = 'both') {
  return `<table class="kv"><tbody>${rows
    .map(([zh, en, value]) => `<tr><td>${pair(zh, en, lang)}</td><td>${value}</td></tr>`)
    .join('')}</tbody></table>`;
}

/** 数据表。heads = [[zh, en], ...]；rows = 二维数组（单元格 HTML 由 caller 控制）。 */
export function dataTable(heads, rows, lang = 'both') {
  const th = heads.map(([zh, en]) => `<th>${pair(zh, en, lang)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

/** 结论横幅。v = { ok, mode('structure'|'full'), brokenAt?, note? } */
export function verdictBanner(v, lang = 'both') {
  const cls = v.ok ? 'pass' : 'fail';
  const passZh = v.mode === 'full' ? 'PASS（全量重算 + 验签）' : 'PASS（结构自洽）';
  const passEn = v.mode === 'full' ? 'PASS (full recompute + signature)' : 'PASS (structure self-consistent)';
  const failZh = v.brokenAt ? `FAIL（断链 @ 行 ${v.brokenAt}）` : 'FAIL（存在篡改/断链）';
  const failEn = v.brokenAt ? `FAIL (broken chain @ row ${v.brokenAt})` : 'FAIL (tampering or broken chain)';
  const big = v.ok ? pair(passZh, passEn, lang) : pair(failZh, failEn, lang);
  const modeZh = v.mode === 'full' ? '模式：全量重算（--key）' : '模式：结构验证（未提供 --key，未重算）';
  const modeEn = v.mode === 'full' ? 'Mode: full recompute (--key)' : 'Mode: structure-only (no --key, no recompute)';
  const note = v.note ? `<div class="meta">${escapeHtml(v.note)}</div>` : '';
  return `<div class="verdict ${cls}"><div class="big">${big}</div><div class="meta">${pair(modeZh, modeEn, lang)}</div>${note}</div>`;
}

/**
 * 验证步骤（常量模板，随模式）。
 * o = { mode, pkgName, lang, format ('/1'|'/2'|'/3') }
 */
export function verifySteps(o, lang = 'both') {
  const pkg = escapeHtml(o.pkgName || '<pkg.json>');
  const lines = [];
  lines.push(`<li>${pair('整包结构验证（无需密钥）：', 'Whole-package structure check (no key):', lang)}<pre>node scripts/verify-evidence.mjs ${pkg}</pre></li>`);
  if (o.mode === 'full') {
    lines.push(`<li>${pair('全量重算 + 验签：', 'Full recompute + signature:', lang)}<pre>node scripts/verify-evidence.mjs ${pkg} --key &lt;AUDIT_HMAC_KEY&gt;</pre></li>`);
  } else {
    lines.push(`<li>${pair('若持有密钥，可全量重算内容并验签：', 'With the key, recompute content and verify signature:', lang)}<pre>node scripts/verify-evidence.mjs ${pkg} --key &lt;AUDIT_HMAC_KEY&gt;</pre></li>`);
  }
  lines.push(`<li>${pair('本报告可离线复现：', 'Reproduce this report offline:', lang)}<pre>node scripts/verify-evidence.mjs ${pkg} --format=html --out report.html</pre></li>`);
  return `<ol>${lines.join('')}</ol>`;
}

/**
 * 诚实边界（固定声明块，措辞对齐不承诺清单 N-x）。
 * o = { mode, lang, extra?: string[]（如「明细样本 N / 总数 M」强制行） }
 */
export function honestLimits(o, lang = 'both') {
  const items = [];
  if (o.mode === 'full') {
    items.push(pair(
      '本报告逐行重算 + 根锚 + 整包 HMAC 验证；任一链行/锚/digest 被改 → FAIL 并定位到行。',
      'This report recomputes every row + root anchors + whole-package HMAC; any altered row/anchor/digest → FAIL with row located.',
      lang,
    ));
  } else {
    items.push(pair(
      '本次为结构验证：仅证「包内结构自洽」；**未做重算，不等于内容未被改动**。',
      'Structure-only: proves intra-package self-consistency; **no recompute was performed — this does not mean content is unmodified**.',
      lang,
    ));
  }
  items.push(pair(
    '哈希链固有：中段删行/篡改可检；**尾行截断不可检**（需外部时间锚，本报告不含）。',
    'Inherent to hash chains: mid-chain deletion/tampering is detectable; **tail truncation is not** (needs an external anchor, not included here).',
    lang,
  ));
  items.push(pair(
    '「tamper-evident（应用边界内）」而非「物理不可改」；不承诺「不可篡改」「不可抵赖」。',
    'Tamper-evident within the application boundary — not physically immutable; no "tamper-proof"/"non-repudiation" claim.',
    lang,
  ));
  for (const e of o.extra ?? []) items.push(e);
  return `<div class="limits">${pair('诚实边界', 'Honest limits', lang)}<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul></div>`;
}

/** 页壳：单文件自包含（内联 <style>，零外链）。 */
export function pageShell({ lang = 'both', title, headComment, body }) {
  return `<!DOCTYPE html>
<html lang="${normLang(lang) === 'both' ? 'zh-CN' : normLang(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- ${escapeHtml(headComment || 'keelbase-report/1')} -->
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body><div class="wrap">
${body}
</div></body>
</html>
`;
}

/** 确定性头注释（供归档比对；不读时钟）。 */
export function headComment(o) {
  return `keelbase-report/1 format=${o.format ?? '?'} ${o.anchor ? `anchor=${o.anchor} ` : ''}mode=${o.mode ?? '?'}`;
}

const present = (v) => v !== undefined && v !== null && v !== '';
const isObj = (v) => v !== null && typeof v === 'object';
const pre = (v) => `<pre>${escapeHtml(typeof v === 'string' ? v : JSON.stringify(v, null, 2))}</pre>`;

/**
 * D-2：单动作证据报告整页（keelbase-audit-evidence/1|2|3）。
 * verdict = { ok, mode('structure'|'full'), brokenAt?, rowsCount, recomputed? }
 */
export function renderHtml(pkg, verdict, opts = {}) {
  const lang = opts.lang ?? 'both';
  const v = { ok: !!verdict.ok, mode: verdict.mode ?? 'structure', brokenAt: verdict.brokenAt, note: verdict.note };
  const isV3 = pkg.format === 'keelbase-audit-evidence/3';
  const secs = [];

  secs.push(`<h1>${pair('审计证据报告', 'Audit Evidence Report', lang)}</h1>`);
  secs.push(`<p class="muted">${pair('单动作证据包（离线自包含）', 'Single-action evidence package (offline, self-contained)', lang)}</p>`);
  secs.push(verdictBanner(v, lang));

  // 封面
  const anchor = isV3 ? (pkg.action?.id ?? null) : (pkg.chain?.length ? `${pkg.chain.length} 行` : null);
  secs.push(heading('封面', 'Cover', lang));
  if (isV3) {
    secs.push(kvTable([
      ['业务动作 / AUDIT-ID', 'Business action / AUDIT-ID', present(pkg.action?.id) ? `<code>${escapeHtml(pkg.action.id)}</code>` : '—'],
      ['副作用 id', 'Effect id', present(pkg.action?.effectId) ? escapeHtml(pkg.action.effectId) : '—'],
      ['导出时间', 'Exported at', present(pkg.exportedAt) ? escapeHtml(pkg.exportedAt) : '—'],
      ['包格式', 'Package format', present(pkg.format) ? `<code>${escapeHtml(pkg.format)}</code>` : '—'],
      ['生成器', 'Generator', present(pkg.generator) ? escapeHtml(pkg.generator) : '—'],
    ], lang));
  } else {
    secs.push(kvTable([
      ['期间', 'Period', pkg.report?.period ? `${escapeHtml(pkg.report.period.since ?? '(自始)')} → ${escapeHtml(pkg.report.period.to ?? '—')}` : '—'],
      ['导出时间', 'Exported at', present(pkg.exportedAt) ? escapeHtml(pkg.exportedAt) : '—'],
      ['包格式', 'Package format', present(pkg.format) ? `<code>${escapeHtml(pkg.format)}</code>` : '—'],
      ['生成器', 'Generator', present(pkg.generator) ? escapeHtml(pkg.generator) : '—'],
      ['链行数', 'Chain rows', present(verdict.rowsCount) ? escapeHtml(verdict.rowsCount) : '—'],
    ], lang));
  }

  if (isV3) {
    // 摘要
    secs.push(heading('摘要', 'Summary', lang));
    secs.push(present(pkg.summary?.sentence) ? `<p>${escapeHtml(pkg.summary.sentence)}</p>` : missing(lang, '本包无摘要', 'No summary in this package'));

    // 授权依据
    secs.push(heading('授权依据', 'Authorization', lang));
    const a = pkg.authorization;
    if (!isObj(a)) secs.push(missing(lang, '本包无授权段', 'No authorization section'));
    else if (a.allowed === false || a.denied) {
      secs.push(`<p class="warn">${pair('本次调用被拒绝。', 'This call was denied.', lang)}</p>`);
      secs.push(pre(a.denied ?? a));
    } else {
      const checks = Array.isArray(a.checks) ? a.checks : [];
      secs.push(kvTable([
        ['工具', 'Tool', present(a.tool) ? `<code>${escapeHtml(a.tool)}</code>` : '—'],
        ['风险级 / 策略', 'Risk / strategy', `${escapeHtml(a.riskLevel ?? '—')} / ${escapeHtml(a.strategy ?? '—')}`],
        ['通过检查', 'Passed checks', checks.length ? checks.map((c) => `${escapeHtml(c.name)}${c.ok ? ' ✓' : ' ✗'}`).join('、') : '—'],
        ['策略版本', 'Policy revision', present(a.policy?.revision) ? `<code>${escapeHtml(a.policy.revision)}</code>` : '—'],
        ['策略更新时间', 'Policy updatedAt', present(a.policy?.updatedAt) ? escapeHtml(a.policy.updatedAt) : '—'],
      ], lang));
    }

    // 决策
    secs.push(heading('决策', 'Decision', lang));
    const d = pkg.decision;
    if (!isObj(d) || (!present(d.businessEvent) && !present(d.evidence))) secs.push(missing(lang, '本包无决策段', 'No decision section'));
    else {
      secs.push(kvTable([
        ['业务事件', 'Business event', present(d.businessEvent) ? `<code>${escapeHtml(d.businessEvent)}</code>` : '—'],
        ['决策说明', 'Decision evidence', present(d.evidence) ? `<code>${escapeHtml(d.evidence)}</code>` : '—'],
      ], lang));
    }

    // 副作用
    secs.push(heading('副作用', 'Effect', lang));
    const e = pkg.effect;
    if (!isObj(e)) secs.push(missing(lang, '本包无副作用段', 'No effect section'));
    else {
      secs.push(kvTable([
        ['工具', 'Tool', present(e.toolName) ? `<code>${escapeHtml(e.toolName)}</code>` : '—'],
        ['变更前', 'Before', present(e.before) ? pre(e.before) : '<span class="muted">null（创建类）</span>'],
        ['变更后', 'After', present(e.after) ? pre(e.after) : '<span class="muted">null</span>'],
      ], lang));
      secs.push(`<p class="muted">${pair('撤销态由 B4 / AI Action Center 承担，本包不重复。', 'Revocation state is carried by B4 / AI Action Center; not duplicated here.', lang)}</p>`);
    }

    // 链行清单
    secs.push(heading('链行清单', 'Chain rows', lang));
    for (const [name, rows] of [['aiAudit', pkg.chains?.aiAudit], ['operationAudit', pkg.chains?.operationAudit]]) {
      const list = Array.isArray(rows) ? rows : [];
      if (!list.length) { secs.push(missing(lang, `本包无 ${name} 链行`, `No ${name} rows`)); continue; }
      secs.push(`<h3>${escapeHtml(name)}</h3>`);
      secs.push(dataTable(
        [['序号', 'Seq'], ['id', 'id'], ['prevHash', 'prevHash'], ['hash', 'hash']],
        list.map((r) => [escapeHtml(r.seq), escapeHtml(r.id), `<code>${escapeHtml((r.prevHash ?? 'null').slice(0, 16))}…</code>`, `<code>${escapeHtml(String(r.hash).slice(0, 16))}…</code>`]),
        lang,
      ));
    }

    // 根锚
    secs.push(heading('根锚', 'Root anchors', lang));
    const anchors = Array.isArray(pkg.root?.anchors) ? pkg.root.anchors : [];
    if (!anchors.length) secs.push(missing(lang, '本包无根锚', 'No root anchors'));
    else {
      secs.push(dataTable(
        [['类型', 'Kind'], ['行 id', 'Row id'], ['hash', 'hash']],
        anchors.map((x) => [escapeHtml(x.kind), escapeHtml(x.rowId), `<code>${escapeHtml(String(x.hash).slice(0, 24))}…</code>`]),
        lang,
      ));
      secs.push(`<p>${pair('根锚 digest：', 'Root digest:', lang)}<code>${escapeHtml(pkg.root?.digest ?? '—')}</code></p>`);
    }
  } else {
    // /1 /2：报告摘要 + 链行清单
    const rep = isObj(pkg.report) ? pkg.report : {};
    secs.push(heading('期间摘要', 'Period summary', lang));
    if (!isObj(rep.summary)) secs.push(missing(lang, '本包无摘要段', 'No summary section'));
    else {
      const s = rep.summary;
      secs.push(kvTable([
        ['执行', 'Executed', escapeHtml(s.executed)], ['批准', 'Approved', escapeHtml(s.approved)],
        ['拒绝', 'Rejected', escapeHtml(s.rejected)], ['阻断', 'Blocked', escapeHtml(s.blocked)],
        ['错误', 'Errors', escapeHtml(s.errors)], ['副作用', 'Effects', escapeHtml(s.effects)],
      ], lang));
    }
    secs.push(heading('链行清单', 'Chain rows', lang));
    const rows = Array.isArray(pkg.chain) ? pkg.chain : [];
    if (!rows.length) secs.push(missing(lang, '本包无链行', 'No chain rows'));
    else {
      secs.push(`<p class="muted">${pair(`共 ${rows.length} 行；hashChain.checked=${rep.hashChain?.checked ?? '—'}`, `Total ${rows.length} rows; hashChain.checked=${rep.hashChain?.checked ?? '—'}`, lang)}</p>`);
      secs.push(dataTable(
        [['序号', 'Seq'], ['id', 'id'], ['prevHash', 'prevHash'], ['hash', 'hash']],
        rows.slice(0, 50).map((r) => [escapeHtml(r.seq), escapeHtml(r.id), `<code>${escapeHtml((r.prevHash ?? 'null').slice(0, 16))}…</code>`, `<code>${escapeHtml(String(r.hash).slice(0, 16))}…</code>`]),
        lang,
      ));
    }
  }

  // 签名
  secs.push(heading('签名', 'Signature', lang));
  const sig = pkg.signature;
  if (!present(sig)) secs.push(`<p>${pair('本包无签名（导出时未配密钥）——无法验签。', 'No signature in this package (no key configured at export) — cannot be verified.', lang)}</p>`);
  else if (typeof sig === 'string') secs.push(`<p>${pair('HMAC-SHA256 签名。', 'HMAC-SHA256 signature.', lang)}</p><pre>${escapeHtml(sig)}</pre>`);
  else {
    secs.push(pre(sig));
    if (isObj(sig) && sig.sm2) {
      secs.push(`<p class="muted">${pair('SM2 签名仅显示结构，本工具不代验；用以下命令独立验签（需国密库）：', 'SM2 signature shown structurally only; this tool does not verify it. Verify independently (needs a SM-2 library):', lang)}</p>`);
      secs.push(`<pre>node scripts/verify-evidence.mjs ${escapeHtml(opts.pkgName ?? '<pkg.json>')} --sm2-pubkey &lt;PUBKEY&gt;</pre>`);
    }
  }

  // 验证步骤 + 诚实边界
  secs.push(heading('验证步骤', 'How to verify yourself', lang));
  secs.push(verifySteps({ mode: v.mode, pkgName: opts.pkgName, format: pkg.format }, lang));
  secs.push(heading('诚实边界', 'Honest limits', lang));
  secs.push(honestLimits({ mode: v.mode, extra: opts.limitExtras }, lang));

  const titleBase = lang === 'zh' ? '审计证据报告' : lang === 'en' ? 'Audit Evidence Report' : '审计证据报告 / Audit Evidence Report';
  return pageShell({
    lang,
    title: `${titleBase} — ${anchor ?? pkg.format ?? ''}`,
    headComment: headComment({ format: pkg.format, anchor: isV3 ? pkg.root?.digest : (pkg.chain?.length ? pkg.chain[pkg.chain.length - 1]?.hash : undefined), mode: v.mode }),
    body: secs.join('\n'),
  });
}
