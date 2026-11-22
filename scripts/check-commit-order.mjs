#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Commit-message bilingual order, for one range of commits.
//
// The house rule (user-level CLAUDE.md, settled 2026-09-22): a subject line may mix Chinese and
// English; a body that carries both languages is English as its own block first and Chinese as its own
// block second, never one line of each in turn; and no `Co-Authored-By` trailer.
//
// Why this exists: the private repository's `check-bilingual-order.mjs` judges *source comments* and
// never reads a commit message. The 2026-11-20 pre-push review found three commits that tool could not
// see — one body Chinese-first, two bare merges — and they had to be judged by hand. This pins the
// judgement down (and its own regressions, with `--self-test`) so the next review reads a verdict
// instead of re-deriving one.
//
// What is judged, per commit:
//   1. co-authored-by  — the trailer is banned outright.
//   2. order           — the body opens Chinese while English also appears in it.
//   3. order-late-en   — an English paragraph follows a Chinese one. The shape is two blocks, so every
//                        English paragraph belongs ahead of every Chinese one.
//   4. interleaved     — inside one paragraph, a Chinese line is followed directly by an English one.
//   5. single-language — a body with prose in only one language. The rule calls that a violation too,
//                        but history is full of single-language bodies, so this is a **warning** by
//                        default and becomes a violation under `--strict`.
//
// What is not judged: the subject line (mixing there is allowed), and a commit with no body prose at
// all — a bare merge has nothing to order, and it must not be reported.
//
//   node scripts/check-commit-order.mjs --base origin/main
//   node scripts/check-commit-order.mjs --range <base>..<head>
//   node scripts/check-commit-order.mjs --base origin/main --strict
//   node scripts/check-commit-order.mjs --base origin/main --report-only
//   node scripts/check-commit-order.mjs --base origin/main --json
//   node scripts/check-commit-order.mjs --self-test
//
// Exit: 0 clean (warnings allowed), 1 a violation (with `--strict`, a warning counts too), 2 a usage
// error — an unknown argument, or a base ref that does not resolve. `--report-only` always exits 0.
// The default range is `origin/main..HEAD`; the full history is never scanned unless you name a base
// that reaches it.
//
// 提交信息的中英顺序，按一个提交区间判。
//
// 规矩（用户级 CLAUDE.md，2026-09-22 定）：标题行可中英混排；正文若含两种语言，必须是**英文自成一整块在前、
// 中文自成一整块在后**，不是一行英文一行中文地逐条配对；且**不带 `Co-Authored-By`**。
//
// 为什么有这个脚本：私库的 `check-bilingual-order.mjs` 判的是**源码注释**，从不读提交信息。2026-11-20 的
// 推前核查里，三笔工具看不见的提交——一笔正文中文在前、两笔裸合并——只能人工判。这个脚本把判据钉死（并用
// `--self-test` 钉住它自己的回归），下一次复核读到的是结论，不是又推一遍。
//
// 判什么（逐笔提交）：
//   1. co-authored-by  —— 这个 trailer 一律不许有。
//   2. order           —— 正文**开头用中文**，而正文里**英文也出现了**。
//   3. order-late-en   —— 英文段落排在了中文段落**之后**。形状是两整块，故英文段落应全部在中文段落之前。
//   4. interleaved     —— 同一个段落里，中文的一行**紧接**着英文的一行，即明令禁止的逐条配对。
//   5. single-language —— 正文只有一种语言。按规矩这也算违规，但历史里大量提交只有一种语言的正文，故默认只
//                         **警告**，`--strict` 下才算违规。
//
// 不判什么：标题行（那里混排允许），以及正文没有任何散文的提交 —— 裸合并没有可排的东西，绝不能报。
//
//   node scripts/check-commit-order.mjs --base origin/main
//   node scripts/check-commit-order.mjs --range <base>..<head>
//   node scripts/check-commit-order.mjs --base origin/main --strict
//   node scripts/check-commit-order.mjs --base origin/main --report-only
//   node scripts/check-commit-order.mjs --base origin/main --json
//   node scripts/check-commit-order.mjs --self-test
//
// 退出码：0 干净（允许警告），1 有违规（`--strict` 下警告也算），2 用法错误 —— 参数不认识，或基线引用解析
// 不出来。`--report-only` 永远退出 0。默认区间是 `origin/main..HEAD`；除非点名一个能扫到根提交的基线，
// 否则绝不扫全史。

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// --- language shapes ------------------------------------------------------------------------------

