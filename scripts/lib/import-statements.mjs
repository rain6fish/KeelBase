// SPDX-License-Identifier: Apache-2.0

/**
 * Statement-level extraction of the specifiers that pull a module in.
 *
 * A line-by-line scan misses the shape Prettier produces for a long import:
 *
 *     import {
 *       Foo,
 *     } from '../ai/foo';
 *
 * The `import` and the specifier sit on different lines, so a per-line regex sees neither a complete
 * statement nor the specifier. That is exactly the silent pass the governance-import ratchet must
 * not have. These patterns run over the whole source, so folding is irrelevant.
 *
 * 语句级抽取「把模块拉进来」的说明符。
 *
 * 逐行扫描会漏掉 Prettier 对长 import 折叠出来的形状：
 *
 *     import {
 *       Foo,
 *     } from '../ai/foo';
 *
 * `import` 与说明符不在同一行，逐行正则既看不到完整语句、也看不到说明符 —— 这正是治理 import
 * 棘轮不能有的静默放行。下面的模式在整份源码上跑，折行与否无关。
 */

/** Blank block comments and drop whole-line/trailing `//` comments. 抹掉块注释与行注释。 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

// Each pattern captures the specifier in group 2:
//   1. `import … from '…'` / `export … from '…'` (typed imports included)
//   2. bare `import '…'`
//   3. `import('…')` / `require('…')`
// `[^;'"]*?` keeps a match inside one statement: it cannot cross a semicolon or another string.
// 每个模式都在第 2 组给出说明符；`[^;'"]*?` 把匹配限制在一条语句内 —— 不跨分号、不跨另一个字符串。
const STATEMENT_PATTERNS = [
  /(^|[\n;])\s*(?:import|export)\s+(?:type\s+)?[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /(^|[\n;])\s*import\s*['"]([^'"]+)['"]/g,
  /(^|[\n;])[^;'"]*?\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Return `{ line, statement, specifier }` for every statement that pulls something in, in source
 * order. `line` is 1-based and points at the line that starts the statement.
 *
 * 返回每条「拉入某物」的语句 `{ line, statement, specifier }`，按源码顺序；`line` 从 1 起，
 * 指向语句开始的那一行。
 */
export function collectImportStatements(source) {
  const text = stripComments(source);
  const found = [];
  for (const pattern of STATEMENT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const statement = match[0].replace(/^[\n;]+/, '').trim().replace(/\s+/g, ' ');
      const leading = match[0].length - match[0].replace(/^[\n;]+/, '').length;
      const start = match.index + leading;
      const line = text.slice(0, start).split('\n').length;
      found.push({ line, statement, specifier: match[2] });
    }
  }
  return found.sort((a, b) => a.line - b.line);
}
