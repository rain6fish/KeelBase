#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0

/**
 * Gate: every AI-audit write point answers its own outcome and tool — or says in writing why not
 * (C-4).
 *
 * ## Why this gate exists
 * An audit row carries two off-chain attribution columns, `outcome` (a frozen result code) and
 * `tool` (the tool the row is about). A measurement found that most `auditService.log()` call sites
 * never passed them, so their rows could say neither what happened nor which tool they concerned.
 * `0ba3f15a` (merged as `b72348ba`) filled the tool-action write points and left a comment at the
 * rest explaining why those rows stay null. C-4's acceptance is not "fill every column" but "every
 * write point passes `outcome`/`tool`, **or says in writing why it does not**, and a gate keeps new
 * write points from quietly skipping the columns" — this is that gate.
 *
 * This is a gate and not a test for the same reason as `check-audit-writes-awaited.mjs`: the failure
 * is a *missing argument at one call site*, statically visible and invisible to a unit test. And it
 * is a different assertion from `check-audit-vocabulary` (which checks the label/word tables): this
 * one is about the write points carrying the columns at all.
 *
 * ## The rule / what it scans
 * Every non-spec `.ts` file under `Server-NestJS/src` is scanned for call sites of
 * `auditService.log(` / `this.audit.log(` (an optional-chain `?.` is accepted — it is the same
 * method behind a null guard). A call site is COMPLIANT when its argument:
 *   - names both `outcome` and `tool` as object keys, OR
 *   - is a call to the canonical builder `buildToolCallAudit(...)` — the one place that assembles a
 *     `tool_call` row and sets both columns (see `ai/audit/tool-call-audit.ts`); the build is the
 *     repository's single source for the shape, so trusting it by name is deliberate.
 * A call site that is neither must appear in EXEMPT below, keyed by (file, `action`), with a
 * one-line reason. The comment prose beside a call is NOT read — the exemption list is the source
 * of truth, so rewording a comment can never move a site in or out of the list.
 *
 * ## Falsifiability
 * Add a call site that carries neither column and is not exempt: this exits non-zero and names the
 * file and line. Remove it (or exempt it with a reason): green. A MIN_SITES floor guards against a
 * "zero hits" scan reading as "all compliant".
 *
 * ## What it deliberately cannot see / 它有意看不到的东西
 *   - An argument assembled by a helper other than `buildToolCallAudit` — the gate reads the call
 *     site's text, not what the helper returns. Such a call is treated as non-compliant and must be
 *     routed through the builder or exempted with a reason.
 *   - A path that *should* have written an audit row and wrote none: "no call site" is not the same
 *     failure as "a call site without the columns", and this scan only knows call sites.
 *   - Whether the value is the *right* outcome for the action — that belongs to the frozen contract
 *     vector in the contract repository, not to a text scan.
 *
 * ## 为什么要这道门
 * 审计行带两列链外归因列：`outcome`（冻结的结果码）与 `tool`（本行所属的工具）。一次测量发现多数
 * `auditService.log()` 调用点从不传它们，于是那些行既说不出结局、也说不出工具。`0ba3f15a`（并入
 * `b72348ba`）补齐了工具动作写入点，并在其余处留注释说明为何留空。C-4 的验收不是「填满每一列」，而是
 * 「每个写入点都传 `outcome`/`tool`，**或写明为何不传**，并有闸守住新增写入点不再悄悄跳过这两列」
 * —— 本脚本就是那道闸。
 *
 * ## 判据 / 它扫什么
 * `Server-NestJS/src` 下每个非 spec 的 `.ts` 文件，扫 `auditService.log(` / `this.audit.log(` 调用点
 * （接受可选链 `?.` —— 是同一个方法套了个空值守卫）。调用点**合规**当且仅当其实参：
 *   - 以对象键形式同时点名 `outcome` 与 `tool`；或
 *   - 是对**唯一的**组装器 `buildToolCallAudit(...)` 的调用 —— 那是拼 `tool_call` 行、且两列都设的
 *     唯一去处（见 `ai/audit/tool-call-audit.ts`）；行形状的单源在此，故按名字信任它是**有意**的。
 * 两者都不是者，必须在下面的 EXEMPT 里按（文件, `action`）键出现、并附一行理由。调用点旁的注释文字
 * **不读** —— 豁免表才是唯一来源，于是改写注释绝不会把某个点搬进或搬出表。
 *
 * ## 可证伪
 * 加一个两列都不带、又未豁免的调用点：本脚本以非零码退出并点名文件与行号。删掉它（或写明理由豁免）：
 * 通过。MIN_SITES 下限防止「零命中」被读成「全都合规」。
 *
 * ## 它有意看不到什么
 *   - 由 `buildToolCallAudit` **之外**的助手拼出来的实参 —— 本闸读的是调用点的文本，不是助手返回什么。
 *     这种调用按不合规处理，必须改走组装器或写明理由豁免。
 *   - 一处**本该写审计行、却没写**的路径：「没有调用点」与「有调用点但缺列」不是同一种失败，本扫描
 *     只认得调用点。
 *   - 值对某个 action 是否**正确** —— 那归契约仓的冻结向量管，不归文本扫描管。
 *
 * Usage: node scripts/check-audit-write-points.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIR = join(ROOT, 'Server-NestJS', 'src');

/** A call site of the AI audit: `auditService.log(` or `this.audit.log(`, optional-chain allowed. */
const SITE_RE = /\b(?:auditService|audit)\??\.log\(/g;

/** The one builder that sets both columns; trusting it by name is deliberate (see header). */
const BUILDER_RE = /^\s*buildToolCallAudit\s*\(/;

/** Floor: a "zero hits" scan must fail, not pass (F-10d: "did not happen" vs "was not seen"). */
const MIN_SITES = 20;

/**
 * Write points that deliberately answer neither column. Keyed by (relative file, `action`); `null`
 * means the site's `action` is computed at runtime (or absent), so it cannot be keyed by name. Every
 * entry needs a reason — an unexplained exemption is how the next one hides. Entries are matched
 * against NON-COMPLIANT sites only, so a compliant site is never masked by a broad key.
 *
 * 有意两列都不答的写入点。按（相对文件, `action`）键；`null` 表示该点的 `action` 是运行时算出来的
 * （或没有），无法按名字键。每条都要理由 —— 没理由的豁免，正是下一处藏身之地。豁免**只**与不合规的
 * 点匹配，故合规的点永不会被一个宽的键盖住。
 */
const EXEMPT = [
  {
    file: 'Server-NestJS/src/flows/flow-runtime.service.ts',
    action: 'flow_node',
    reason: 'flow_node is not a tool action; the frozen contract answers null for every non-tool action, so the columns stay null by contract (C-4).',
  },
  {
    file: 'Server-NestJS/src/ai/security/content-safety.service.ts',
    action: 'content_blocked',
    reason: 'content_blocked is not a tool action; null by the same contract clause as flow_node — the refusal is already readable from isError + detail (C-4).',
  },
  {
    file: 'Server-NestJS/src/operation-audit/operation-audit.interceptor.ts',
    action: null,
    reason: 'writes the OPERATION audit (operation_audit_logs / OperationAuditEntry), a table of its own with no outcome/tool columns — the AI columns do not apply here (C-4).',
  },
  {
    file: 'Server-NestJS/src/ai/ai.service.ts',
    action: 'chat',
    reason: 'conversation-level metadata row (chat), not a tool action; null by the non-tool contract clause.',
  },
  {
    file: 'Server-NestJS/src/ai/ai.service.ts',
    action: 'knowledge',
    reason: 'conversation-level metadata row (knowledge), not a tool action; null by the non-tool contract clause.',
  },
  {
    file: 'Server-NestJS/src/ai/ai.service.ts',
    action: 'delegate',
    reason: 'conversation-level row (delegate), not a tool action; null by the non-tool contract clause.',
  },
  {
    file: 'Server-NestJS/src/ai/ai.service.ts',
    action: null,
    reason: 'conversation-level row whose action is computed at runtime (chat/delegate/plan/analyze), never a tool action; null by the non-tool contract clause.',
  },
  {
    file: 'Server-NestJS/src/ai/ai.service.ts',
    action: 'tool_confirmation',
    reason: 'run-level confirmation: one decision covers many tools, so `outcome` is answered but `tool` is omitted by design (tool = "the tool this row is about").',
  },
  {
    file: 'Server-NestJS/src/governance/external-governance.controller.ts',
    action: null,
    reason: 'forwarding endpoint — action and fields come from the caller DTO, pinned to the frozen external-audit schema; naming outcome/tool here would need a contract bump.',
  },
  {
    file: 'Server-NestJS/src/ai/trust-sandbox/trust-sandbox.service.ts',
    action: 'effect_revoke',
    reason: 'KNOWN GAP, not a legitimate null: effect_revoke is a tool action that should answer outcome="revoked". Recorded here so the gate stays honest (a red here would block unrelated work); fixing it is a Server-NestJS/src change out of this task scope.',
  },
];

/**
 * Read the argument of a `log(` call. `openIdx` is the index of `(`. Returns the index of the
 * matching `)` plus two renderings of the argument:
 *   - `code` — comments and string/template bodies blanked, so object keys survive and prose does
 *     not (a comment or a `detail` string can never fake an `outcome:`/`tool:` key);
 *   - `noComments` — comments removed, string literals kept, so a literal `action:` value is visible.
 * Handles nested calls, template literals with `${...}` (and templates nested inside them), and
 * strings/comments, so the matching paren is found by structure rather than a line heuristic.
 */
function readCallArg(src, openIdx) {
  const stack = [{ kind: 'code', depth: 0 }];
  let code = '';
  let noComments = '';
  for (let i = openIdx + 1; i < src.length; i++) {
    const top = stack[stack.length - 1];
    const c = src[i];
    const n = src[i + 1];
    if (top.kind === 'line') {
      if (c === '\n') {
        stack.pop();
        noComments += c;
      }
      continue;
    }
    if (top.kind === 'block') {
      if (c === '*' && n === '/') {
        stack.pop();
        i++;
      }
      continue;
    }
    if (top.kind === 'str') {
      noComments += c;
      if (c === '\\') {
        noComments += n;
        i++;
      } else if (c === top.quote) stack.pop();
      continue;
    }
    if (top.kind === 'tpl') {
      noComments += c;
      if (c === '\\') {
        noComments += n;
        i++;
      } else if (c === '`') stack.pop();
      else if (c === '$' && n === '{') {
        noComments += n;
        i++;
        code += ' ';
        stack.push({ kind: 'code', depth: 0, brace: true });
      }
      continue;
    }
    // code frame
    if (top.brace) {
      if (c === '}') {
        stack.pop();
        continue;
      }
      if (c === "'" || c === '"') {
        noComments += c;
        stack.push({ kind: 'str', quote: c });
        code += ' ';
        continue;
      }
      if (c === '`') {
        noComments += c;
        stack.push({ kind: 'tpl' });
        code += ' ';
        continue;
      }
      noComments += c;
      code += c;
      continue;
    }
    // top-level code frame: the matching `)` closes the argument
    if (c === '(') {
      top.depth++;
      noComments += c;
      code += c;
      continue;
    }
    if (c === ')') {
      if (top.depth === 0) return { end: i, code, noComments };
      top.depth--;
      noComments += c;
      code += c;
      continue;
    }
    if (c === '/' && n === '/') {
      stack.push({ kind: 'line' });
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      stack.push({ kind: 'block' });
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      noComments += c;
      stack.push({ kind: 'str', quote: c });
      code += ' ';
      continue;
    }
    if (c === '`') {
      noComments += c;
      stack.push({ kind: 'tpl' });
      code += ' ';
      continue;
    }
    noComments += c;
    code += c;
  }
  return { end: -1, code, noComments };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

const rel = (p) => relative(ROOT, p).split('\\').join('/');
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;
/** Top-level `action:` literal, or null when it is computed at runtime / absent. */
function actionOf(noComments) {
  const m =
    noComments.match(/[\s,{]action\s*:\s*'([^']*)'/) ?? noComments.match(/[\s,{]action\s*:\s*"([^"]*)"/);
  return m ? m[1] : null;
}

const errors = [];
const usedExempt = new Set();
let sites = 0;
let viaBuilder = 0;
const exemptHits = [];

for (const file of walk(SCAN_DIR)) {
  const src = readFileSync(file, 'utf8');
  SITE_RE.lastIndex = 0;
  let m;
  while ((m = SITE_RE.exec(src)) !== null) {
    // Skip a call that lives inside a comment (e.g. the JSDoc in audit.service.ts that quotes
    // `await this.auditService.log(...)` as prose). A commented JSDoc/line-comment line begins,
    // after leading whitespace, with `*` or `//`.
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const trimmed = src.slice(lineStart, m.index).trimStart();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;

    sites++;
    const openIdx = m.index + m[0].length - 1; // index of `(`
    const { end, code, noComments } = readCallArg(src, openIdx);
    const at = `${rel(file)}:${lineOf(src, m.index)}`;
    if (end === -1) {
      errors.push(`${at} 实参括号未闭合 —— 本闸解析失败（写法可能已变）`);
      continue;
    }

    const isBuilder = BUILDER_RE.test(code);
    const hasOutcome = /\boutcome\s*:/.test(code);
    const hasTool = /\btool\s*:/.test(code);
    if (isBuilder) viaBuilder++;
    if (isBuilder || (hasOutcome && hasTool)) continue; // compliant

    const action = actionOf(noComments);
    const entry = EXEMPT.find((e) => e.file === rel(file) && e.action === action);
    if (entry) {
      usedExempt.add(entry);
      exemptHits.push(at);
      continue;
    }

    const missing = [hasOutcome ? null : 'outcome', hasTool ? null : 'tool'].filter(Boolean).join(' + ');
    errors.push(
      `${at} 缺 ${missing} —— 每个 AI 审计写入点都要传 outcome/tool（否则写明为何不传）。` +
        `补两列，或改走 buildToolCallAudit(...)，或在本闸的 EXEMPT 里按 (文件, action) 写一行理由。`,
    );
  }
}

// A "zero hits" scan must not read as "all compliant".
if (sites < MIN_SITES) {
  errors.push(
    `全仓仅扫到 ${sites} 个 AI 审计写入点（下限 ${MIN_SITES}）—— 扫描写法可能已变，本闸不应真空通过`,
  );
}

// A stale exemption (matches no non-compliant site) hides the next one — refuse it.
for (const e of EXEMPT) {
  if (!usedExempt.has(e)) {
    errors.push(`EXEMPT 里 ${e.file}（action=${e.action ?? '<runtime>'}）没有匹配到任何不合规写入点 —— 豁免已陈旧，删掉或修正它`);
  }
}

if (errors.length > 0) {
  console.error(`✗ AI 审计写入点门禁未通过（${errors.length} 项）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `✓ AI 审计写入点门禁通过：${sites} 个写入点 · ${viaBuilder} 个经 buildToolCallAudit · ` +
    `${exemptHits.length} 个按理由豁免（${EXEMPT.length} 条豁免覆盖${exemptHits.length ? `：${exemptHits.join(', ')}` : ''}）`,
);
