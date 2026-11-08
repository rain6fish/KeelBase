#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * Check that a release tag is on main and that its commit ran a green CI.
 *
 * A tag cannot be taken back, and it can be cut from a branch commit that never
 * reached main, or from a commit whose CI never ran — v1.22.0 was both until its
 * release line was merged. This runs on every tag push and fails before any
 * consumer can treat the tag as a release.
 *
 *   node scripts/check-tag-lineage.mjs --tag v1.3.2 --main origin/main --workflow CI
 *
 * Exit codes
 *   0  the tag is on main and has a completed successful CI run
 *   1  the tag is not on main, or its commit has no green CI run
 *   2  the check cannot read its inputs (no tag, no ancestry, no gh)
 *
 * —— 中文 ——
 * 检查发布 tag 是否在 main 上、其提交是否有绿的 CI。
 *
 * tag 收不回来，而它可以打在从未进 main 的分支提交上，或打在 CI 从未跑过的提交上——
 * v1.22.0 在发布线并入 main 之前两者都占。本检查在每次 tag 推送时运行，任何消费方
 * 把它当发布之前，先让它失败。
 *
 *   node scripts/check-tag-lineage.mjs --tag v1.3.2 --main origin/main --workflow CI
 *
 * 退出码
 *   0  tag 在 main 上，且其提交有一次已完成、成功的 CI
 *   1  tag 不在 main 上，或其提交没有绿的 CI
 *   2  输入读不出（无 tag、无祖先关系、无 gh）
 */
import { execFileSync } from 'node:child_process'

function value(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

function stop(code, message) {
  const label = code === 0 ? 'OK' : code === 1 ? 'FAIL' : 'UNKNOWN'
  console.error(`${label} ${message}`)
  process.exit(code)
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('usage: node scripts/check-tag-lineage.mjs --tag <tag> [--main origin/main] [--workflow CI] [--root DIR]')
  process.exit(0)
}

const root = value('--root', process.cwd())
const tag = value('--tag', process.env.GITHUB_REF_NAME || '')
if (!tag) stop(2, 'no --tag and GITHUB_REF_NAME is unset / 未给 --tag，且 GITHUB_REF_NAME 为空')

let commit
try {
  commit = run('git', ['-C', root, 'rev-parse', '--verify', `${tag}^{commit}`])
} catch {
  stop(2, `no such tag: ${tag} / 没有这个 tag：${tag}`)
}

const main = value('--main', (() => {
  try {
    run('git', ['-C', root, 'rev-parse', '--verify', 'origin/main'])
    return 'origin/main'
  } catch {
    return 'main'
  }
})())

try {
  run('git', ['-C', root, 'merge-base', '--is-ancestor', commit, main])
} catch (error) {
  if (error.status === 1) {
    stop(1, `${tag} (${commit.slice(0, 12)}) is not on ${main} — tag a commit that is on main / ${tag} 不在 ${main} 上：请给 main 上的提交打 tag`)
  }
  stop(2, `cannot read ancestry of ${commit} against ${main}: ${error.message} / 读不出 ${commit} 与 ${main} 的祖先关系`)
}

const workflow = value('--workflow', 'CI')
let raw
try {
  raw = run('gh', ['run', 'list', '--commit', commit, '--workflow', workflow, '--limit', '20', '--json', 'status,conclusion'])
} catch (error) {
  stop(2, `cannot read CI runs for ${commit}: ${error.message} / 读不出 ${commit} 的 CI 运行记录`)
}

let runs
try {
  runs = JSON.parse(raw)
} catch {
  stop(2, 'gh returned unreadable JSON / gh 返回的 JSON 读不出')
}

if (!runs.some((r) => r.status === 'completed' && r.conclusion === 'success')) {
  stop(1, `no completed successful ${workflow} run for ${commit} — push main, wait for CI, then tag / ${commit} 没有已完成且成功的 ${workflow} 运行：先推 main、等 CI 绿，再打 tag`)
}

stop(0, `${tag} = ${commit.slice(0, 12)} is on ${main} and has a green ${workflow} run / ${tag} 在 ${main} 上，且有绿的 ${workflow} 运行`)
