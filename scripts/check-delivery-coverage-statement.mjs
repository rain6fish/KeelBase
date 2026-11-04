#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * A delivery acceptance form must carry a coverage statement, and this gate reads the form itself — not
 * a paragraph about it.
 *
 * Plan item `W2.3` says every delivery acceptance form must state its coverage: at least
 * `host-write-not-in-same-transaction`, and `host-ai-path-not-governed` whenever a host-owned AI path is
 * in play. It also carries `JV-64`'s standing ruling — **乙** — under which the complete evidence package
 * is taken from the TypeScript governance console (`GET /api/v1/ai/governance/evidence-root/<type>/<id>`,
 * `keelbase-audit-evidence/4`, verified offline by `verify-evidence.mjs`) while the host keeps only its
 * audit chain. A rule nobody can check is a wish, so this gate parses the blank form in
 * `docs/manual/delivery-recipe.md` §11.2 by its field keys — never by matching the prose around it — and
 * fails when the coverage-statement section or a required field is missing, blank, left on its
 * placeholder, or outside the field's allowed values.
 *
 * `--form <path>` applies the same checks, plus the stricter ones a filled copy must pass: each choice is
 * narrowed to one value, a `not-applicable` must state its reason, and the source registry must pin a
 * commit. That is the check to run before a form is handed back.
 *
 * 交付验收单必须带覆盖声明，而这道门读**单子本身** —— 不读「关于单子的一段话」。
 *
 * 计划件 `W2.3` 要求每张交付验收单都声明自己的覆盖：至少 `host-write-not-in-same-transaction`，涉及宿主自有
 * AI 路径时还要 `host-ai-path-not-governed`。它同时承载 `JV-64` 的常设裁定 **乙** —— 完整证据包从 TypeScript
 * 治理台取（`GET /api/v1/ai/governance/evidence-root/<type>/<id>`，`keelbase-audit-evidence/4`，
 * 由 `verify-evidence.mjs` 离线核验），宿主只保留审计链。没人能核的规则只是愿望，故本门按**字段键**解析
 * `docs/manual/delivery-recipe.md` §11.2 的空白单 —— 绝不匹配周围的散文 —— 并在覆盖声明节或任一必填项缺失、
 * 留空、停在占位、或取值不在该字段允许集合内时判红。
 *
 * `--form <path>` 对**填好的**单子跑同一套检查，并加上更严的几条：每个选择须收敛为一个值、`不适用` 必须写理由、
 * 取数来源必须钉到提交。交回单子之前跑这一条。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECIPE = path.join(ROOT, 'docs/manual/delivery-recipe.md');

const BLOCK = /<!--\s*delivery-acceptance-form:begin\s*-->([\s\S]*?)<!--\s*delivery-acceptance-form:end\s*-->/g;

/** One `key label: value` line. The label is display text only; the key is what this gate knows.
 *  一行 `key label: value`。标签只是显示文本；本门认识的是键。 */
const LINE = /^\s*([a-z][a-z0-9-]+)(?:\s*[^:：]*)?[:：]\s*(.*)$/;

/**
 * Required fields and the values they accept. `contains` switches a field from exact-segment matching to
 * substring matching — needed only where a value itself carries a separator (`keelbase-audit-evidence/4`)
 * or a space (`no ✗`). `needsBasisWhen` names the choices that are only acceptable with a stated reason.
 *
 * 必填字段与其允许取值。`contains` 把字段从「按段精确匹配」切到「子串匹配」—— 只在取值本身带分隔符
 * （`keelbase-audit-evidence/4`）或空格（`no ✗`）时才需要。`needsBasisWhen` 列出必须写明理由才可用的选择。
 */
