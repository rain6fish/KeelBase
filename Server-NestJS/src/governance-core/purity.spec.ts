// SPDX-License-Identifier: Apache-2.0

/**
 * Purity guard for `governance-core/`.
 *
 * The five helpers in this directory (`payload`, `cache-keys`, `coverage-gaps`, `revoke-status`,
 * `revoke-staleness`) are shared by the AI path, the audit path and the standalone governance
 * runtime, so they must stay free of runtime coupling: no Nest/DI, no `Repository` or entity, no
 * filesystem/network/process. `cache-keys` is allowed exactly one dependency — `typeorm` — and only
 * as `import type`, which TypeScript erases, leaving no runtime edge at all.
 *
 * Nothing enforces that by construction. Writing `import { DataSource } from 'typeorm'` (value
 * instead of type) still boots in-process and every existing test stays green; the coupling only
 * shows up as a wiring problem later. This spec is what notices: it scans every source file in the
 * directory (specs excluded — they may read fixtures) and fails with `file:line — reason`, naming
 * the offending line rather than describing it.
 *
 * 共享模块 `governance-core/` 的纯度守卫。
 *
 * 这里的五个助手（`payload` · `cache-keys` · `coverage-gaps` · `revoke-status` ·
 * `revoke-staleness`）被 AI 路径、审计路径与独立治理运行时共用，因此必须与运行时解耦：
 * 不碰 Nest/DI、不碰 `Repository` 或实体、不碰文件/网络/子进程。`cache-keys` 只允许一个依赖
 * —— `typeorm` —— 且只能是 `import type`（编译期擦除，运行时不留下任何边）。
 *
 * 这一点没有构造上的强制：把 `import type` 写成 `import { DataSource }`（值导入）照样能在
 * 进程内启动，既有测试也全绿；耦合只会在之后的接线上暴露。本 spec 就是那个会发现它的东西：
 * 它扫描目录下的每个源码文件（排除 spec —— 测试允许读夹具），失败时报 `文件:行 — 原因`，
 * 指名到行而不是泛泛一句。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MODULE_DIR = __dirname;

/** The modules this guard exists for; a silent empty scan must not read as green. */
const REQUIRED_FILES = [
  'cache-keys.ts',
  'coverage-gaps.ts',
  'payload.ts',
  'revoke-staleness.ts',
  'revoke-status.ts',
];

const SOURCE_FILES = readdirSync(MODULE_DIR)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
  .sort();

interface ImportRef {
  /** 1-based line where the statement starts. */
  line: number;
  specifier: string;
  /** `import type` / `export type` / every named binding prefixed with `type`. */
  typeOnly: boolean;
  /** The statement with whitespace collapsed, for the failure message. */
  statement: string;
}

/**
 * `import type { X } from` and `import { type X } from` are erased at compile time.
 * A default or namespace binding before the braces is a value import.
 */
function isTypeOnlyClause(clause: string): boolean {
  const text = clause.trim();
  if (/^type\b/.test(text)) return true;
  const braces = text.match(/\{([\s\S]*)\}$/);
  if (!braces || braces.index === undefined) return false;
  if (text.slice(0, braces.index).replace(/,\s*$/, '').trim().length > 0) return false;
  const bindings = braces[1]
    .split(',')
    .map((binding) => binding.trim())
    .filter(Boolean);
  return bindings.length > 0 && bindings.every((binding) => /^type\s+/.test(binding));
}

/**
 * Why `specifier` is not allowed here, or `null` when it is. Only two shapes pass:
 * a relative import that stays inside this directory, and a type-only `typeorm` import.
 *
 * 不允许时给出原因，允许时为 `null`。只有两种形态放行：留在本目录内的相对 import，
 * 以及仅类型导入的 `typeorm`。
 */