const isCJKIdeograph = (cp) => (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)
const isCJK = (cp) => isCJKIdeograph(cp) || (cp >= 0x3000 && cp <= 0x303f) || (cp >= 0xff00 && cp <= 0xffef)
const isLatin = (cp) => (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)

function counts(text) {
  let cjk = 0
  let latin = 0
  let words = 0
  let inWord = false
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (isCJK(cp)) { cjk++; inWord = false }
    else if (isLatin(cp)) {
      latin++
      if (!inWord) words++
      inWord = true
    } else inWord = false
  }
  return { cjk, latin, words }
}

// Inline code and quoted material are neither language. A Chinese sentence citing an identifier, and
// an English sentence quoting a Chinese message, must both keep the language of their prose — strip
// those spans before counting, then judge what is left.
const stripInline = (line) =>
  line
    .replace(/`[^`]*`/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/「[^」]*」/g, ' ')
    .replace(/『[^』]*』/g, ' ')

// A list bullet is prose, not code: drop the marker before counting, so `- English sentence.` reads as
// English rather than as an empty line.
const stripBullet = (line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')

// English when its prose carries at least two Latin words and more words than CJK characters; any
// other text carrying a CJK character is Chinese. Counting words rather than letters keeps an
// identifier-heavy Chinese paragraph Chinese ("提到 `V6__audit_row_is_error` 与 --base").
function kindOfText(text) {
  const { cjk, latin, words } = counts(stripInline(text))
  if (cjk === 0 && latin === 0) return null
  if (cjk === 0) return words >= 2 ? 'en' : null
  if (words >= 2 && words > cjk) return 'en'
  return 'zh'
}

// Git trailers are metadata, not prose: a cherry-pick's `(cherry picked from commit …)` line and the
// `Signed-off-by` / `Change-Id` family say nothing about the order of the prose, and reading one as an
// English paragraph would report a block that is already correct. `Co-Authored-By` is excluded here
// too — it is flagged on its own, whatever language the body is in.
const isTrailer = (line) =>
  /^\s*(?:\(cherry picked from commit [0-9a-f]{7,}\)|[A-Za-z][A-Za-z-]*-by\s*:|Change-Id\s*:|Refs\s*:|Closes\s*:|Fixes\s*:)/i.test(line)
// Git writes a merge's conflict listing as `# Conflicts:` followed by `#<tab>path` lines. It is
// metadata, and read as prose it makes an otherwise single-language body look bilingual.
const isMergeMetadata = (line) => /^#(?:\s|$|\t)/.test(line)
const isMetadata = (line) => isTrailer(line) || isMergeMetadata(line)

