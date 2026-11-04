// SPDX-License-Identifier: Apache-2.0

/**
 * Regression tests for the delivery acceptance-form gate (node:test, zero dependencies).
 *
 * The gate exists so that "the acceptance form must carry a coverage statement" is checkable rather than
 * merely written down. These cases pin both directions: the real recipe passes, and each way of gutting
 * the form — deleting the statement, blanking a required field, leaving a placeholder choice, giving no
 * reason for `not-applicable`, failing to pin the registry — turns it red.
 *
 * Run: node --test scripts/check-delivery-coverage-statement.test.mjs
 *
 * 交付验收单门禁的回归测试（node:test，零依赖）。
 *
 * 这道门的意义是让「验收单必须带覆盖声明」**可检查**、而不只是**写下来**。下列用例把两个方向都钉住：
 * 真实 recipe 通过；而每一种掏空单子的方式 —— 删掉声明、清空必填项、停在占位选择、`不适用` 不给理由、
 * 取数来源没钉提交 —— 都会判红。
 *
 * 运行：node --test scripts/check-delivery-coverage-statement.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCoverageStatement } from './check-delivery-coverage-statement.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RECIPE = join(HERE, '..', 'docs/manual/delivery-recipe.md');
const recipe = readFileSync(RECIPE, 'utf8');

const BLOCKS = /<!--\s*delivery-acceptance-form:begin\s*-->([\s\S]*?)<!--\s*delivery-acceptance-form:end\s*-->/g;
const blockBodies = () =>
  [...recipe.matchAll(BLOCKS)].map((m) =>
    m[1]
      .split(/\r?\n/)
      .filter((line) => !/^\s*```/.test(line))
      .join('\n'),
  );

/** Replaces one field's value line, keeping the key and its display label.
 *  替换某个字段的取值行，保留键与其显示标签。 */
const fill = (body, key, value) =>
  body.replace(new RegExp(`^${key}([^:：]*)[:：].*$`, 'm'), `${key}$1: ${value}`);

const filledForm = () =>
  [
    ['evidence-path', '[乙]'],
    ['evidence-path-host-package', '[404]'],
    ['evidence-path-host-chain', '[200]'],
    ['evidence-path-ts-package', '[keelbase-audit-evidence/4]'],
    ['evidence-path-ts-verify', '[no ✗]'],
    ['host-write-not-in-same-transaction', '[not-applicable] basis: the host writes nothing here'],
    ['host-ai-path-not-governed', '[not-applicable] basis: the host runs no AI path of its own'],
    ['coverage-verdict', '[partial]'],
    [
      'coverage-registry',
      'coverage-gaps.ts @ 0123456789abcdef / coverage-gaps.json @ 0123456789abcdef',
    ],
  ].reduce((body, [key, value]) => fill(body, key, value), blockBodies()[0]);

const keysIn = (problems) => problems.map((p) => p.en);

test('the recipe carries the blank form in both language sections and passes', () => {
  const { ok, problems } = checkCoverageStatement(recipe);
  assert.equal(problems.length, 0, problems.map((p) => p.en).join('\n'));
  assert.equal(ok, true);
});

test('red when one language section loses its form', () => {
  const withoutOne = recipe.replace(
    /<!--\s*delivery-acceptance-form:begin\s*-->[\s\S]*?<!--\s*delivery-acceptance-form:end\s*-->/,
    '',
  );
  const { ok, problems } = checkCoverageStatement(withoutOne);
  assert.equal(ok, false);
  assert.ok(keysIn(problems).some((p) => p.includes('both language sections')));
});

test('red when a required coverage field is deleted', () => {
  const gutted = recipe.replace(/^host-ai-path-not-governed:.*$/gm, '');
  const { ok, problems } = checkCoverageStatement(gutted);
  assert.equal(ok, false);
  assert.ok(keysIn(problems).some((p) => p.includes('missing required field `host-ai-path-not-governed`')));
});

test('red when a required coverage field is blank', () => {
  const gutted = recipe.replace(/^host-write-not-in-same-transaction:.*$/gm, 'host-write-not-in-same-transaction:');
  const { ok, problems } = checkCoverageStatement(gutted);
  assert.equal(ok, false);
  assert.ok(keysIn(problems).some((p) => p.includes('`host-write-not-in-same-transaction` is blank')));
});

test('red when the prose no longer names the 乙 evidence endpoint or verifier', () => {
  const gutted = recipe.replaceAll('/api/v1/ai/governance/evidence-root', 'somewhere');
  const { ok, problems } = checkCoverageStatement(gutted);
  assert.equal(ok, false);
  assert.ok(keysIn(problems).some((p) => p.includes('/api/v1/ai/governance/evidence-root')));
});

test('a filled form passes the stricter form checks', () => {
  const { ok, problems } = checkCoverageStatement(filledForm(), { form: true });
  assert.equal(problems.length, 0, problems.map((p) => p.en).join('\n'));
  assert.equal(ok, true);
});

test('red when a filled form leaves a choice on its placeholder', () => {
  const form = fill(filledForm(), 'coverage-verdict', '[complete / partial / unknown]');
  const { ok, problems } = checkCoverageStatement(form, { form: true });
  assert.equal(ok, false);
  assert.ok(keysIn(problems).some((p) => p.includes('`coverage-verdict` still carries the placeholder')));
});

test('red when "not applicable" gives no reason', () => {
  const form = fill(filledForm(), 'host-ai-path-not-governed', '[not-applicable] basis:');
  const { ok, problems } = checkCoverageStatement(form, { form: true });
  assert.equal(ok, false);
  assert.ok(keysIn(problems).some((p) => p.includes('gives no basis')));
});

test('red when the registry does not pin a commit', () => {
  const form = fill(filledForm(), 'coverage-registry', 'coverage-gaps.ts @ <commit> / coverage-gaps.json @ <commit>');
  const { ok, problems } = checkCoverageStatement(form, { form: true });
  assert.equal(ok, false);
  assert.ok(keysIn(problems).some((p) => p.includes('does not pin a commit')));
});

test('red when evidence path is 甲 without a basis', () => {
  const form = fill(filledForm(), 'evidence-path', '[甲]');
  const { ok, problems } = checkCoverageStatement(form, { form: true });
  assert.equal(ok, false);
  assert.ok(keysIn(problems).some((p) => p.includes('甲 without a basis')));
});