function violationReason(specifier: string, typeOnly: boolean): string | null {
  if (specifier.startsWith('./')) {
    return specifier.split('/').includes('..')
      ? 'relative import leaves the directory'
      : null;
  }
  if (specifier === 'typeorm') {
    return typeOnly
      ? null
      : 'runtime dependency on typeorm; use `import type` (erased at compile time)';
  }
  if (specifier.startsWith('@nestjs/')) {
    return 'Nest/DI runtime dependency';
  }
  if (/^node:(fs|net|http|https|child_process)(\/|$)/.test(specifier)) {
    return 'filesystem/network/process runtime dependency';
  }
  if (/(^|\/)ai(\/|$)/.test(specifier)) {
    return 'import of the AI runtime module';
  }
  if (/repositor|entit/i.test(specifier)) {
    return 'Repository/entity dependency';
  }
  if (specifier.startsWith('..')) {
    return 'relative import leaves the directory';
  }
  // No Node builtin is needed today. If a pure type/constant one ever is, add it here by name
  // rather than widening this fallback.
  // 当前不需要任何 Node 内置模块。将来若确需某个纯类型/常量模块，按名字单独放行，不要放宽兜底。
  return 'external dependency (only `./` and type-only `typeorm` are allowed)';
}

// Statement shapes. `[^;]*?` keeps a match inside one statement, so a multi-line import still
// resolves to a single specifier.
const FROM_RE = /(?:^|[;\n])[ \t]*(import|export)\s+([^;]*?)\s+from\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_RE = /(?:^|[;\n])[ \t]*import\s*['"]([^'"]+)['"]/g;
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function scanFile(file: string): string[] {
  const text = readFileSync(join(MODULE_DIR, file), 'utf8');
  const violations: string[] = [];

  const check = (ref: ImportRef): void => {
    const reason = violationReason(ref.specifier, ref.typeOnly);
    if (reason) violations.push(`${file}:${ref.line} ${ref.statement} — ${reason}`);
  };

  const fromRef = (match: RegExpMatchArray): ImportRef => ({
    line: lineOf(text, match.index!),
    specifier: match[3],
    typeOnly: isTypeOnlyClause(match[2]),
    statement: match[0].replace(/^[;\n]/, '').trim().replace(/\s+/g, ' '),
  });

  for (const match of text.matchAll(FROM_RE)) check(fromRef(match));
  for (const match of text.matchAll(SIDE_EFFECT_RE)) {
    check({
      line: lineOf(text, match.index!),
      specifier: match[1],
      typeOnly: false,
      statement: `import '${match[1]}'`,
    });
  }
  for (const match of text.matchAll(REQUIRE_RE)) {
    check({
      line: lineOf(text, match.index!),
      specifier: match[1],
      typeOnly: false,
      statement: `require('${match[1]}')`,
    });
  }
  for (const match of text.matchAll(DYNAMIC_IMPORT_RE)) {
    check({
      line: lineOf(text, match.index!),
      specifier: match[1],
      typeOnly: false,
      statement: `import('${match[1]}')`,
    });
  }

  return violations;
}

describe('governance-core purity', () => {
  it('scans the helpers it exists to guard', () => {
    expect(SOURCE_FILES).toEqual(expect.arrayContaining(REQUIRED_FILES));
  });

  it.each(SOURCE_FILES)('%s has no runtime dependency outside the module', (file) => {
    expect(scanFile(file)).toEqual([]);
  });

  // The cases above only pin today's allowed state: if the detector stopped matching, they would all
  // stay green. These pin the forbidden shapes so a loosened rule cannot pass as a clean tree.
  // 上面的用例只钉住「今天全部合法」：万一检测器不再匹配，它们仍然全绿。下面钉住被禁形态，
  // 使「规则被放宽」无法冒充「树是干净的」。
  it('rejects every dependency shape the module must not grow', () => {
    const forbidden: Array<[string, boolean]> = [
      ['typeorm', false],
      ['@nestjs/common', false],
      ['node:fs', false],
      ['node:child_process', false],
      ['../../ai/tools', false],
      ['../common/entities/user.entity', false],
      ['../users/users.repository', false],
      ['lodash', false],
    ];
    for (const [specifier, typeOnly] of forbidden) {
      expect(violationReason(specifier, typeOnly)).not.toBeNull();
    }
    expect(violationReason('typeorm', true)).toBeNull();
    expect(violationReason('./payload', false)).toBeNull();
  });

  it('treats only erased imports as type-only', () => {
    expect(isTypeOnlyClause('type { DataSource }')).toBe(true);
    expect(isTypeOnlyClause('{ type DataSource, type EntityManager }')).toBe(true);
    expect(isTypeOnlyClause('{ DataSource }')).toBe(false);
    expect(isTypeOnlyClause('DataSource, { EntityManager }')).toBe(false);
  });
});
