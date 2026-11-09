#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Every `image:` in a compose file must be pinned to a digest.
 *
 * A floating tag is not a version: `docker compose up` re-resolves it, so the same compose file can run
 * one image today and a different one next week, and nothing in this repository says which. The Dockerfiles
 * were pinned for exactly this reason (docs/manual/supply-chain.md §4); the compose files were not, and
 * that gap is what this gate closes. Its criterion is mechanical on purpose — the digest has to be present
 * and well-formed — because the alternative, trusting a human to notice, is what let seven entries float.
 *
 * It checks the reference, not the registry: whether the digest still points at the version the tag names
 * is answered at pin time (read the manifest, hash it, compare — §4), not on every CI run. Checking the
 * registry here would make the gate depend on network availability and turn a red build into a stranger's
 * outage.
 *
 * 编排文件里的每条 `image:` 都必须按摘要钉住。
 *
 * 浮动标签不是版本：`docker compose up` 会重新解析它，于是同一份编排今天跑一个镜像、下周跑另一个，而本仓
 * 对此什么也不会说。Dockerfile 正是因为这个理由钉住了（docs/manual/supply-chain.md §4），编排文件没钉，
 * 本闸补的就是这个缺口。判据有意做成机械的 —— 摘要必须存在且形状合法 —— 因为「靠人注意」正是让七条
 * 一直浮动的原因。
 *
 * 它只查引用，不查镜像仓库：摘要是否仍指向标签所声称的那个版本，在**钉的时候**回答（读清单、算哈希、
 * 比对 —— §4），而不是每次 CI。在这里查仓库会让本闸依赖网络，把一次红构建变成陌生人的一次故障。
 *
 * Usage / 用法:
 *   node scripts/check-compose-digests.mjs [--root <dir>]   (default root: repository root / 默认仓根)
 *
 * Exit / 退出码: 0 = every image pinned / 全部已钉; 1 = at least one floating or malformed / 至少一条浮动或形状非法.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SELF), '..');
const DIGEST = /@sha256:[0-9a-f]{64}$/;

/** Compose files in `<root>` — top level only, the place this repository keeps them.  `<root>` 顶层（本仓只放在这里）。 */
export function composeFiles(root) {
  return fs
    .readdirSync(root)
    .filter((f) => /^docker-compose.*\.ya?ml$/.test(f))
    .sort();
}

/**
 * Every `image:` value in one compose file that is not digest-pinned.
 * 一份编排文件里未按摘要钉住的 `image:` 值。
 */
export function floatingImages(root, file) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
  const floats = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith('#')) return; // a commented-out entry is not an entry / 注释掉的条目不算条目
    const m = /^image:\s*(.+?)\s*$/.exec(line);
    if (!m) return;
    const ref = m[1].replace(/^['"]|['"]$/g, '');
    if (!DIGEST.test(ref)) floats.push({ file, line: i + 1, ref });
  });
  return floats;
}

function main(argv) {
  const rootAt = argv.indexOf('--root');
  const root = rootAt === -1 ? REPO_ROOT : path.resolve(argv[rootAt + 1] ?? '');

  if (!fs.existsSync(root)) {
    console.error(`[compose-digests] --root 不存在 / --root does not exist: ${root}`);
    process.exit(1);
  }

  const files = composeFiles(root);
  if (files.length === 0) {
    console.error(
      `[compose-digests] ${root} 下没有 docker-compose*.yml —— 要么位置变了，要么本闸的射程过时了。\n` +
        `[compose-digests] no docker-compose*.yml under ${root} — the files moved, or this gate's scope is stale.`,
    );
    process.exit(1);
  }

  const floats = files.flatMap((f) => floatingImages(root, f));
  const pinned = files.flatMap((f) =>
    fs
      .readFileSync(path.join(root, f), 'utf8')
      .split('\n')
      .filter((l) => /^\s*image:\s*.*@sha256:[0-9a-f]{64}\s*$/.test(l)),
  );

  if (floats.length > 0) {
    console.error(`\n[compose-digests] ${floats.length} 条 image 未按摘要钉住 / not digest-pinned:\n`);
    for (const f of floats) console.error(`  ✗ ${f.file}:${f.line}  ${f.ref}`);
    console.error(
      `\n改成 <repo>:<version>@sha256:<digest>：钉的时候从镜像仓库现读摘要并核验，别抄报告。\n` +
        `Pin it as <repo>:<version>@sha256:<digest> — read the digest from the registry at pin time and verify it; never copy one out of a report.\n` +
        `做法 / procedure: docs/manual/supply-chain.md §4\n`,
    );
    process.exit(1);
  }

  console.log(`[compose-digests] ${pinned.length} 条 image 全部按摘要钉住（${files.length} 份编排文件）✓`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) main(process.argv.slice(2));