const FIELDS = [
  { key: 'evidence-path', values: ['乙', '甲'] },
  { key: 'evidence-path-host-package', values: ['404', '200+code:404', 'unreachable', '不可达'] },
  { key: 'evidence-path-host-chain', values: ['200', '401', '403', 'other', '其它'] },
  {
    key: 'evidence-path-ts-package',
    values: ['keelbase-audit-evidence/4', 'unreachable', '不可达'],
    contains: true,
  },
  {
    key: 'evidence-path-ts-verify',
    values: ['no ✗', 'has ✗', 'not run', '无 ✗', '有 ✗', '未跑'],
    contains: true,
  },
  {
    key: 'host-write-not-in-same-transaction',
    values: ['applicable', 'not-applicable', 'unknown', '适用', '不适用', '未知'],
    needsBasisWhen: ['not-applicable', '不适用'],
  },
  {
    key: 'host-ai-path-not-governed',
    values: ['applicable', 'not-applicable', 'unknown', '适用', '不适用', '未知'],
    needsBasisWhen: ['not-applicable', '不适用'],
  },
  { key: 'coverage-verdict', values: ['complete', 'partial', 'unknown'] },
];

const REGISTRY_KEY = 'coverage-registry';
const CONDITIONAL_KEY = 'evidence-path-basis';

/** Identifiers the prose must name for `JV-64` 乙 to be actionable, not merely asserted.
 *  正文必须点名的标识符 —— 乙案要能照着做，而不只是被声称。 */
const REQUIRED_IDENTIFIERS = [
  '/api/v1/ai/governance/evidence-root',
  'verify-evidence.mjs',
  'coverage-gaps.ts',
];

const segments = (value) => value.split(/[/,、|[\s\]]+/).filter(Boolean);

const matches = (value, field) =>
  field.contains
    ? field.values.filter((v) => value.includes(v))
    : field.values.filter((v) => segments(value).includes(v));

/** The text after `basis:` / `依据:` on the same line — empty means no reason was given.
 *  同一行 `basis:` / `依据:` 之后的文本 —— 为空即表示没给理由。 */
const basisText = (value) => {
  const m = /(?:basis|依据)\s*[:：]\s*(.*)$/i.exec(value);
  return m ? m[1].trim() : '';
};

