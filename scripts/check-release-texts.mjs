#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Release-text gate: every product commit since the previous tag is accounted for, and the tag body is
 * the release notes file itself.
 *
 * v1.4.2 shipped a user-visible security fix (single-quoted keys masked in the non-JSON fallback) that
 * was in the tagged tree but in none of the three release texts — the commit landed after the notes had
 * been frozen, and nothing compared "commits that entered the product" with "what the notes say". This
 * script is that comparison, in two modes:
 *
 *   coverage  every non-merge commit in <prev-tag>..<tip> that changes a product file must have an entry
 *             in the coverage table; an entry for a commit that is not in the range is reported too
 *             (fat tables rot). Test-only, doc-only and generated-provenance changes need no entry.
 *   text      the body of an annotated tag must equal the release-notes file, so the tag, the GitHub/Gitee
 *             release and the repository all quote one text. Line endings and trailing newlines may differ.
 *
 *   node scripts/check-release-texts.mjs --prev-tag v1.4.1 --tip v1.4.2 --coverage ../handoff/release-coverage-v1.4.2.json
 *   node scripts/check-release-texts.mjs --tag v1.4.2 --notes ../handoff/release-notes-v1.4.2.md
 *
 * The coverage table is a JSON array (or { "entries": [...] }) of
 *   { "sha": "0705a4a8…", "kind": "user-visible|internal|docs", "text": "where the notes say it", "reason": "why internal" }
 * `text` is required for user-visible, `reason` for internal. Shas may be abbreviated.
 *
 * Exit codes
 *   0  the range is fully covered / the tag body equals the file
 *   1  an uncovered or stale commit, a malformed entry, or a text mismatch
 *   2  the check cannot read its inputs (arguments, git, tag, JSON)
 *
 * —— 中文 ——
 * 发布文本门：上一 tag 以来的每笔产品提交都有着落，且 tag 正文就是发布说明那份文件。
 *
 * v1.4.2 发出去时带了一笔用户可见的安全修复（非 JSON 兜底里的单引号键打码）—— 它在被 tag 的树里，
 * 却不在三处发布文本的任何一处：提交落在说明冻结之后，而没有东西把「进入产品的提交」与「说明写了
 * 什么」对上。本脚本就是这次比对，两种模式：
 *
 *   覆盖校验  在 <prev-tag>..<tip> 内、改动过产品文件的每个非合并提交，都必须在覆盖表里有条目；
 *             覆盖表里有、区间内没有的提交同样点名（胖表会烂）。只改测试、文档与生成 provenance
 *             的提交不需要条目。
 *   文本同源  附注 tag 的正文必须等于发布说明文件，使 tag、GitHub/Gitee Release 与仓库引用同一份
 *             文本。行尾与末尾换行允许不同。
 *
 *   node scripts/check-release-texts.mjs --prev-tag v1.4.1 --tip v1.4.2 --coverage ../handoff/release-coverage-v1.4.2.json
 *   node scripts/check-release-texts.mjs --tag v1.4.2 --notes ../handoff/release-notes-v1.4.2.md
 *
 * 覆盖表是 JSON 数组（或 { "entries": [...] }），每条形如
 *   { "sha": "0705a4a8…", "kind": "user-visible|internal|docs", "text": "说明里的定位", "reason": "为何 internal" }
 * user-visible 必填 `text`，internal 必填 `reason`；sha 可用缩写。
 *
 * 退出码
 *   0  区间全覆盖 / tag 正文与文件一致
 *   1  有未归类或陈旧提交、条目不合规，或文本不一致
 *   2  输入读不出（参数、git、tag、JSON）
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * Product surfaces: what a user of this repository receives when it is installed. A commit that changes
 * one of these has to be accounted for in the release text. Deliberately excluded: `docs/` and every
 * `.md` file (the notes describe the product, they are not it), `scripts/` and `.github/` (build and gate
 * tooling), `deploy/`, `docker/`, `infra/` (deployment), and the generator templates.
 *
 * 产品面：使用者装上这个仓库时真正拿到的东西。改动其中一处的提交必须在发布文本里有交代。刻意排除：
 * `docs/` 与所有 `.md`（说明描述产品，本身不是产品）、`scripts/` 与 `.github/`（构建与门禁工具）、
 * `deploy/`、`docker/`、`infra/`（部署件）以及生成器模板。
 */
const PRODUCT_PATHS = Object.freeze([
  'Server-NestJS/src',
  'Web-Admin-Vue/src',
  'Front-Flutter/lib',
  'Web-Admin-React/src',
])

/**
 * Files under a product path that are not product behaviour: tests, docs and the generated provenance
 * metadata. A commit that changes only these needs no coverage entry.
 *
 * 产品路径下但不属于产品行为的文件：测试、文档与生成的 provenance 元数据。只改这些的提交不需要条目。
 */
