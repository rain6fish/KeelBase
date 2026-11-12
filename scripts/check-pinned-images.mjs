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
 * trusting a human to notice, is what let eight entries float.
 *
 * Scope: any `docker-compose*.yml` in the tree (dot-directories and `node_modules` are skipped), and
 * `image:` inside a `services:` or `container:` block in `.github/workflows/*.yml`. Nothing else in a
 * workflow is a pull reference — a `run:` heredoc that mentions `image:` is text — so the workflow scan
 * follows those blocks instead of every line.
 *
 * Three references live outside YAML: the `docker pull` lines in `docs/manual/offline-deploy.md`, the
 * `IMAGE` constant in `Server-NestJS/scripts/check-pg-migration-consistency.mjs`, and the
 * `REQUIRED_IMAGES` list in `deploy/deploy-offline.sh` (§7.10 of the manual). The first two must be
 * digest-pinned and must agree with the pinned reference for the same `repo:tag`; the third looks images
 * up by tag on purpose — `docker image inspect` matches tags/IDs — so its entries only need a
 * digest-pinned counterpart somewhere in the tree. Without this half, any of them could drift back to a
 * floating tag and nothing would go red.
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
 * 机械的 —— 摘要必须存在且形状合法 —— 因为「靠人注意」正是让八条一直浮动的原因。
 *
 * 射程：树内任意 `docker-compose*.yml`（跳过点目录与 `node_modules`），以及 `.github/workflows/*.yml`
 * 里 `services:` 或 `container:` 块内的 `image:`。工作流里其余写着 `image:` 的地方都不是拉取引用 ——
 * `run:` 的 heredoc 只是文本 —— 所以工作流扫描跟着这些块走，而不是逐行匹配。
 *
 * 有三处引用在 YAML 之外：`docs/manual/offline-deploy.md` 的 `docker pull` 行、
 * `Server-NestJS/scripts/check-pg-migration-consistency.mjs` 的 `IMAGE` 常量，以及
 * `deploy/deploy-offline.sh` 的 `REQUIRED_IMAGES` 清单（手册 §7.10）。前两处必须按摘要钉住，且与同一
 * `repo:tag` 的钉点摘要一致；第三处**有意**按标签查本地镜像（`docker image inspect` 匹配标签/ID），
 * 所以只要求每个条目在树里有一处按摘要钉住的对应引用。没有这一半，任何一处都可能悄悄漂回浮动标签而
 * 不让任何东西变红。
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

/**
 * Compose files anywhere under `<root>`, as paths relative to it. Dot-directories and `node_modules` are
 * skipped: a worktree copy or an installed package is not this tree's pull reference.
 * `<root>` 下任意层的编排文件，返回相对路径。点目录与 `node_modules` 跳过：worktree 副本或装好的包不是
 * 本树的拉取引用。
 */
export function composeFiles(root) {
  const found = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(path.join(dir, entry.name), child);
      } else if (/^docker-compose.*\.ya?ml$/.test(entry.name)) {
        found.push(child);
      }
    }
  };
  walk(root, '');
  return found.sort();
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

const NON_YAML_DIGEST_REFS = [
  { file: 'docs/manual/offline-deploy.md', pattern: /^\s*docker pull\s+(\S+)\s*$/gm, label: 'docker pull' },
  { file: 'Server-NestJS/scripts/check-pg-migration-consistency.mjs', pattern: /const IMAGE = '([^']+)'/g, label: 'IMAGE' },
];
const NON_YAML_TAG_LIST = {
  file: 'deploy/deploy-offline.sh',
  pattern: /REQUIRED_IMAGES=\(([\s\S]*?)\)/,
  label: 'REQUIRED_IMAGES',
};

const repoTagOf = (ref) => ref.split('@')[0];
const digestOf = (ref) => {
  const m = /@(sha256:[0-9a-f]{64})$/.exec(ref);
  return m ? m[1] : null;
};

/**
 * Digest-pinned references in the tree, keyed by `repo:tag`: compose `image:` values and Dockerfile
 * `FROM` lines. This is the yardstick the non-YAML references are compared against.
 * 树里按摘要钉住的引用，按 `repo:tag` 索引：编排的 `image:` 与 Dockerfile 的 `FROM`。这是非 YAML 引用
 * 的对账基准。
 */