// A line with an odd number of backticks carries a code span that started above it: the visible text is
// part of the code and part of the prose, so the line's language is not decidable on its own. Counting
// it produced a false interleaved hit on `d25796a67d`, where a wrapped `` `bash … -pl `` got read as an
// English line right after a Chinese one.
const lineKindOf = (line) => {
  if (isMetadata(line)) return null
  if ((line.match(/`/g) || []).length % 2 === 1) return null
  const stripped = stripInline(stripBullet(line))
  // A CJK quote mark left after balanced 「…」 spans were removed means one span opened on another line.
  if (/[「」『』]/.test(stripped)) return null
  const { cjk, words } = counts(stripped)
  if (cjk === 0) return words >= 2 ? 'en' : null
  // A Chinese *fragment* inside an otherwise English line is no evidence of the interleaved shape, and
  // reading one as a Chinese line reported `4f4cba558a` and `fd2690c0bb`. Chinese prose outnumbers its
  // Latin words character for character; a fragment does not.
  return cjk > words ? 'zh' : null
}

const kindOfParagraph = (lines) => kindOfText(lines.filter((l) => !isMetadata(l)).map(stripBullet).join('\n'))

// --- message parsing ------------------------------------------------------------------------------

// Splits a `%B` message into its subject and its paragraphs. Paragraphs are runs of non-blank lines;
// the subject line is deliberately excluded from judgement.
function paragraphsOf(message) {
  const lines = message.replace(/\r\n/g, '\n').split('\n')
  const paragraphs = []
  let cur = null
  for (let i = 1; i < lines.length; i++) {
    const text = lines[i]
    if (/^\s*$/.test(text)) { cur = null; continue }
    if (!cur) { cur = { startLine: i + 1, lines: [text] }; paragraphs.push(cur) }
    else cur.lines.push(text)
  }
  for (const p of paragraphs) {
    p.kind = kindOfParagraph(p.lines)
    p.lineKinds = p.lines.map(lineKindOf)
  }
  return paragraphs
}

const subjectOf = (message) => message.replace(/\r\n/g, '\n').split('\n')[0].trim()

// --- judging --------------------------------------------------------------------------------------

function judgeMessage(message, { strict = false } = {}) {
  const findings = []
  const lines = message.replace(/\r\n/g, '\n').split('\n')

  const trailerLine = lines.findIndex((l) => /^\s*co-authored-by\s*:/i.test(l))
  if (trailerLine !== -1) {
    findings.push({
      rule: 'co-authored-by',
      severity: 'violation',
      line: trailerLine + 1,
      detail: 'the message carries a Co-Authored-By trailer; the house rule bans it',
      excerpt: lines[trailerLine].trim().slice(0, 120),
    })
  }

  const paragraphs = paragraphsOf(message)
  const classified = paragraphs.filter((p) => p.kind)
  if (!classified.length) return findings

  const kinds = classified.map((p) => p.kind)
  const hasEn = kinds.includes('en')
  const hasZh = kinds.includes('zh')

  if (hasEn && hasZh) {
    if (kinds[0] === 'zh') {
      const firstZh = classified[0]
      findings.push({
        rule: 'order',
        severity: 'violation',
        line: firstZh.startLine,
        detail: 'the body opens ZH and EN follows; the house order is English first',
        excerpt: firstZh.lines.join(' ').trim().slice(0, 120),
      })
    } else {
      const zhAt = kinds.indexOf('zh')
      const lateEn = kinds.indexOf('en', zhAt)
      if (lateEn !== -1) {
        const p = classified[lateEn]
        findings.push({
          rule: 'order-late-en',
          severity: 'violation',
          line: p.startLine,
          detail: 'an EN paragraph follows a ZH one; every EN block belongs ahead of every ZH block',
          excerpt: p.lines.join(' ').trim().slice(0, 120),
        })
      }
    }
  } else {
    const only = hasEn ? 'en' : 'zh'
    findings.push({
      rule: 'single-language',
      severity: strict ? 'violation' : 'warning',
      line: classified[0].startLine,
      detail: `the body carries only ${only.toUpperCase()} prose; the rule asks for both languages`,
      excerpt: classified[0].lines.join(' ').trim().slice(0, 120),
    })
  }

  // Line-by-line pairing is judged inside a paragraph whether or not the paragraph as a whole reads as
  // one language: four alternating lines still average to "mostly Chinese", and that shape is exactly
  // what the rule forbids.
  for (const p of paragraphs) {
    const j = p.lineKinds.findIndex((k, idx) => k === 'zh' && p.lineKinds[idx + 1] === 'en')
    if (j === -1) continue
    findings.push({
      rule: 'interleaved',
      severity: 'violation',
      line: p.startLine + j + 1,
      detail: 'a ZH line is followed directly by an EN one inside the same paragraph',
      excerpt: p.lines[j].trim().slice(0, 120),
    })
    break
  }

  return findings
}

// --- git plumbing ---------------------------------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
}

function resolveCommit(ref) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim() || null
  } catch {
    return null
  }
}

// `git log` records separated by RS (0x1e) and fields by US (0x1f) — neither appears in a message.
function commitsInRange(base, head) {
  const out = git(['log', '--format=%H%x1f%B%x1e', `${base}..${head}`])
  return out
    .split('\x1e')
    .map((record) => record.replace(/^\r?\n/, ''))
    .filter((record) => record.trim())
    .map((record) => {
      const sep = record.indexOf('\x1f')
      return { sha: record.slice(0, sep).trim(), message: record.slice(sep + 1) }
    })
}

// --- runner ---------------------------------------------------------------------------------------

function checkRange(base, head, opts) {
  const commits = commitsInRange(base, head)
  let judged = 0
  let skipped = 0
  const findings = []
  const rows = []
  for (const { sha, message } of commits) {
    const found = judgeMessage(message, opts)
    const subject = subjectOf(message)
    const hasProse = paragraphsOf(message).some((p) => p.kind)
    if (hasProse) judged++
    else skipped++
    rows.push({ sha, subject, hasProse, findings: found })
    for (const f of found) findings.push({ sha, subject, ...f })
  }
  return { commits, judged, skipped, findings, rows, base, head }
}

function report(result, opts) {
  const violations = result.findings.filter((f) => f.severity === 'violation')
  const warnings = result.findings.filter((f) => f.severity === 'warning')
  const range = `${result.base}..${result.head}`

  if (opts.json) {
    console.log(JSON.stringify({
      range,
      commits: result.commits.length,
      judged: result.judged,
      skipped: result.skipped,
      violations: violations.length,
      warnings: warnings.length,
      findings: result.findings,
    }, null, 2))
    return violations.length
  }

  for (const row of result.rows) {
    if (opts.explain || row.findings.length) {
      console.log(`\n${row.sha.slice(0, 12)}  ${row.subject}`)
    }
    for (const f of row.findings) {
      const mark = f.severity === 'warning' ? 'warn' : 'FAIL'
      console.log(`  [${f.rule}] ${mark}  ${f.detail}`)
      console.log(`      | ${f.excerpt}`)
    }
  }
  const note = result.skipped ? `, ${result.skipped} skipped (no body prose)` : ''
  console.log(
    `\ncommit message order (${range}): ${violations.length} violation(s), ${warnings.length} warning(s) `
      + `across ${result.judged} commit(s) judged${note}`,
  )
  return violations.length
}

// --- self-test ------------------------------------------------------------------------------------

const SAMPLE = (...paragraphs) => paragraphs.join('\n\n')

function selfTest() {
  const cases = []
  const expect = (name, ok) => cases.push({ name, ok })
  const rules = (message, opts) => judgeMessage(message, opts).map((f) => f.rule)
  const subject = 'fix(audit): read the typed object key — 按运行时的判据读带类型对象键'

  expect('English-first body is not reported',
    rules(SAMPLE(subject, 'English prose, one paragraph.', '中文段落，独立成块。')).length === 0)

  expect('Chinese-first body is reported as order',
    rules(SAMPLE(subject, '中文段落，独立成块。', 'English prose, one paragraph.')).includes('order'))

  expect('an EN paragraph after a ZH one is reported as order-late-en',
    rules(SAMPLE(subject, 'English one.', '中文一。', 'English two.')).includes('order-late-en'))

  expect('line-by-line EN/ZH pairing is reported as interleaved',
    rules(SAMPLE(subject, 'English sentence one.\n中文句子一。\nEnglish sentence two.\n中文句子二。'))
      .includes('interleaved'))

  // The subject line is allowed to mix, and a body in one language is only a warning by default.
  const enOnly = SAMPLE(subject, 'English prose, one paragraph.')
  expect('a single-language body warns by default',
    JSON.stringify(judgeMessage(enOnly)) === JSON.stringify([{
      rule: 'single-language',
      severity: 'warning',
      line: 3,
      detail: 'the body carries only EN prose; the rule asks for both languages',
      excerpt: 'English prose, one paragraph.',
    }]))
  expect('a single-language body fails under --strict',
    rules(enOnly, { strict: true }).includes('single-language')
      && judgeMessage(enOnly, { strict: true })[0].severity === 'violation')

  expect('a Co-Authored-By trailer is reported',
    rules(SAMPLE(subject, 'English prose, one paragraph.', '中文段落，独立成块。',
      'Co-Authored-By: Someone <someone@example.com>')).includes('co-authored-by'))

  // A bare merge has a subject only. It has nothing to order and must not be reported, not even in strict.
  const bareMerge = "Merge branch 'feature-x' into main"
  expect('a bare merge is not reported', judgeMessage(bareMerge, { strict: true }).length === 0)
  expect('a commit with an empty body is not reported',
    judgeMessage(`${subject}\n\n`, { strict: true }).length === 0)

  // An English paragraph quoting a Chinese sample stays English; a Chinese paragraph citing identifiers
  // stays Chinese — neither may be read as the forbidden shape.
  expect('English prose quoting Chinese is not reported',
    rules(SAMPLE(subject, 'The console prints "当前客户。" before it asks.', '中文段落，独立成块。')).length === 0)
  expect('a Chinese paragraph citing identifiers stays single-language',
    JSON.stringify(rules(SAMPLE(subject, '中文说明，先读这一行。\n提到 `V6__audit_row_is_error` 与 --base。')))
      === JSON.stringify(['single-language']))

  // A cherry-pick's trailer is metadata, not an English paragraph after the Chinese body. Read as prose
  // it reported `2693b640fb` as order-late-en, though nothing about that body was out of order.
  const cherryPick = SAMPLE(subject, '中文段落，独立成块。', '(cherry picked from commit 2f597933a56818d5)')
  expect('a cherry-pick trailer is not an English paragraph',
    !rules(cherryPick).includes('order') && !rules(cherryPick).includes('order-late-en'))

  // An English paragraph that cites one Chinese label stays an English paragraph. Read as Chinese it
  // turned `4f4cba558a`, a Chinese-first body, into a mere single-language warning.
  const englishWithLabel = SAMPLE(
    subject,
    '中文段落，独立成块。',
    'The header said the label 旁路审计（44） while the rest of this paragraph is plainly English prose.',
  )
  expect('an English paragraph citing a Chinese label is still English',
    rules(englishWithLabel).includes('order'))

  // A Chinese bullet loaded with identifiers is not an English line. Read as one it reported
  // `fd2690c0bb` as interleaved with the `修法：` line above it.
  const identifierBullet = SAMPLE(
    subject,
    '修法：\n* real-stack.yml 的「Run every scenario gate」这一步补上 PG_HOST / PG_PORT / REDIS_HOST /',
  )
  expect('a Chinese bullet loaded with identifiers is not an English line',
    !rules(identifierBullet).includes('interleaved'))

  let failed = 0
  for (const c of cases) {
    console.log(`  ${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}`)
    if (!c.ok) failed++
  }
  console.log(`\nself-test: ${cases.length - failed}/${cases.length} passed`)
  return failed ? 1 : 0
}

// --- cli ------------------------------------------------------------------------------------------

function main(rawArgv) {
  const opts = { strict: false, reportOnly: false, explain: false, json: false, base: null, head: 'HEAD', range: null }
  // `--base=origin/main` is the form people type; accepting only the spaced form makes a scheduled job
  // fail on a spelling nobody thinks about.
  const argv = rawArgv.flatMap((a) => {
    const m = a.match(/^(--(?:base|head|range))=(.*)$/)
    return m ? [m[1], m[2]] : [a]
  })
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = (name) => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) {
        console.error(`${name} needs a value`)
        return null
      }
      return argv[++i]
    }
    if (a === '--self-test') return selfTest()
    if (a === '--strict') opts.strict = true
    else if (a === '--report-only') opts.reportOnly = true
    else if (a === '--explain') opts.explain = true
    else if (a === '--json') opts.json = true
    else if (a === '--base') { const v = value(a); if (v === null) return 2; opts.base = v }
    else if (a === '--head') { const v = value(a); if (v === null) return 2; opts.head = v }
    else if (a === '--range') { const v = value(a); if (v === null) return 2; opts.range = v }
    else if (a === '-h' || a === '--help') {
      // The header comment is the help text: one copy, in the house order, both languages.
      const body = []
      for (const line of readFileSync(fileURLToPath(import.meta.url), 'utf8').split(/\r?\n/).slice(1)) {
        if (!line.startsWith('//')) break
        body.push(line.replace(/^\/\/ ?/, ''))
      }
      console.log(body.join('\n').trim())
      return 0
    } else {
      console.error(`unknown argument: ${a} (try --help)`)
      return 2
    }
  }

  let base = opts.base
  let head = opts.head
  if (opts.range) {
    // `A...B` is git's symmetric difference, not the range this judges; accepting it would quietly
    // scan a different set than the one asked for.
    if (opts.range.includes('...')) {
      console.error(`--range wants <base>..<head> (two dots), got: ${opts.range}`)
      return 2
    }
    const m = opts.range.match(/^(.+?)\.\.(.+)$/)
    if (!m) {
      console.error(`--range wants <base>..<head>, got: ${opts.range}`)
      return 2
    }
    base = m[1]
    head = m[2]
  }
  if (!base) base = 'origin/main'

  if (!resolveCommit(base)) {
    console.error(`base ref does not resolve: ${base} (nothing was scanned)`)
    return 2
  }
  if (!resolveCommit(head)) {
    console.error(`head ref does not resolve: ${head} (nothing was scanned)`)
    return 2
  }

  const result = checkRange(base, head, opts)
  const violations = report(result, opts)
  if (opts.reportOnly) return 0
  return violations > 0 ? 1 : 0
}

export { judgeMessage, paragraphsOf, kindOfParagraph, lineKindOf }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
