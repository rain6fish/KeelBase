// SPDX-License-Identifier: Apache-2.0

/**
 * When the contract submodule is missing, turn "file not found" into "run this command".
 *
 * `Server-NestJS/specs/protocol` is a **submodule** (the contract repo `rain6fish/keelbase-contract`);
 * the main repo's tree carries only a gitlink, not the files. So any clone made without
 * `--recurse-submodules` gets an **empty** `specs/protocol/`, and dozens of suites fail at once with
 * `ENOENT … specs/protocol/schemas/v1/xxx.schema.json`. Read on its own, that message says "this repo
 * is missing files" — it does not say "initialise the submodule", and it reads like the protocol layer
 * has drifted from the implementation.
 *
 * That misdiagnosis has happened twice (two external test reports, 2026-09-24 and 2026-09-30). Those
 * readers work from the **failure output**, not from a banner printed before the run, so the hint has
 * to land where the failure lands. Hence this shim: only when the contract directory is absent, and
 * only for reads that target it, `readFileSync`'s ENOENT is replaced by an actionable error.
 * When the contract is present this does **nothing at all** — no patch, no check, no behaviour change.
 *
 * 契约 submodule 未初始化时，把「文件不存在」翻译成「跑哪条命令」。
 *
 * `Server-NestJS/specs/protocol` 是 **submodule**（契约仓 `rain6fish/keelbase-contract`），主仓树里只有一条
 * gitlink、没有文件本体。于是任何**没带 `--recurse-submodules` 的 clone** 都会得到一个**完全空的**
 * `specs/protocol/`，几十个套件同时报 `ENOENT … schemas/v1/xxx.schema.json`。这条消息单看就是「仓库缺文件」，
 * 读不出「该初始化 submodule」，更像「协议层与实现层已脱钩」。
 *
 * 这个误诊已发生两次（2026-09-24、2026-09-30 两份外部实测报告）。而外部驱动者读的是**失败输出**、不是跑之前
 * 的横幅，所以提示必须落在失败处。故有本 shim：仅在**契约目录缺失**时、且仅对**指向契约的读**，把 ENOENT 换成
 * 可执行的错误。契约在位时**什么都不做** —— 不包、不查、不改行为。
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

/**
 * Patch the CJS module object, not `import * as fs from 'node:fs'`.
 *
 * Under jest that namespace is an **immutable ESM view** (`readFileSync` is a non-configurable
 * getter), so assigning to it throws. Meanwhile the spec files all use named imports
 * (`import { readFileSync } from 'node:fs'`), which compile to a property access on the CJS
 * object at call time — so patching that object reaches every one of them.
 *
 * 补的是 CJS 模块对象，不是 `import * as fs from 'node:fs'`：后者在 jest 下是**不可变的 ESM 视图**
 * （`readFileSync` 是非 configurable 的 getter），赋值直接抛。而各 spec 用的是具名导入，编译成
 * **调用时**对 CJS 对象取属性，故补该对象即可覆盖全部。
 */
const fs = createRequire(__filename)('node:fs') as typeof import('node:fs');

/** Contract root: `Server-NestJS/specs/protocol` (this file lives in `Server-NestJS/test/`). */
const CONTRACT_ROOT = resolve(__dirname, '..', 'specs', 'protocol');
const FIX_COMMAND = 'git submodule update --init --recursive';

/** Paths the spec files read out of the contract (schema/registry/vector reads all go through it). */
function isContractPath(path: unknown): boolean {
  return typeof path === 'string' && path.replace(/\\/g, '/').includes('specs/protocol');
}

if (!fs.existsSync(CONTRACT_ROOT)) {
  const originalReadFileSync = fs.readFileSync.bind(fs) as (...args: unknown[]) => unknown;
  fs.readFileSync = function patchedReadFileSync(path: unknown, ...rest: unknown[]) {
    try {
      return originalReadFileSync(path, ...rest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT' && isContractPath(path)) {
        throw new Error(
          [
            '',
            'The contract repository (a git submodule) is not initialised — this is NOT "the repo is missing files".',
            `  missing path : ${String(path)}`,
            '  why          : Server-NestJS/specs/protocol is a submodule (contract repo keelbase-contract);',
            '                 the main repo stores only a gitlink, so a clone without',
            '                 --recurse-submodules leaves that directory completely empty.',
            `  fix          : run from the repository root ->  ${FIX_COMMAND}`,
            '',
            '契约仓（submodule）未初始化 —— 这**不是**「仓库缺文件」。',
            `  缺失路径：${String(path)}`,
            '  原因：Server-NestJS/specs/protocol 是 submodule（契约仓 keelbase-contract），主仓树里只存一条 gitlink，',
            '        不带 --recurse-submodules 的 clone 会把它留成空目录。',
            `  修复：在仓库根执行  ${FIX_COMMAND}`,
            '',
          ].join('\n'),
          { cause: err as Error },
        );
      }
      throw err;
    }
  } as typeof fs.readFileSync;
}