const NON_PRODUCT_FILE = [
  /(^|\/)(test|tests|__tests__|__mocks__|fixtures)\//,
  /\.(spec|test)\.(ts|tsx|js|mjs|cjs|jsx|dart)$/i,
  /\.md$/i,
  /(^|\/)\.keelbase-provenance\.json$/,
]

const KINDS = new Set(['user-visible', 'internal', 'docs'])

function value(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function git(root, args) {
  return run('git', ['-C', root, '-c', 'core.quotePath=false', ...args])
}

function stop(code, message) {
  const label = code === 0 ? 'OK' : code === 1 ? 'FAIL' : 'UNKNOWN'
  console.error(`${label} ${message}`)
  process.exit(code)
}

const USAGE = [
  'usage:',
  '  node scripts/check-release-texts.mjs --prev-tag <tag> --tip <sha> --coverage <json> [--root DIR]',
  '  node scripts/check-release-texts.mjs --tag <tag> --notes <file> [--root DIR]',
  '',
  '  coverage  every product commit in <prev-tag>..<tip> must be in the coverage table',
  '  text      the annotated tag body must equal the release-notes file',
].join('\n')

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

const root = value('--root', process.cwd())
const prevTag = value('--prev-tag', '')
const tip = value('--tip', '')
const coveragePath = value('--coverage', '')
const tag = value('--tag', '')
const notesPath = value('--notes', '')

const wantsCoverage = Boolean(prevTag || tip || coveragePath)
const wantsText = Boolean(tag || notesPath)

if (wantsCoverage && wantsText) {
  stop(2, `give one mode at a time / 一次只能给一种模式\n${USAGE}`)
}
if (!wantsCoverage && !wantsText) {
  stop(2, `no mode given / 没有指定模式\n${USAGE}`)
}

const isProductFile = (file) => PRODUCT_PATHS.some((p) => file.startsWith(`${p}/`))
const isSubstantiveProductFile = (file) => isProductFile(file) && !NON_PRODUCT_FILE.some((re) => re.test(file))

/** Commits in the range, each with the product files it changes and whether it requires coverage. */
function readRange(prev, end) {
  const raw = git(root, [
    'log',
    '--no-merges',
    '--no-renames',
    '--name-only',
    '--format=\u001e%H%x09%s',
    `${prev}..${end}`,
  ])
  const commits = []
  for (const chunk of raw.split('\u001e')) {
    if (!chunk.trim()) continue
    const [head, ...rest] = chunk.split('\n')
    const tab = head.indexOf('\t')
    const sha = (tab >= 0 ? head.slice(0, tab) : head).trim()
    const subject = tab >= 0 ? head.slice(tab + 1).trim() : ''
    const files = rest.map((l) => l.trim()).filter(Boolean)
    const productFiles = files.filter(isProductFile)
    const substantive = productFiles.filter(isSubstantiveProductFile)
    commits.push({ sha, subject, productFiles, substantive, needsCoverage: substantive.length > 0 })
  }
  return commits
}

function readCoverage(path) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    stop(2, `cannot read the coverage table ${path}: ${error.message} / 读不出覆盖表 ${path}`)
  }
  const entries = Array.isArray(parsed) ? parsed : parsed?.entries
  if (!Array.isArray(entries)) {
    stop(2, `the coverage table has no entries array / 覆盖表里没有 entries 数组`)
  }
  return entries
}