const skipFence = (body) =>
  body
    .split(/\r?\n/)
    .filter((line) => !/^\s*```/.test(line))
    .join('\n');

const problem = (en, zh) => ({ en, zh });

/**
 * Checks one form body (or the whole document, in doc mode) and returns every problem found. Pure: no
 * filesystem, no process — the CLI and the tests read the same code path.
 *
 * 检查一份表单正文（文档模式下检查整篇文档），返回发现的全部问题。纯函数：不碰文件系统、不读进程 ——
 * CLI 与测试走同一条代码路径。
 */
export function checkCoverageStatement(text, { form = false } = {}) {
  const problems = [];

  if (!form) {
    for (const id of REQUIRED_IDENTIFIERS) {
      if (!text.includes(id)) {
        problems.push(
          problem(
            `the document no longer names \`${id}\` — the 乙 evidence path must point at a real endpoint or artifact`,
            `文档里已不再出现 \`${id}\` —— 乙案的取证路径必须指向真实端点或产物`,
          ),
        );
      }
    }
  }

  const blocks = [...text.matchAll(BLOCK)].map((m) => skipFence(m[1]));
  const bodies = form ? (blocks.length > 0 ? blocks : [skipFence(text)]) : blocks;

  if (form) {
    if (bodies.length !== 1) {
      problems.push(
        problem(
          `--form expects exactly one form; found ${bodies.length} sentinel-delimited blocks`,
          `--form 只接受一张单子；实际找到 ${bodies.length} 个哨兵包裹的块`,
        ),
      );
    }
  } else if (bodies.length < 2) {
    problems.push(
      problem(
        `the blank form must appear in both language sections; found ${bodies.length} block(s)`,
        `空白单必须在中英两个语节里各出现一次；实际找到 ${bodies.length} 个块`,
      ),
    );
    if (bodies.length === 0) return { ok: false, problems };
  }

  bodies.forEach((body, index) => {
    const where = form ? 'form' : `form #${index + 1}`;
    const whereZh = form ? '表单' : `表单 #${index + 1}`;
    const values = new Map();
    for (const line of body.split(/\r?\n/)) {
      const m = LINE.exec(line);
      if (m && !values.has(m[1])) values.set(m[1], m[2]);
    }

    for (const field of FIELDS) {
      const value = values.get(field.key);
      if (value === undefined) {
        problems.push(
          problem(
            `${where} · missing required field \`${field.key}\``,
            `${whereZh} · 缺少必填项 \`${field.key}\``,
          ),
        );
        continue;
      }
      if (value.trim() === '') {
        problems.push(
          problem(
            `${where} · \`${field.key}\` is blank`,
            `${whereZh} · \`${field.key}\` 留空`,
          ),
        );
        continue;
      }
      const found = matches(value, field);
      if (found.length === 0) {
        problems.push(
          problem(
            `${where} · \`${field.key}\` has no allowed value (allowed: ${field.values.join(' / ')})`,
            `${whereZh} · \`${field.key}\` 没有允许取值（允许：${field.values.join(' / ')}）`,
          ),
        );
        continue;
      }
      if (form && found.length > 1) {
        problems.push(
          problem(
            `${where} · \`${field.key}\` still carries the placeholder (${found.join(' / ')}); choose one`,
            `${whereZh} · \`${field.key}\` 仍停在占位（${found.join(' / ')}）；请选定一个`,
          ),
        );
        continue;
      }
      if (
        form &&
        field.needsBasisWhen &&
        field.needsBasisWhen.includes(found[0]) &&
        basisText(value) === ''
      ) {
        problems.push(
          problem(
            `${where} · \`${field.key}\` is "${found[0]}" but gives no basis`,
            `${whereZh} · \`${field.key}\` 取「${found[0]}」却未给依据`,
          ),
        );
      }
    }

    const registry = values.get(REGISTRY_KEY);
    if (registry === undefined) {
      problems.push(
        problem(
          `${where} · missing required field \`${REGISTRY_KEY}\``,
          `${whereZh} · 缺少必填项 \`${REGISTRY_KEY}\``,
        ),
      );
    } else if (form && !/@\s*[0-9a-f]{7,40}\b/i.test(registry)) {
      problems.push(
        problem(
          `${where} · \`${REGISTRY_KEY}\` does not pin a commit (write \`… @ <sha>\`)`,
          `${whereZh} · \`${REGISTRY_KEY}\` 没有钉到提交（写成 \`… @ <sha>\`）`,
        ),
      );
    } else if (!form && !registry.includes('@')) {
      problems.push(
        problem(
          `${where} · \`${REGISTRY_KEY}\` has no pinned source slot`,
          `${whereZh} · \`${REGISTRY_KEY}\` 没有钉住的来源位`,
        ),
      );
    }

    if (form) {
      const chosen = matches(values.get('evidence-path') ?? '', FIELDS[0]);
      if (chosen[0] === '甲' && (values.get(CONDITIONAL_KEY) ?? '').trim() === '') {
        problems.push(
          problem(
            `${where} · evidence path is 甲 without a basis — name the requirement and the host endpoint`,
            `${whereZh} · 取证路径写了甲却没有依据 —— 请写明该要求与宿主端点`,
          ),
        );
      }
    }
  });

  return { ok: problems.length === 0, problems };
}

function main() {
  const args = process.argv.slice(2);
  const take = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
  };

  const formArg = args.includes('--form') ? take('--form') : null;
  const docArg = args.includes('--doc') ? take('--doc') : null;
  const form = formArg !== null;
  const file = form ? formArg : (docArg ?? RECIPE);

  if (!file) {
    console.error('用法 / usage: node scripts/check-delivery-coverage-statement.mjs [--doc <file>] | --form <file>');
    process.exit(2);
  }

  const text = fs.readFileSync(path.resolve(file), 'utf8');
  const { ok, problems } = checkCoverageStatement(text, { form });

  if (!ok) {
    console.error(`\n[delivery-coverage] ✗ ${file}`);
    for (const p of problems) {
      console.error(`  ✗ ${p.en}`);
      console.error(`    ${p.zh}`);
    }
    console.error(
      '\nAn acceptance form without its coverage statement is not a completed delivery.\n' +
        '验收单读不到覆盖声明，就不算交付完成。\n',
    );
    process.exit(1);
  }

  console.log('[delivery-coverage] ✓ the acceptance form carries its coverage statement');
  console.log(`[delivery-coverage] ✓ 验收单覆盖声明齐全（${file}）`);
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main();
