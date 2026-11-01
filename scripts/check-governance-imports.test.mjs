// SPDX-License-Identifier: Apache-2.0

import test from 'node:test';
import assert from 'node:assert/strict';
import { collectImportStatements } from './lib/import-statements.mjs';

test('finds a single-line relative import', () => {
  const found = collectImportStatements(`import { Foo } from '../ai/foo';\n`);
  assert.equal(found.length, 1);
  assert.equal(found[0].specifier, '../ai/foo');
  assert.equal(found[0].line, 1);
});

test('finds a folded multi-line import — the shape the line scan used to pass silently', () => {
  const found = collectImportStatements(`import {\n  Foo,\n  Bar,\n} from '../ai/foo';\n`);
  assert.equal(found.length, 1);
  assert.equal(found[0].specifier, '../ai/foo');
  assert.equal(found[0].line, 1);
});

test('finds export-from, bare import, dynamic import and require', () => {
  const found = collectImportStatements(
    [
      `export { Foo } from '../ai/foo';`,
      `import './side-effect';`,
      `const mod = await import('../ai/dynamic');`,
      `const legacy = require('../ai/legacy');`,
    ].join('\n'),
  );
  const specifiers = new Set(found.map((entry) => entry.specifier));
  assert.ok(specifiers.has('../ai/foo'));
  assert.ok(specifiers.has('./side-effect'));
  assert.ok(specifiers.has('../ai/dynamic'));
  assert.ok(specifiers.has('../ai/legacy'));
});

test('ignores commented-out imports', () => {
  const found = collectImportStatements(
    [
      `// import { X } from '../ai/commented';`,
      `/* import { Y } from '../ai/blocked'; */`,
      `import { Z } from './real';`,
    ].join('\n'),
  );
  assert.deepEqual(found.map((entry) => entry.specifier), ['./real']);
});

test('does not pair an unrelated export with a later from-clause', () => {
  const found = collectImportStatements(
    [`export const answer = 42;`, `const text = 'x';`, `import { Z } from '../ai/z';`].join('\n'),
  );
  assert.deepEqual(found.map((entry) => entry.specifier), ['../ai/z']);
});

test('reports the line the statement starts on', () => {
  const found = collectImportStatements([`const a = 1;`, ``, `import {`, `  Foo,`, `} from '../ai/foo';`].join('\n'));
  assert.equal(found[0].line, 3);
});
