#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * e2e 分片 runner：把全部 e2e 套件拆成 4 片依次跑，汇总退出码。
 *
 * 为什么：全部 e2e 套件（当前 36 个）放进**一次** jest 调用会命中已知的「单进程长跑硬崩」——
 * 进程中途无输出死亡（没有 jest 汇总行），整套 e2e 报假红。分片把每个 jest 进程压到
 * 约 9 个套件以规避，同时保持与单次调用等价的语义：任一片失败 → 整体非 0（不吞退出码）。
 * 跑完所有片再汇总，便于一次看到全部失败片。
 *
 * 分片交给 jest 原生 --shard=N/M（jest 自己按测试文件均分），不在此维护套件清单——
 * 新增 e2e 文件自动纳入。片数调整只需改 SHARDS。
 *
 * 用法：npm run test:e2e（CI 的 test job 与 scripts/dev.sh 都走这条命令）
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARDS = 4;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jestBin = path.join(root, 'node_modules', 'jest', 'bin', 'jest.js');

const failed = [];
for (let i = 1; i <= SHARDS; i++) {
  console.log(`\n── e2e 分片 ${i}/${SHARDS} ──`);
  const r = spawnSync(
    process.execPath,
    [jestBin, '--config', './test/jest-e2e.json', '--forceExit', `--shard=${i}/${SHARDS}`],
    { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } },
  );
  if (r.status !== 0) failed.push(`${i}/${SHARDS}`);
}

if (failed.length) {
  console.error(`\n✗ e2e 未通过：分片 ${failed.join('、')} 失败（共 ${SHARDS} 片）`);
  process.exit(1);
}
console.log(`\n✓ e2e 全部通过（${SHARDS} 片）`);
