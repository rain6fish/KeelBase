#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * A release may only claim contract capabilities that have an implementer.
 *
 * On 2026-10-31 the membership change on the contract repository's `main` (`7a250e5`: v3 of
 * `audit-chain-verification` and `audit-action-report`, adding `tableIds` / `verifiedIds` /
 * `unverifiedIds` / `unaccounted`) was parked until the Java runtime can answer those fields. Two
 * releases since then were cut from the previous tag instead of `main`'s tip precisely to keep the
 * capability out. The rule lived only in prose and in what people remembered: nothing failed a release
 * that claimed it anyway. This gate is that failure.
 *
 * Criteria, each one falsifiable from the tree itself:
 *
 *   C1. The pin commit is reachable on the contract remote (`git ls-remote`). A pin nobody can fetch
 *       is a claim about a tree that may not exist elsewhere; unreadable remote = UNVERIFIED = red.
 *   C2. Both READMEs name the same contract version on the `main` row, that version is a tag in the
 *       contract checkout, and the tag is on the remote.
 *   C3. The pin sits on that tag or descends from it. If it descends, the commits it adds must not
 *       carry a capability that is still parked — pinning `main`'s tip over a parked capability is
 *       how the membership change reached this repository's snapshot on 2026-11-04.
 *   C4. The claimed version descends from the previous release tag: a release is a release line, not
 *       an arbitrary commit that happens to carry a version name.
 *   C5. Every capability whose schema is present in the claimed tree (or in the pin's tree) has an
 *       implementer: the Java vendored snapshot carries the same schema, and one Java source file
 *       declares every field the schema requires. A claimed capability with no implementer is red.
 *
 * The capability list below is the single source of truth; adding a parked capability means adding an
 * entry with its decision. The wording of the decision is evidence, not decoration: a reader of a red
 * run must be able to see why the capability is parked and what would unpark it.
 *
 * 发布只能声称**有实现方**的契约能力。
 *
 * 2026-10-31，契约仓 `main` 上的成员性改动（`7a250e5`：`audit-chain-verification` 与
 * `audit-action-report` 的 v3，新增 `tableIds` / `verifiedIds` / `unverifiedIds` / `unaccounted`）
 * 被压到 Java 运行时能回答这些字段为止。此后两次发布都从上一个 tag 切出、而不是从 `main` 末端切，
 * 正是为了把这能力挡在外面。这条规矩此前只活在散文与记忆里：一个照样声称它的发布**不会失败**。
 * 本闸就是那次失败。
 *
 * 判据逐条可反向证伪：
 *
 *   C1. pin 提交在契约远端可达（`git ls-remote`）。谁也取不到的 pin，是对一棵可能不存在于别处的树
 *       的声称；远端读不出 = **未核验** = 红。
 *   C2. 两版 README 的 `main` 行写着同一个契约版本，该版本是契约检出里的 tag，且该 tag 在远端。
 *   C3. pin 落在该 tag 上、或由它派生。若由它派生，多出来的提交不得携带仍在暂缓中的能力 ——
 *       把 `main` 末端钉进来，正是成员性改动在 2026-11-04 进入本仓快照的方式。
 *   C4. 声称的版本由上一个发布 tag 派生：发布是一条发布线，不是一个恰好带着版本名的任意提交。
 *   C5. 凡是 schema 出现在声称树（或 pin 树）里的能力，都必须有实现方：Java vendored 快照带着同一份
 *       schema，且有一个 Java 源文件声明了该 schema 要求的全部字段。声称了却没有实现方的能力 = 红。
 *
 * 下面的能力清单是单一真源；新增一条暂缓能力 = 加一条带裁决原文的条目。裁决原文是**证据**、不是装饰：
 * 读到红的人必须能看见这能力为何暂缓、以及什么才能解冻它。
 *
 * Usage / 用法:
 *   node scripts/check-contract-release-gate.mjs [--root <dir>] [--contract <dir>] [--java <dir>] [--java-ref <ref>]
 *   Default contract: <root>/Server-NestJS/specs/protocol; default Java: ../KeelBase4J or $KEELBASE_JAVA_REPO.
 *   默认契约目录：<root>/Server-NestJS/specs/protocol；默认 Java 仓：../KeelBase4J 或 $KEELBASE_JAVA_REPO。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_SUB = 'Server-NestJS/specs/protocol';
const READMES = ['README.md', 'README.zh-CN.md'];
const JAVA_SNAPSHOT_DIR = 'conformance/vectors';
const GIT_TIMEOUT_MS = 30_000;

/**
 * Capabilities that are claimed by a schema in the contract tree and must therefore be implemented.
 * Adding one is deliberate: it is the whole registry, not a sample.
 * 由契约树里的 schema 声称、因而必须有实现方的能力。新增一条是**有意**的动作：这里是全部登记，不是抽样。
 */
const CAPABILITIES = [
  {
    id: 'audit-membership-v3',
    title: 'audit-chain-verification v3 / audit-action-report v3 publish membership',
    decision:
      '2026-10-31 (main repo 0816d423): parked until the Java runtime answers tableIds / verifiedIds / unverifiedIds with a consistency test. v1.17.0 and v1.18.0 were cut from the previous tag to keep it out.',
    decisionZh:
      '2026-10-31（主仓 0816d423）裁决：暂缓，直到 Java 运行时答得出 tableIds / verifiedIds / unverifiedIds 并有一致性测试。v1.17.0 与 v1.18.0 都从上一个 tag 切出以避开它。',
    schemas: [
      {
        path: 'schemas/v3/audit-chain-verification.schema.json',
        fields: ['tableIds', 'verifiedIds', 'unverifiedIds'],
      },
      {
        path: 'schemas/v3/audit-action-report.schema.json',
        fields: ['tableIds', 'verifiedIds', 'unverifiedIds', 'unaccounted'],
      },
    ],
  },
];

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') opts.root = argv[++i];
    else if (arg === '--contract') opts.contract = argv[++i];
    else if (arg === '--java') opts.java = argv[++i];
    else if (arg === '--java-ref') opts.javaRef = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-contract-release-gate.mjs [--root <dir>] [--contract <dir>] [--java <dir>] [--java-ref <ref>]');
      console.log('用法：node scripts/check-contract-release-gate.mjs [--root <目录>] [--contract <目录>] [--java <目录>] [--java-ref <ref>]');
      process.exit(0);
    } else {
      console.error(`[contract-release-gate] unknown argument: ${arg}`);
      console.error(`[contract-release-gate] 未知参数：${arg}`);
      process.exit(2);
    }
  }
  return opts;
}

