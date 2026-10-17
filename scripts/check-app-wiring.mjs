#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Gate: the three process entry modules can actually be instantiated.
 *
 * On 2026-10-17 main was red and nobody had noticed: `app-wiring.spec.ts` — the one spec that imports
 * the real `AppModule` — failed with `Nest can't resolve dependencies of the AuditEvidenceService
 * (… CoverageService at index [3] …)`. A dependency had been added to a service's constructor and the
 * standalone governance module, which instantiates that service itself, never got the provider.
 * `npm run check:all` has every gate but **none of them instantiates a module or runs a unit test**, so
 * the break was visible only in CI's unit-test job — i.e. after the push, not before.
 *
 * This closes that class the cheapest way that genuinely catches it: run that one spec, nothing else.
 * It is deliberately not a static analyser comparing constructors with provider lists — providers can
 * be factories, class aliases, exported/imported modules, global modules or dynamic modules, and an
 * analyser that models those would both false-positive and still miss cases. Running the real Nest
 * container cannot miss them: it is the failure itself.
 *
 * Cost: one jest process, one suite (three module instantiations), no full unit run.
 *
 * 门禁：三个进程入口模块能不能真的被实例化。
 *
 * 2026-10-17，main 红着没人看见：唯一 import 真实 `AppModule` 的 `app-wiring.spec.ts` 报
 * `Nest can't resolve dependencies of the AuditEvidenceService (… CoverageService at index [3] …)`。
 * 有人给服务构造器加了依赖，而**自己实例化这些服务的独立治理模块**没拿到对应 provider。
 * `npm run check:all` 的每一道门禁都**没有实例化模块、也不跑单测**，所以这个断裂只能在 CI 的单测
 * job 里看见 —— 也就是推上去之后，而不是推之前。
 *
 * 这里用「真的能抓到」的最便宜办法补上这一类：只跑那一个 spec，别的都不跑。刻意**不做**「构造器
 * 依赖 vs provider 清单」的静态比对 —— provider 可以是工厂、类别名、export/import 的模块、全局模块
 * 或动态模块；能建模这些的分析器会同时误报和漏报。让真实 Nest 容器跑一遍不会漏：它本身就是那个故障。
 *
 * 开销：一个 jest 进程、一个套件（三次模块实例化），不跑全量单测。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'Server-NestJS');
const SPEC = 'src/app-wiring.spec.ts';
const JEST_BIN = path.join(SERVER, 'node_modules', 'jest', 'bin', 'jest.js');

if (!fs.existsSync(JEST_BIN)) {
  console.error(
    `[app-wiring] 找不到 ${path.relative(ROOT, JEST_BIN)}。\n` +
      `先在 Server-NestJS/ 里 npm install，然后再跑。\n` +
      `Missing backend dependencies — run npm install inside Server-NestJS/ first.`,
  );
  process.exit(1);
}

// `--silent` suppresses TypeORM's schema-log chatter; a module that cannot be instantiated still fails
// the suite and prints the Nest error, which is what this gate exists to surface.
// `--silent` 压掉 TypeORM 的建表日志；装不起来的模块仍然会让套件失败并打印 Nest 的错误 —— 那正是本闸要看的东西。
const started = Date.now();
try {
  execFileSync(process.execPath, [JEST_BIN, SPEC, '--forceExit', '--silent'], {
    cwd: SERVER,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 300_000,
  });
  console.log(`[app-wiring] AppModule / GovernanceModule / SidecarModule 都能实例化 ✓（${((Date.now() - started) / 1000).toFixed(1)}s）`);
} catch (err) {
  const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  const lines = out.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.includes("Nest can't resolve dependencies"));
  console.error(`\n[app-wiring] 装配冒烟红了：入口模块装不起来（${((Date.now() - started) / 1000).toFixed(1)}s）。`);
  if (idx >= 0) {
    // The Nest message is the answer: which class, which index, which missing provider.
    // Nest 的报错本身就是答案：哪个类、第几个参数、缺哪个 provider。
    console.error(lines.slice(idx, idx + 8).join('\n'));
  } else {
    console.error(lines.slice(-20).join('\n'));
  }
  console.error(
    `\n修法：给该模块的 providers 补上缺的那个，或把构造器依赖去掉。\n` +
      `Fix: add the missing provider to that module's providers (or drop the constructor dependency).\n`,
  );
  process.exit(1);
}
