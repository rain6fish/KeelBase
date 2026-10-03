// SPDX-License-Identifier: Apache-2.0

import * as fs from 'fs';
import * as path from 'path';

/**
 * A column default must not re-write a vocabulary its own file already declares.
 *
 * Stage-4 M4 measured twelve `@Column({ default: 'x' })` sitting in entity files that declared `x` as
 * an element of an `as const` table (or an enum member) a few lines above: the single source was
 * there and simply was not fed to the end. The tool-vocabulary gate guards the AI tool schema only,
 * so a table change that left a column default behind was caught by nothing.
 *
 * Those twelve now go through a typed module constant, which makes removing the value from the table
 * a compile error. This gate covers what the type cannot: it keeps a *new* entity from writing the
 * literal again, by scanning the sources rather than the runtime metadata.
 *
 * 列默认值不得重抄**同一文件**已经声明过的词汇。
 *
 * 阶段 4 M4 实测出 12 处 `@Column({ default: 'x' })`，其所在的实体文件在几行之上就把 `x` 声明成了
 * `as const` 词表的元素（或枚举成员）—— 单源就在那里，只是没被喂到底。工具词汇闸只守 AI 工具 schema，
 * 因此「词表变了、列默认值没跟上」无人报错。
 *
 * 那 12 处现已改走一个带元素类型的模块常量：从词表里删掉该值会**编译不过**。本闸补类型管不到的一面 ——
 * 它扫源码而非运行时元数据，防止**新写**的实体再退回字面量。
 */

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** String values the file itself declares: `as const` table elements, and bare enum members. */
function declaredVocabulary(clean: string): Set<string> {
  const vocabulary = new Set<string>();
  for (const table of clean.matchAll(/=\s*\[([^\]]*)\]\s*as const/g)) {
    for (const element of table[1].matchAll(/'([^']*)'/g)) vocabulary.add(element[1]);
  }
  // Enum members (`USER = 'user',`) — a line that is exactly `IDENT = '<value>',?`.
  for (const member of clean.matchAll(/^[ \t]*[A-Za-z_$][\w$]*[ \t]*=[ \t]*'([^']*)'[ \t]*,?[ \t]*$/gm)) {
    vocabulary.add(member[1]);
  }
  return vocabulary;
}

function entityFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) entityFiles(full, found);
    else if (entry.name.endsWith('.entity.ts')) found.push(full);
  }
  return found;
}

const SRC = path.join(__dirname, '..');

describe('entity column defaults reference their file vocabulary instead of re-writing it', () => {
  const files = entityFiles(SRC);

  it('scans the entity sources (a silent empty scan would make this gate worthless)', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('no string column default duplicates an `as const` element or enum member of the same file', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const clean = stripComments(fs.readFileSync(file, 'utf8'));
      const vocabulary = declaredVocabulary(clean);
      for (const match of clean.matchAll(/default:\s*'([^']*)'/g)) {
        if (vocabulary.has(match[1])) {
          offenders.push(`${path.relative(SRC, file).split(path.sep).join('/')} -> default: '${match[1]}'`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
