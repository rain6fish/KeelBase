#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Keep `.trivyignore.yaml` an expiring exception list, not a permanent silencer.
 *
 * Trivy reads `.trivyignore.yaml` and suppresses the findings it names. Its schema allows `statement`
 * and `expired_at`, but neither is required — an entry without them would suppress a finding forever,
 * which is exactly what the dependency baseline's triage rules forbid. This check requires every entry
 * to name a `statement` (reason and owner) and an `expired_at`, rejects a past expiry, and fails on a
 * malformed file so the workflow's `--ignorefile` cannot silently stop applying.
 *
 * Scope is deliberately narrow: only the subset this repository writes is understood. A block scalar
 * (`|` / `>`) or an unknown key is rejected rather than guessed at — widen the parser when a real entry
 * needs it. Trivy also enforces `expired_at` itself, so an expired entry stops suppressing at scan time
 * even before this gate runs; the gate makes that state visible as a red check with a name.
 *
 * 让 `.trivyignore.yaml` 成为**会过期**的例外清单，而不是永久消音器。
 *
 * Trivy 会读 `.trivyignore.yaml` 并压掉其中点名的发现。它的 schema 允许 `statement` 与 `expired_at`，
 * 但都不强制 —— 缺了这两项的条目会永久压住一条发现，正是依赖基线的 triage 规则所禁止的。本检查要求
 * 每条都写明 `statement`（理由与责任人）与 `expired_at`，过期即判红，文件格式不对也判红，免得工作流里的
 * `--ignorefile` 悄悄不再生效。
 *
 * 射程有意收窄：只懂本仓会写的那部分子集。块标量（`|` / `>`）或未知键一律判红而不是去猜 ——
 * 真有条目需要时再扩解析器。Trivy 自己也会执行 `expired_at`，所以条目一过期，扫描时就不再压；
 * 本门禁把那个状态变成一次点名判红的检查。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, '.trivyignore.yaml');
const ALLOWED_KEYS = new Set(['id', 'paths', 'purls', 'statement', 'expired_at']);

function todayInShanghai() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Strip a YAML comment without cutting inside a quoted scalar. */
function stripComment(raw) {
  let quote = null;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(raw[i - 1]))) return raw.slice(0, i);
  }
  return raw;
}

function scalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse the narrow subset. Returns `{ entries, problems }`; a problem is a human-readable line that
 * names the line number. Nothing is guessed: an unexpected shape is a problem, not a skipped line.
 */
function parse(content) {
  const entries = [];
  const problems = [];
  let section = null;
  let closed = false;
  let current = null;
  let sawContent = false;

  const finish = () => {
    if (current) entries.push(current);
    current = null;
  };

  content.split(/\r?\n/).forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = stripComment(raw).replace(/\s+$/, '');
    if (line.trim() === '') return;
    sawContent = true;
    const indent = line.length - line.trimStart().length;
    const text = line.trim();

    if (closed) {
      problems.push(`line ${lineNumber}: content after "vulnerabilities: []"`);
      return;
    }
    if (section === null) {
      const match = /^vulnerabilities\s*:\s*(\[\s*\])?\s*$/.exec(text);
      if (!match) {
        problems.push(`line ${lineNumber}: expected a top-level "vulnerabilities:" key, found "${text}"`);
        return;
      }
      section = 'vulnerabilities';
      if (match[1]) closed = true;
      return;
    }

    if (indent === 2 && /^-\s+/.test(text)) {
      finish();
      current = { line: lineNumber, id: '', statement: '', expired_at: '' };
      assign(current, text.slice(2), lineNumber, problems);
      return;
    }
    if (current && indent === 4) {
      assign(current, text, lineNumber, problems);
      return;
    }
    if (current && indent === 6 && /^-\s+/.test(text)) return; // an item of `paths:`/`purls:`
    if (indent <= 2) {
      problems.push(`line ${lineNumber}: unexpected top-level content "${text}"`);
      return;
    }
    problems.push(`line ${lineNumber}: unexpected indentation (${indent}) for "${text}"`);
  });
  finish();

  // A file that is only comments is the same zero-entry file Trivy reads; requiring the key there would
  // fail a correct state. Content without the key is a malformed file and is named.
  // 只有注释的文件，与 Trivy 读到的「零条目」是一回事；对这种正确状态强求 key 只会误判。
  // 有内容却没有 key，才是不合法文件，点名判红。
  if (section === null && sawContent) problems.push('no "vulnerabilities:" key');
  return { entries, problems };
}