function git(cwd, args) {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = (r.stdout ?? '').trim();
  const stderr = (r.stderr ?? '').trim();
  if (r.error) {
    return { ok: false, status: null, stdout, stderr: r.error.message };
  }
  return { ok: r.status === 0, status: r.status, stdout, stderr };
}

/** `git cat-file -e <rev>:<path>` — whether the tree at `rev` carries that blob. 该 rev 的树里是否带这个 blob。 */
function treeHas(contract, rev, file) {
  return git(contract, ['cat-file', '-e', `${rev}:${file}`]).ok;
}

const failures = [];
const notes = [];

function pass(id, title, evidence = []) {
  console.log(`✓ ${id} ${title}`);
  for (const e of evidence) console.log(`    · ${e}`);
}

function fail(id, title, evidence = [], advice = []) {
  console.log(`✗ ${id} ${title}`);
  for (const e of evidence) console.log(`    · ${e}`);
  for (const a of advice) console.log(`  → ${a}`);
  failures.push(`${id} ${title}`);
}

function unverified(id, title, why, advice = []) {
  fail(id, `${title} —— 无法核验 / UNVERIFIED`, [why], advice);
}

function readReadmeVersion(root) {
  const found = [];
  for (const file of READMES) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) {
      found.push({ file, version: null, why: '文件不存在 / file missing' });
      continue;
    }
    const text = fs.readFileSync(full, 'utf8');
    const line = text.split('\n').find((l) => l.includes('`main`') && l.includes('KeelBase'));
    if (!line) {
      found.push({ file, version: null, why: '找不到 `main` 行 / no `main` row' });
      continue;
    }
    const m = line.match(/\*\*(v\d+\.\d+\.\d+)\*\*/);
    found.push({ file, version: m ? m[1] : null, why: m ? '' : '`main` 行里没有 **vX.Y.Z**' });
  }
  return found;
}

