// SPDX-License-Identifier: Apache-2.0

/**
 * P0-9a ① — the generated list endpoint's `?q=` filter (node:test, zero dependency).
 * Run: node --test scripts/list-search.test.mjs
 *
 * What this pins down is not "the string is present" but the two rules that make the filter safe:
 * the columns matched are the ones the manifest advertises for search (one function, so the two
 * cannot drift), and the filter is multiplied *into* the row-level scope rather than replacing it.
 * A version that widened the query would leak other people's rows, and a version that searched a
 * different column set than the manifest publishes would be two answers to one question.
 *
 * P0-9a ① —— 生成物列表端点的 `?q=` 过滤（node:test，零依赖）。
 * 运行：node --test scripts/list-search.test.mjs
 *
 * 这里钉的不是「那串字在不在」，而是让这个过滤安全的**两条规则**：匹配的列就是清单为搜索公布的那些
 * （同一个函数，故两者不会漂），以及过滤是**相乘进**行级范围、不是替换它。放宽查询的版本会漏出别人的
 * 行；搜的列与清单公布的不是同一组的版本，则是同一个问题两个答案。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildContext, normalizeSpecFields, searchableFieldNames } from './generator/validate.mjs';
import { controllerSpecTemplate, controllerTemplate, serviceTemplate } from './generator/templates-backend.mjs';

const TITLE = { name: 'title', type: 'string' };
const NOTE = { name: 'note', type: 'text' };
const RATING = { name: 'rating', type: 'int' };
const STATUS = { name: 'status', type: 'enum', enum: ['a1', 'b2'] };

function ctxWith(fields, scope) {
  const ctx = buildContext('orders', '订单', normalizeSpecFields(fields));
  if (scope) ctx.scope = scope;
  return ctx;
}

test('可搜列 = string / text，按声明顺序；enum 不算 —— 与清单同一个函数', () => {
  const fields = normalizeSpecFields([TITLE, STATUS, NOTE, RATING]);
  assert.deepEqual(searchableFieldNames(fields), ['title', 'note']);
  // The constant in the generated service must come from that same function; a copy of the rule
  // here would be the drift this test exists to prevent.
  // 生成物里的常量必须出自同一个函数；在这里把规则抄一遍，正是本测要防的那种漂移。
  assert.match(
    serviceTemplate(ctxWith([TITLE, STATUS, NOTE, RATING])),
    /const ORDER_SEARCH_COLUMNS = \['title', 'note'\];/,
  );
});

test('没有 string / text 字段 → 不发射任何搜索接线（不产死代码）', () => {
  const svc = serviceTemplate(ctxWith([RATING, STATUS]));
  assert.ok(!svc.includes('SEARCH_COLUMNS'), '不得留下没人用的常量');
  assert.ok(!svc.includes('Like'), '不得 import 用不到的 Like');
  assert.ok(!svc.includes('q?: string'), '不得留下一个永远匹配不到的形参');
  // This path is character-for-character what it was before the feature — the pin is the point.
  // 这条路径与加该功能之前**一字不差** —— 钉住它才是要点。
  assert.match(svc, /where: \{ userId \}/);

  const ctrl = controllerTemplate(ctxWith([RATING, STATUS]));
  assert.ok(!ctrl.includes('Query'));
  assert.ok(!ctrl.includes('q?: string'));
});

test('无 scope：每条搜索分支各自带归属条件（命中逃不出本人）', () => {
  const svc = serviceTemplate(ctxWith([TITLE, NOTE]));
  assert.match(svc, /async findAll\(userId: number, q\?: string\)/);
  assert.match(
    svc,
    /ORDER_SEARCH_COLUMNS\.map\(\(column\) => \(\{ userId, \[column\]: Like\(`%\$\{keyword\}%`\) \}\)\)/,
    '每条分支都必须自带 userId —— 少一条就是一条能读到别人行的分支',
  );
  assert.match(svc, /: \{ userId \};/, '不传 q 时仍是原来那条「只回本人」');
});

test('有 scope：搜索分支是从范围分支长出来的（相乘，不是替换）', () => {
  const svc = serviceTemplate(ctxWith([TITLE], ['org']));
  assert.match(svc, /const scoped = \(buildScopeWhere<Record<string, unknown>>\(descriptor, 'Order'\) \?\? \[\]\) as any;/);
  // 空列表 = level-`all` 的形状（无行级约束）；那里也要过滤
  assert.match(svc, /\(scoped\.length > 0 \? scoped : \[\{\}\]\)\.flatMap\(\(arm\) =>/);
  assert.match(svc, /\(\{ \.\.\.arm, \[column\]: Like\(`%\$\{keyword\}%`\) \}\)/);
  assert.match(svc, /: scoped;/, '不传 q 时 `where` 就是范围本身，一个字不改');
});

test('控制器：把 q 交给 service，并按需 import Query', () => {
  const ctrl = controllerTemplate(ctxWith([TITLE]));
  assert.match(ctrl, /@Query\('q'\) q\?: string/);
  assert.match(ctrl, /findAll\(user\.sub, q\)/);
  assert.match(ctrl, /import \{[^}]*Query[^}]*\} from '@nestjs\/common';/);
});

test('生成物自带的 controller spec 跟着改 —— 否则它自己会红', () => {
  const spec = controllerSpecTemplate(ctxWith([TITLE]));
  assert.match(spec, /toHaveBeenCalledWith\(1, undefined\)/);
  assert.match(spec, /toHaveBeenCalledWith\(1, 'term'\)/);

  // 无 text 列的模块，那条用例与从前一字不差
  const plain = controllerSpecTemplate(ctxWith([RATING]));
  assert.match(plain, /toHaveBeenCalledWith\(1\);/);
  assert.ok(!plain.includes("'term'"));
});