function assign(entry, text, lineNumber, problems) {
  const match = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(text);
  if (!match) {
    problems.push(`line ${lineNumber}: expected "key: value", found "${text}"`);
    return;
  }
  const [, key, value] = match;
  if (!ALLOWED_KEYS.has(key)) {
    problems.push(`line ${lineNumber}: unknown key "${key}" (allowed: ${[...ALLOWED_KEYS].join(', ')})`);
    return;
  }
  if (key === 'id' || key === 'statement' || key === 'expired_at') {
    if (/^[|>]/.test(value.trim())) {
      problems.push(`line ${lineNumber}: block scalar "${value.trim()[0]}" is not supported; write one line or quote it`);
      return;
    }
    entry[key] = scalar(value);
    return;
  }
  entry[key] = value.trim();
}

/** Every entry needs a real statement and a future expiry; a malformed date is its own problem. */
function entryProblems(entries, today = todayInShanghai()) {
  const problems = [];
  for (const entry of entries) {
    const name = entry.id || `(entry at line ${entry.line})`;
    if (!entry.id) problems.push(`${name}: missing id`);
    if (!entry.statement) problems.push(`${name}: missing statement (reason + owner)`);
    const expiry = entry.expired_at;
    if (!expiry) {
      problems.push(`${name}: missing expired_at`);
      continue;
    }
    const parsed = new Date(`${expiry}T00:00:00Z`);
    const wellFormed =
      /^\d{4}-\d{2}-\d{2}$/.test(expiry) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === expiry;
    if (!wellFormed) {
      problems.push(`${name}: expired_at "${expiry}" is not a YYYY-MM-DD date`);
    } else if (expiry < today) {
      problems.push(`${name}: expired on ${expiry} (today is ${today})`);
    }
  }
  return problems;
}

function checkContent(content, today = todayInShanghai()) {
  const { entries, problems } = parse(content);
  return { entries, problems: problems.concat(entryProblems(entries, today)) };
}

function selftest() {
  const today = '2026-11-10';
  let failures = 0;
  const check = (label, result, want) => {
    const ok = want === 'pass' ? result.problems.length === 0 : result.problems.some((p) => p.includes(want));
    console.log(`[trivyignore] ${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` — ${result.problems.join(' | ') || 'no problem'}`}`);
    if (!ok) failures += 1;
  };

  check('green: comments only (no accepted exception) passes', checkContent('# none yet\n', today), 'pass');
  check(
    'green: a complete, unexpired entry passes',
    checkContent(
      'vulnerabilities:\n  - id: CVE-2026-0001\n    paths:\n      - usr/local/bin/x\n    statement: "owner: maintainer — not reachable at runtime"\n    expired_at: 2027-02-08\n',
      today,
    ),
    'pass',
  );
  check(
    'red: an entry without a statement is named',
    checkContent('vulnerabilities:\n  - id: CVE-2026-0002\n    expired_at: 2027-02-08\n', today),
    'CVE-2026-0002: missing statement',
  );
  check(
    'red: an entry without expired_at is named',
    checkContent('vulnerabilities:\n  - id: CVE-2026-0003\n    statement: accepted\n', today),
    'CVE-2026-0003: missing expired_at',
  );
  check(
    'red: an expired entry is named with its date',
    checkContent('vulnerabilities:\n  - id: CVE-2026-0004\n    statement: accepted\n    expired_at: 2026-11-01\n', today),
    'expired on 2026-11-01',
  );
  check(
    'red: a malformed expiry is named',
    checkContent('vulnerabilities:\n  - id: CVE-2026-0005\n    statement: accepted\n    expired_at: 2027-02-30\n', today),
    'is not a YYYY-MM-DD date',
  );
  check(
    'red: an unknown key is named',
    checkContent('vulnerabilities:\n  - id: CVE-2026-0006\n    reason: nope\n    statement: accepted\n    expired_at: 2027-02-08\n', today),
    'unknown key "reason"',
  );
  check(
    'red: a block scalar statement is rejected rather than guessed',
    checkContent('vulnerabilities:\n  - id: CVE-2026-0007\n    statement: |\n      accepted\n    expired_at: 2027-02-08\n', today),
    'block scalar',
  );

  if (failures) {
    console.error(`[trivyignore] self-test: ${failures} expectation(s) not met`);
    process.exit(1);
  }
  console.log('[trivyignore] self-test: every fixture behaved as specified');
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  if (!fs.existsSync(FILE)) {
    console.error('[trivyignore] FAIL — .trivyignore.yaml is missing, but the publish workflow passes it to Trivy.');
    console.error('[trivyignore] FAIL —— .trivyignore.yaml 不存在，而发布工作流会把它交给 Trivy。');
    process.exit(1);
  }
  const result = checkContent(fs.readFileSync(FILE, 'utf8'));
  if (result.problems.length) {
    console.error(`[trivyignore] FAIL — ${result.problems.length} problem(s) in .trivyignore.yaml:`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    console.error('[trivyignore] FAIL —— 例外必须写明理由与责任人（statement）和到期日（expired_at），且不得已过期。');
    process.exit(1);
  }
  console.log(`[trivyignore] ${result.entries.length} accepted exception(s), all with a statement and a future expiry ✓`);
}
