#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Every image a YAML file pulls must be pinned to a digest.
 *
 * A floating tag is not a version: `docker compose up` and a CI service container both re-resolve it, so
 * the same file can run one image today and a different one next week, and nothing in this repository
 * says which. The Dockerfiles were pinned for exactly this reason (docs/manual/supply-chain.md §4); the
 * compose files and the CI service image were not, and that gap is what this gate closes. Its criterion
 * is mechanical on purpose — the digest has to be present and well-formed — because the alternative,
 * trusting a human to notice, is what let seven entries float.
 *
 * Scope: `docker-compose*.yml` at the root, and `image:` inside a `services:` or `container:` block in
 * `.github/workflows/*.yml`. Nothing else in a workflow is a pull reference — a `run:` heredoc that
 * mentions `image:` is text — so the workflow scan follows those blocks instead of every line.
 *
 * It checks the reference, not the registry: whether the digest still points at the version the tag names
 * is answered at pin time (read the manifest, hash it, compare — §4), not on every CI run. Checking the
 * registry here would make the gate depend on network availability and turn a red build into a stranger's
 * outage.
 *
 * 每个会被拉取的 YAML 镜像引用都必须按摘要钉住。
 *
 * 浮动标签不是版本：`docker compose up` 与 CI 的 service 容器都会重新解析它，于是同一份文件今天跑一个
 * 镜像、下周跑另一个，而本仓对此什么也不会说。Dockerfile 正是因为这个理由钉住了
 * （docs/manual/supply-chain.md §4），编排文件与 CI service 镜像没钉，本闸补的就是这个缺口。判据有意做成
 * 机械的 —— 摘要必须存在且形状合法 —— 因为「靠人注意」正是让七条一直浮动的原因。
 *
 * 射程：根目录的 `docker-compose*.yml`，以及 `.github/workflows/*.yml` 里 `services:` 或 `container:`
 * 块内的 `image:`。工作流里其余写着 `image:` 的地方都不是拉取引用 —— `run:` 的 heredoc 只是文本 ——
 * 所以工作流扫描跟着这些块走，而不是逐行匹配。
 *
 * 它只查引用，不查镜像仓库：摘要是否仍指向标签所声称的那个版本，在**钉的时候**回答（读清单、算哈希、
 * 比对 —— §4），而不是每次 CI。在这里查仓库会让本闸依赖网络，把一次红构建变成陌生人的一次故障。
 *
 * Usage / 用法:
 *   node scripts/check-pinned-images.mjs [--root <dir>]   (default root: repository root / 默认仓根)
 *
 * Exit / 退出码: 0 = every pull reference pinned / 全部已钉; 1 = at least one floating or malformed /
 * 至少一条浮动或形状非法.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SELF), '..');
const DIGEST = /@sha256:[0-9a-f]{64}$/;
const WORKFLOWS = path.join('.github', 'workflows');

/** Compose files in `<root>` — top level only, the place this repository keeps them.  `<root>` 顶层（本仓只放在这里）。 */
export function composeFiles(root) {
  return fs
    .readdirSync(root)
    .filter((f) => /^docker-compose.*\.ya?ml$/.test(f))
    .sort();
}

/** Workflow files in `<root>`, or none.  `<root>` 下的工作流文件，没有则为空。 */
export function workflowFiles(root) {
  const dir = path.join(root, WORKFLOWS);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => path.join(WORKFLOWS, f));
}

const readLines = (root, file) => fs.readFileSync(path.join(root, file), 'utf8').split('\n');

function refOf(line) {
  const m = /^image:\s*(.+?)\s*$/.exec(line);
  return m ? m[1].replace(/^['"]|['"]$/g, '') : null;
}

const isPinned = (ref) => ref !== null && DIGEST.test(ref);

/**
 * Every `image:` value in one compose file that is not digest-pinned.
 * 一份编排文件里未按摘要钉住的 `image:` 值。
 */
export function floatingImages(root, file) {
  const floats = [];
  readLines(root, file).forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith('#')) return; // a commented-out entry is not an entry / 注释掉的条目不算条目
    const ref = refOf(line);
    if (ref !== null && !isPinned(ref)) floats.push({ file, line: i + 1, ref });
  });
  return floats;
}

/**
 * Every pull reference in one workflow file that is not digest-pinned: `services:<name>.image` and
 * `container.image`, followed by block indentation.
 * 一份工作流里未按摘要钉住的拉取引用：`services:<名>.image` 与 `container.image`，按块缩进跟随。
 */
export function floatingWorkflowImages(root, file) {
  const floats = [];
  let blockIndent = -1;
  readLines(root, file).forEach((raw, i) => {
    if (/^\s*#/.test(raw)) return;
    const text = raw.trim();
    if (!text) return;
    const indent = raw.length - raw.trimStart().length;
    if (/^(services|container):\s*$/.test(text)) {
      blockIndent = indent;
      return;
    }
    if (blockIndent >= 0 && indent <= blockIndent) blockIndent = -1; // left the block / 已离开该块
    if (blockIndent < 0) return;
    const ref = refOf(text);
    if (ref !== null && !isPinned(ref)) floats.push({ file, line: i + 1, ref });
  });
  return floats;
}

function main(argv) {
  const rootAt = argv.indexOf('--root');
  const root = rootAt === -1 ? REPO_ROOT : path.resolve(argv[rootAt + 1] ?? '');

  if (!fs.existsSync(root)) {
    console.error(`[pinned-images] --root 不存在 / --root does not exist: ${root}`);
    process.exit(1);
  }

  const compose = composeFiles(root);
  const workflows = workflowFiles(root);
  if (compose.length === 0 && workflows.length === 0) {
    console.error(
      `[pinned-images] ${root} 下既没有 docker-compose*.yml 也没有 ${WORKFLOWS}/*.yml —— 要么位置变了，要么本闸的射程过时了。\n` +
        `[pinned-images] neither docker-compose*.yml nor ${WORKFLOWS}/*.yml under ${root} — the files moved, or this gate's scope is stale.`,
    );
    process.exit(1);
  }

  const floats = [
    ...compose.flatMap((f) => floatingImages(root, f)),
    ...workflows.flatMap((f) => floatingWorkflowImages(root, f)),
  ];

  if (floats.length > 0) {
    console.error(`\n[pinned-images] ${floats.length} 条 image 未按摘要钉住 / not digest-pinned:\n`);
    for (const f of floats) console.error(`  ✗ ${f.file}:${f.line}  ${f.ref}`);
    console.error(
      `\n改成 <repo>:<version>@sha256:<digest>：钉的时候从镜像仓库现读摘要并核验，别抄报告。\n` +
        `Pin it as <repo>:<version>@sha256:<digest> — read the digest from the registry at pin time and verify it; never copy one out of a report.\n` +
        `做法 / procedure: docs/manual/supply-chain.md §4\n`,
    );
    process.exit(1);
  }

  const pinned = [...compose, ...workflows].reduce(
    (sum, file) => sum + readLines(root, file).filter((raw) => isPinned(refOf(raw.trim()))).length,
    0,
  );
  console.log(
    `[pinned-images] ${pinned} 条 image 全部按摘要钉住（${compose.length} 份编排文件 + ${workflows.length} 份 workflow）✓`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) main(process.argv.slice(2));