function coverage() {
  if (!prevTag || !tip || !coveragePath) {
    stop(2, `--prev-tag, --tip and --coverage are all required / 三个参数缺一不可\n${USAGE}`)
  }
  for (const [name, rev] of [['--prev-tag', prevTag], ['--tip', tip]]) {
    try {
      git(root, ['rev-parse', '--verify', `${rev}^{commit}`])
    } catch {
      stop(2, `cannot resolve ${name} ${rev} / ${name} ${rev} 解析不出`)
    }
  }

  const commits = readRange(prevTag, tip)
  const bySha = new Map(commits.map((c) => [c.sha, c]))
  const entries = readCoverage(coveragePath)

  // Normalise abbreviated shas against the range; an entry that resolves to nothing there is stale.
  const problems = []
  const covered = new Map()
  for (const [i, entry] of entries.entries()) {
    const label = `entry #${i + 1}`
    if (!entry || typeof entry !== 'object') {
      problems.push(`${label}: not an object / 不是对象`)
      continue
    }
    const sha = String(entry.sha || '').trim().toLowerCase()
    if (!/^[0-9a-f]{7,40}$/.test(sha)) {
      problems.push(`${label}: "${entry.sha}" is not a commit sha (7–40 hex) / 不是提交 sha（7–40 位十六进制）`)
      continue
    }
    if (!KINDS.has(entry.kind)) {
      problems.push(`${label} (${sha}): kind "${entry.kind}" is not one of ${[...KINDS].join(' | ')} / kind 取值不合规`)
      continue
    }
    if (entry.kind === 'user-visible' && !String(entry.text || '').trim()) {
      problems.push(`${label} (${sha}): kind user-visible needs text / user-visible 条目必须写 text`)
      continue
    }
    if (entry.kind === 'internal' && !String(entry.reason || '').trim()) {
      problems.push(`${label} (${sha}): kind internal needs reason / internal 条目必须写 reason`)
      continue
    }

    const matches = commits.filter((c) => c.sha.startsWith(sha))
    if (matches.length === 0) {
      problems.push(`stale entry ${sha}: not in ${prevTag}..${tip} / 覆盖表里的这笔提交不在区间内`)
      continue
    }
    if (matches.length > 1) {
      problems.push(`entry ${sha}: abbreviates ${matches.length} commits, use more characters / 缩写有歧义，请多写几位`)
      continue
    }
    const commit = matches[0]
    if (covered.has(commit.sha)) {
      problems.push(`entry ${sha}: listed twice / 同一笔提交列了两次`)
      continue
    }
    covered.set(commit.sha, entry)
  }

  const uncovered = commits.filter((c) => c.needsCoverage && !covered.has(c.sha))

  for (const c of uncovered) {
    const files = c.substantive.slice(0, 6).join(', ')
    const more = c.substantive.length > 6 ? ` (+${c.substantive.length - 6} more)` : ''
    problems.push(`uncovered ${c.sha.slice(0, 12)}  ${c.subject}\n    product files: ${files}${more}`)
  }

  const required = commits.filter((c) => c.needsCoverage).length
  const optional = commits.length - required

  if (problems.length) {
    stop(
      1,
      `${problems.length} problem(s) in ${prevTag}..${tip} / 区间 ${prevTag}..${tip} 有 ${problems.length} 个问题\n` +
        problems.map((p) => `  ✗ ${p}`).join('\n'),
    )
  }

  const byKind = {}
  for (const entry of covered.values()) byKind[entry.kind] = (byKind[entry.kind] || 0) + 1
  stop(
    0,
    `${prevTag}..${tip}: ${required} product commit(s) all covered (${Object.entries(byKind)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ') || 'none'}); ${optional} test/doc-only commit(s) need no entry / ` +
      `${required} 笔产品提交全部有交代，${optional} 笔仅测试或文档的提交无需条目`,
  )
}

/** The body of an annotated tag: everything after the header block's blank line. */
function tagBody(object) {
  const lines = object.split('\n')
  const blank = lines.indexOf('')
  if (blank < 0) return ''
  return lines.slice(blank + 1).join('\n')
}

/** Line endings and trailing newlines may differ; nothing else may. */
function normalise(text) {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '')
}

function texts() {
  if (!tag || !notesPath) {
    stop(2, `--tag and --notes are both required / 两个参数缺一不可\n${USAGE}`)
  }

  let type
  try {
    type = git(root, ['cat-file', '-t', tag]).trim()
  } catch {
    stop(2, `cannot read ${tag} / 读不出 ${tag}`)
  }
  if (type !== 'tag') {
    stop(2, `${tag} is a ${type}, not an annotated tag — its body cannot carry the notes / ${tag} 不是附注 tag`)
  }

  let object
  try {
    object = git(root, ['cat-file', 'tag', tag])
  } catch (error) {
    stop(2, `cannot read the body of ${tag}: ${error.message} / 读不出 ${tag} 的正文`)
  }

  let notes
  try {
    notes = readFileSync(notesPath, 'utf8')
  } catch (error) {
    stop(2, `cannot read the notes file ${notesPath}: ${error.message} / 读不出说明文件 ${notesPath}`)
  }

  const expected = normalise(notes)
  const actual = normalise(tagBody(object))

  if (expected !== actual) {
    const want = expected.split('\n')
    const got = actual.split('\n')
    const at = want.findIndex((line, i) => line !== got[i])
    const line = at < 0 ? Math.min(want.length, got.length) : at
    const show = (v) => (v === undefined ? '<nothing>' : JSON.stringify(v))
    stop(
      1,
      `${tag} body and ${notesPath} differ at line ${line + 1} / ${tag} 正文与 ${notesPath} 在第 ${line + 1} 行不同\n` +
        `  file: ${show(want[at])}\n  tag:  ${show(got[at])}\n` +
        `  (file ${want.length} line(s), tag ${got.length} line(s) / 文件 ${want.length} 行，tag ${got.length} 行)`,
    )
  }

  stop(
    0,
    `${tag} body equals ${notesPath} (${expected.split('\n').length} line(s)) / ${tag} 正文与 ${notesPath} 一致`,
  )
}

if (wantsCoverage) coverage()
else texts()