function parseVersion(v) {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareVersion(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function readRemote(contract) {
  const url = git(contract, ['remote', 'get-url', 'origin']);
  if (!url.ok) {
    return { ok: false, why: '契约检出没有 `origin` 远端 / the contract checkout has no `origin` remote' };
  }
  const r = git(contract, ['ls-remote', 'origin']);
  if (!r.ok) {
    return { ok: false, why: `git ls-remote origin 失败：${r.stderr || `exit ${r.status}`}` };
  }
  const refs = r.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ref] = line.split('\t');
      return { sha, ref };
    });
  return { ok: true, url: url.stdout, refs };
}

/** Commit a remote tag resolves to; annotated tags are read through their peeled line. 远端 tag 指向的提交；附注 tag 读 `^{}` 行。 */
function remoteTagCommit(remote, tag) {
  const plain = remote.refs.find((r) => r.ref === `refs/tags/${tag}`);
  if (!plain) return null;
  const peeled = remote.refs.find((r) => r.ref === `refs/tags/${tag}^{}`);
  return { object: plain.sha, commit: peeled ? peeled.sha : plain.sha };
}

function refsNamingCommit(remote, sha) {
  // `HEAD` is a symbolic alias of the default branch; it names the commit but tells a reader nothing.
  // `HEAD` 是默认分支的符号别名；它能指明提交，却对读者毫无信息。
  return remote.refs.filter((r) => r.sha === sha && r.ref !== 'HEAD').map((r) => r.ref);
}