export function pinnedIndex(root) {
  const index = new Map();
  const add = (ref) => {
    const digest = digestOf(ref);
    if (digest) index.set(repoTagOf(ref), digest);
  };
  for (const file of composeFiles(root)) {
    for (const raw of readLines(root, file)) {
      const ref = refOf(raw.trim());
      if (ref) add(ref);
    }
  }
  for (const file of fs.readdirSync(root).filter((f) => /^Dockerfile/.test(f))) {
    if (!fs.statSync(path.join(root, file)).isFile()) continue;
    for (const raw of readLines(root, file)) {
      const m = /^FROM\s+(\S+)/.exec(raw.trim());
      if (m) add(m[1]);
    }
  }
  return index;
}

/**
 * Pull references that live outside YAML and are not pinned (§7.10 of the manual). Missing files are a
 * violation only against the real repository root, where all three are expected to exist; a fixture tree
 * may carry just the one it is testing.
 * 在 YAML 之外、且未按摘要钉住的拉取引用（手册 §7.10）。文件缺失只对真实仓根算违规 —— 那里三处都该在；
 * 夹具树可以只带它正在测的那一处。
 */
export function floatingNonYamlRefs(root) {
  const index = pinnedIndex(root);
  const out = [];
  const strict = path.resolve(root) === REPO_ROOT;

  for (const spec of NON_YAML_DIGEST_REFS) {
    const file = path.join(root, spec.file);
    if (!fs.existsSync(file)) {
      if (strict) out.push({ file: spec.file, line: 0, ref: '(file not found)', why: 'missing' });
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(spec.pattern)) {
      const ref = m[1];
      const line = text.slice(0, m.index).split('\n').length;
      const digest = digestOf(ref);
      if (!digest) {
        out.push({ file: spec.file, line, ref, why: 'not digest-pinned' });
        continue;
      }
      const canonical = index.get(repoTagOf(ref));
      if (canonical && canonical !== digest) {
        out.push({
          file: spec.file,
          line,
          ref,
          why: `digest differs from the pinned ${repoTagOf(ref)} (${canonical})`,
        });
      }
    }
  }

  const listFile = path.join(root, NON_YAML_TAG_LIST.file);
  if (!fs.existsSync(listFile)) {
    if (strict) out.push({ file: NON_YAML_TAG_LIST.file, line: 0, ref: '(file not found)', why: 'missing' });
    return out;
  }
  const text = fs.readFileSync(listFile, 'utf8');
  const block = NON_YAML_TAG_LIST.pattern.exec(text);
  if (!block) {
    out.push({
      file: NON_YAML_TAG_LIST.file,
      line: 0,
      ref: NON_YAML_TAG_LIST.label,
      why: "list not found — this gate's scope is stale",
    });
    return out;
  }
  const line = text.slice(0, block.index).split('\n').length;
  for (const m of block[1].matchAll(/"([^"]+)"/g)) {
    const ref = m[1];
    if (!index.has(repoTagOf(ref))) {
      out.push({ file: NON_YAML_TAG_LIST.file, line, ref, why: 'no digest-pinned counterpart in the tree' });
    }
  }
  return out;
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
  const nonYaml = floatingNonYamlRefs(root);

  if (floats.length + nonYaml.length > 0) {
    if (floats.length > 0) {
      console.error(`\n[pinned-images] ${floats.length} 条 image 未按摘要钉住 / not digest-pinned:\n`);
      for (const f of floats) console.error(`  ✗ ${f.file}:${f.line}  ${f.ref}`);
    }
    if (nonYaml.length > 0) {
      console.error(`\n[pinned-images] ${nonYaml.length} 处 YAML 之外的引用未对账 / non-YAML reference not accounted for:\n`);
      for (const f of nonYaml) console.error(`  ✗ ${f.file}:${f.line}  ${f.ref}  — ${f.why}`);
    }
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
    `[pinned-images] ${pinned} 条 image 全部按摘要钉住（${compose.length} 份编排文件 + ${workflows.length} 份 workflow）；` +
      `另对账 ${NON_YAML_DIGEST_REFS.length + 1} 处非 YAML 来源 ✓ / ${pinned} images pinned, non-YAML sources reconciled`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) main(process.argv.slice(2));