/** Fields declared together in one Java file — a DTO that carries the capability, not scattered mentions. 同一 Java 文件里一起声明的字段 —— 承载该能力的 DTO，而不是散落各处的提及。 */
function javaImplementation(javaRepo, javaRef, fields) {
  const first = fields[0];
  const hits = git(javaRepo, ['grep', '-l', '-F', '-e', first, javaRef, '--', '*.java']);
  if (hits.status === null || hits.status > 1) {
    return { ok: false, error: hits.stderr || `git grep exit ${hits.status}`, files: [], missing: fields };
  }
  if (hits.status === 1) {
    return { ok: false, files: [], missing: fields };
  }
  // `git grep <pattern> <rev>` prefixes every path with `<rev>:`. Strip it before reading the blob.
  // `git grep <pattern> <rev>` 会给每条路径加 `<rev>:` 前缀；读 blob 前先剥掉。
  const prefix = `${javaRef}:`;
  const files = hits.stdout
    .split('\n')
    .filter(Boolean)
    .map((f) => (f.startsWith(prefix) ? f.slice(prefix.length) : f));
  const missingByFile = [];
  for (const file of files) {
    const text = git(javaRepo, ['show', `${javaRef}:${file}`]);
    if (!text.ok) continue;
    const missing = fields.filter((f) => !new RegExp(`\\b${f}\\b`).test(text.stdout));
    if (missing.length === 0) return { ok: true, files, file, missing: [] };
    missingByFile.push(`${file} 缺 ${missing.join(', ')}`);
  }
  return { ok: false, files, missing: fields, detail: missingByFile };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = path.resolve(opts.root ?? ROOT);
  const contract = path.resolve(opts.contract ?? path.join(root, CONTRACT_SUB));
  const javaRepo = path.resolve(
    opts.java ?? process.env.KEELBASE_JAVA_REPO ?? path.join(root, '..', 'KeelBase4J'),
  );

  console.log('[contract-release-gate] 契约成员性发版闸 / contract membership release gate');
  console.log(`  consumer / 消费方: ${root}`);
  console.log(`  contract / 契约:   ${contract}`);
  console.log(`  java / 实现方:     ${javaRepo}`);
  console.log('');

  if (!git(contract, ['rev-parse', '--show-toplevel']).ok) {
    unverified(
      'C0',
      '契约检出可读',
      `${contract} 不是 git 检出 / not a git checkout`,
      ['git submodule update --init Server-NestJS/specs/protocol'],
    );
    return finish();
  }

  const pin = git(contract, ['rev-parse', 'HEAD']);
  if (!pin.ok) {
    unverified('C1', 'pin 在远端可达', '读不出契约检出的 HEAD / cannot read the contract HEAD');
    return finish();
  }

  // Tags in a CI submodule checkout arrive without the tag refs (actions/checkout fetches the pin only).
  // A shallow checkout also lacks the history `describe` walks, so it is unshallowed — the same fallback
  // `check-contract-matrix.mjs` uses. A fetch that still leaves a tag missing is reported below.
  // CI 的 submodule 检出不带 tag ref（actions/checkout 只取 pin）。浅检出还缺 `describe` 要走的祖先历史，
  // 故先 unshallow —— 与 `check-contract-matrix.mjs` 同一套兜底。取完仍缺的 tag 由下面如实报告。
  const shallow = git(contract, ['rev-parse', '--is-shallow-repository']).stdout === 'true';
  git(contract, ['fetch', '--tags', ...(shallow ? ['--unshallow'] : []), 'origin']);

  const remote = readRemote(contract);

  // ── C1 — the pin is reachable on the remote ────────────────────────────────
  if (!remote.ok) {
    unverified('C1', 'pin 在远端可达', remote.why, [
      'git -C Server-NestJS/specs/protocol remote -v',
      'git -C Server-NestJS/specs/protocol fetch --tags origin',
    ]);
  } else {
    // Prefer a tag in the evidence: the pin is normally a release, and `refs/heads/release/...` says
    // less to a reader even when it points at the same commit.
    // 证据里优先给 tag：pin 通常是发布，`refs/heads/release/...` 即便指向同一提交，对读者也说明得更少。
    const named = refsNamingCommit(remote, pin.stdout).sort((a, b) =>
      (a.startsWith('refs/tags/') ? 0 : 1) - (b.startsWith('refs/tags/') ? 0 : 1),
    );
    if (named.length === 0) {
      fail(
        'C1',
        'pin 在远端可达',
        [
          `pin ${pin.stdout.slice(0, 12)} 不在 ${remote.url} 的任何 ref 上 / the pin appears on no remote ref`,
          '推 pin 所属的 tag 或分支，再重跑 / push the tag or branch that carries the pin, then re-run',
        ],
      );
    } else {
      pass('C1', 'pin 在远端可达', [`pin ${pin.stdout.slice(0, 12)} = ${named[0]}`]);
    }
  }

  // ── C2 — READMEs agree, and name a tag that exists locally and remotely ────
  const readmeVersions = readReadmeVersion(root);
  const claims = readmeVersions.map((r) => r.version);
  let claimed = null;
  if (claims.some((v) => !v)) {
    fail(
      'C2',
      'README 两版一致、且写着一个契约 tag',
      readmeVersions.map((r) => `${r.file}: ${r.version ?? r.why}`),
      ['在两版 README 的 `main` 行写上 **vX.Y.Z** / name **vX.Y.Z** on both `main` rows'],
    );
  } else if (new Set(claims).size !== 1) {
    fail(
      'C2',
      'README 两版一致、且写着一个契约 tag',
      readmeVersions.map((r) => `${r.file}: ${r.version}`),
      ['把两版 README 改成同一个版本 / make both READMEs name the same version'],
    );
  } else {
    claimed = claims[0];
  }

  let claimCommit = null;
  if (claimed) {
    const localTag = git(contract, ['rev-parse', '--verify', `refs/tags/${claimed}^{commit}`]);
    if (!localTag.ok) {
      fail(
        'C2',
        'README 两版一致、且写着一个契约 tag',
        [`README 声称 ${claimed}，但契约检出里没有这个 tag / no such tag in the contract checkout`],
        ['git -C Server-NestJS/specs/protocol fetch --tags origin'],
      );
      claimed = null;
    } else {
      claimCommit = localTag.stdout;
      if (!remote.ok) {
        unverified('C2', 'README 声称的 tag 在远端', remote.why);
      } else {
        const remoteTag = remoteTagCommit(remote, claimed);
        if (!remoteTag) {
          fail(
            'C2',
            'README 声称的 tag 在远端',
            [`${claimed} 只在本地，远端没有 / local only, absent from ${remote.url}`],
            [`git -C Server-NestJS/specs/protocol push origin refs/tags/${claimed}`],
          );
        } else if (remoteTag.commit !== claimCommit) {
          fail(
            'C2',
            'README 声称的 tag 在远端',
            [`本地 ${claimed} = ${claimCommit.slice(0, 12)}，远端 = ${remoteTag.commit.slice(0, 12)}`],
          );
        } else {
          pass('C2', 'README 两版一致、且写着一个远端 tag', [`${claimed} = ${claimCommit.slice(0, 12)}`]);
        }
      }
    }
  }

  // ── C3 — the pin sits on that tag, or descends from it without dragging parked work in ──
  if (claimCommit) {
    // The release baseline is read the way a tagger reads it. A tree whose tags cannot be resolved is
    // UNVERIFIED: "no baseline" is not the same as "a baseline that happens to be the right one".
    // 发布基线按打 tag 的人读法来读。解析不出 tag 的树是**未核验**：「没有基线」不等于「基线恰好是对的」。
    const baseline = git(contract, ['describe', '--tags', '--abbrev=0', pin.stdout]);
    if (!baseline.ok) {
      unverified(
        'C3',
        'pin 落在声称的版本线上',
        `git describe --tags 读不出发布基线 / cannot read the release baseline: ${baseline.stderr || `exit ${baseline.status}`}`,
        ['git -C Server-NestJS/specs/protocol fetch --tags origin'],
      );
    } else {
      const baselineLine = `git describe --tags = ${baseline.stdout}`;
      const descends = git(contract, ['merge-base', '--is-ancestor', claimCommit, pin.stdout]);
      const ahead = git(contract, ['rev-list', '--count', `${claimCommit}..${pin.stdout}`]);
      // `merge-base --is-ancestor` answers 1 for "not an ancestor" and >1 for a malfunction; only the
      // latter is UNVERIFIED. Conflating them would report the real failure as an unreadable tree.
      // `--is-ancestor` 以 1 回答「不是祖先」、以 >1 表示故障；只有后者是**未核验**。混为一谈会把真实的
      // 失败说成「树读不出」。
      if (descends.status === null || descends.status > 1 || !ahead.ok) {
        unverified(
          'C3',
          'pin 落在声称的版本线上',
          descends.stderr || '算不出 tag 与 pin 的祖先关系 / cannot resolve ancestry',
        );
      } else if (descends.status === 1) {
        fail(
          'C3',
          'pin 落在声称的版本线上',
          [baselineLine, `pin ${pin.stdout.slice(0, 12)} 不在 ${claimed}（${claimCommit.slice(0, 12)}）的线上`],
          [`把 README 改成 pin 的 tag，或把 pin 移回 ${claimed} / name the pin's tag, or move the pin back`],
        );
      } else {
        const aheadCount = Number(ahead.stdout) || 0;
        if (aheadCount === 0) {
          pass('C3', 'pin 落在声称的版本线上', [baselineLine, `pin = ${claimed}`]);
        } else {
          const dragged = [];
          for (const cap of CAPABILITIES) {
            for (const schema of cap.schemas) {
              const pinHas = treeHas(contract, pin.stdout, schema.path);
              const claimHas = treeHas(contract, claimCommit, schema.path);
              if (pinHas && !claimHas) dragged.push(`${cap.id}: ${schema.path}`);
            }
          }
          if (dragged.length > 0) {
            fail(
              'C3',
              'pin 落在声称的版本线上',
              [
                baselineLine,
                `pin 领先 ${claimed} 有 ${aheadCount} 个提交，且把暂缓能力拖进了快照 / ${aheadCount} ahead, carrying parked capability:`,
                ...dragged,
              ],
              [
                `把 pin 移回 ${claimed} / move the pin back to ${claimed}`,
                '或先实现该能力、再发布 / or implement the capability before releasing it',
              ],
            );
          } else {
            pass('C3', 'pin 落在声称的版本线上', [
              baselineLine,
              `pin 领先 ${claimed} ${aheadCount} 个提交，未引入暂缓能力`,
            ]);
          }
        }
      }
    }
  }

  // ── C4 — the release line descends from the previous release tag ───────────
  if (claimCommit) {
    const tagsOut = git(contract, ['tag', '--list', 'v*', '--sort=version:refname']);
    const tags = tagsOut.ok ? tagsOut.stdout.split('\n').filter(Boolean) : [];
    const claimedV = parseVersion(claimed);
    const previous = tags
      .map((t) => ({ t, v: parseVersion(t) }))
      .filter((x) => x.v && claimedV && compareVersion(x.v, claimedV) < 0)
      .pop();
    if (!tagsOut.ok) {
      unverified('C4', '发布基线是上一个发布 tag', tagsOut.stderr || '读不出 tag 列表');
    } else if (!previous) {
      pass('C4', '发布基线是上一个发布 tag', [`${claimed} 是最早的 tag —— 无上一条基线可核 / first tag, nothing to compare`]);
    } else {
      const based = git(contract, ['merge-base', '--is-ancestor', previous.t, claimCommit]);
      if (based.ok) {
        const onRemote = remote.ok ? remoteTagCommit(remote, previous.t) : null;
        const evidence = [`${previous.t} 是 ${claimed} 的祖先 / ${previous.t} is an ancestor of ${claimed}`];
        if (remote.ok && !onRemote) {
          fail(
            'C4',
            '发布基线是上一个发布 tag',
            [...evidence, `上一条基线 ${previous.t} 不在远端 / previous baseline absent from the remote`],
            [`git -C Server-NestJS/specs/protocol push origin refs/tags/${previous.t}`],
          );
        } else {
          pass('C4', '发布基线是上一个发布 tag', evidence);
        }
      } else if (based.status === 1) {
        fail(
          'C4',
          '发布基线是上一个发布 tag',
          [`${claimed} 不是从 ${previous.t} 切出的 / ${claimed} does not descend from ${previous.t}`],
          ['从上一个 tag 基线切发布线，再打 tag / cut the release from the previous tag, then tag it'],
        );
      } else {
        unverified('C4', '发布基线是上一个发布 tag', based.stderr || `git merge-base exit ${based.status}`);
      }
    }
  }

  // ── C5 — every claimed capability has an implementer ───────────────────────
  if (claimCommit) {
    const claimedCapabilities = [];
    for (const cap of CAPABILITIES) {
      for (const schema of cap.schemas) {
        const inClaim = treeHas(contract, claimCommit, schema.path);
        const inPin = treeHas(contract, pin.stdout, schema.path);
        if (inClaim || inPin) {
          claimedCapabilities.push({
            cap,
            schema,
            where: inClaim ? `${claimed} 的契约树` : 'pin 的树（C3 已记）',
          });
        }
      }
      if (!claimedCapabilities.some((c) => c.cap === cap)) {
        notes.push(`${cap.id} 不在本版契约树里 —— 未声称 / not present in ${claimed}, not claimed`);
      }
    }

    if (claimedCapabilities.length === 0) {
      pass('C5', '声称的能力都有实现方', ['本版契约树不声称任何登记在册的能力 / no registered capability is claimed']);
    } else if (!git(javaRepo, ['rev-parse', '--show-toplevel']).ok) {
      unverified(
        'C5',
        '声称的能力都有实现方',
        `${javaRepo} 不是 git 检出 / not a git checkout — the capability cannot be verified`,
        [
          'git clone https://github.com/rain6fish/KeelBase4J ../KeelBase4J',
          '或设 KEELBASE_JAVA_REPO 指向同级检出 / or point KEELBASE_JAVA_REPO at the sibling checkout',
        ],
      );
    } else {
      const javaRef =
        opts.javaRef ?? (git(javaRepo, ['rev-parse', '--verify', 'main']).ok ? 'main' : 'HEAD');
      const problems = [];
      const evidence = [`Java 读取的 ref = ${javaRef}`];
      for (const { cap, schema, where } of claimedCapabilities) {
        const snapshotPath = path.posix.join(JAVA_SNAPSHOT_DIR, schema.path);
        const snapshot = git(javaRepo, ['cat-file', '-e', `${javaRef}:${snapshotPath}`]).ok;
        const impl = javaImplementation(javaRepo, javaRef, schema.fields);
        if (snapshot && impl.ok) {
          evidence.push(
            `${cap.id} / ${schema.path} —— 声称位置：${where}；Java 快照有该 schema；${impl.file} 声明了全部字段（${schema.fields.join(', ')}）`,
          );
        } else {
          const why = [];
          why.push(`能力 ${cap.id} 声称位置：${where}；Java 没有实现 / claimed, but Java has no implementation`);
          why.push(`schema: ${schema.path}`);
          why.push(
            snapshot
              ? `Java 快照：有 ${snapshotPath}`
              : `Java 快照：缺 ${snapshotPath} / missing from the vendored snapshot`,
          );
          if (impl.ok) {
            why.push(`Java 实现：${impl.file} 声明了全部字段`);
          } else if (impl.error) {
            why.push(`Java 实现：无法核验 / UNVERIFIED —— ${impl.error}`);
          } else if (impl.files.length === 0) {
            why.push(`Java 实现：*.java 里查无 ${schema.fields.join(' / ')} / no Java file declares these fields`);
          } else {
            why.push(
              `Java 实现：含 ${schema.fields[0]} 的文件里没有一份同时含全部字段 / no file carries all fields`,
              ...(impl.detail ?? []).map((d) => `  - ${d}`),
            );
          }
          why.push(`裁决 / decision: ${cap.decision}`);
          why.push(`裁决（中文）: ${cap.decisionZh}`);
          problems.push(why);
        }
      }
      if (problems.length > 0) {
        fail('C5', '声称的能力都有实现方', [...evidence, ...problems.flat()], [
          '去掉声称，或先实现该能力并加一致性测试 / drop the claim, or implement it with a consistency test',
        ]);
      } else {
        pass('C5', '声称的能力都有实现方', evidence);
      }
    }
  }

  for (const n of notes) console.log(`  · ${n}`);
  return finish();
}

function finish() {
  console.log('');
  if (failures.length > 0) {
    console.error(`[contract-release-gate] FAIL —— ${failures.length} 条判据未过：`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('[contract-release-gate] PASS —— 判据全过 / all criteria hold');
  process.exit(0);
}

main();
