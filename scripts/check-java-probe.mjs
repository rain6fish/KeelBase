#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * Java 探针观察 — keelbase-java-starter 需求信号采集（KeelBase4J 启动的触发依据）
 *
 * 观察对象：keelbase-java-starter（Maven Central `cn.com.keelbase:*` 7 构件 + GitHub `rain6fish/KeelBase-java-starter`）。
 * 信号：
 *   - 发布状态：Maven Central 各构件是否在线 + 最新版本（repo1 目录/元数据，比 search API 索引可靠）
 *   - 采纳信号：GitHub stars / forks / open issues / 活跃度；Maven 下载量（如需精确值，人工查 mvnrepository 页面）
 *   - 关键触发信号（人工补充）：集成商反馈「产品好，但整体不是 Java 无法立项」——这是启动 Java 版 KeelBase 的唯一依据
 *
 * 用法：node scripts/check-java-probe.mjs
 * 环境变量：GH_TOKEN（可选，GitHub API 匿名限流 60/h 通常够用）
 * 报告：docs/benchmark/java-probe-<ts>.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GH_TOKEN = process.env.GH_TOKEN || '';
const REPO = 'rain6fish/KeelBase-java-starter';
const GROUP_PATH = 'cn/com/keelbase';
const ARTIFACTS = [
  'keelbase-client',
  'keelbase-compensation',
  'keelbase-delegation-filter',
  'keelbase-java-starter-parent',
  'keelbase-spring-boot-autoconfigure',
  'keelbase-spring-boot-starter',
  'keelbase-tools-annotation',
  'keelbase-tools-export',
];

const startMs = Date.now();
const log = (s) => console.log(s);

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** 拉取 Maven Central 构件元数据（maven-metadata.xml），返回最新版本与版本列表 */
async function probeArtifact(artifactId) {
  const url = `https://repo1.maven.org/maven2/${GROUP_PATH}/${artifactId}/maven-metadata.xml`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return { artifactId, online: false, status: res.status, latest: null, versions: [] };
  const xml = await res.text();
  const latest = (xml.match(/<latest>([^<]+)<\/latest>/) || [])[1] || null;
  const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
  return { artifactId, online: true, status: res.status, latest, versions };
}

/** GitHub 仓库采纳信号 */
async function probeGithub() {
  const headers = GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {};
  const repo = await fetchJson(`https://api.github.com/repos/${REPO}`, headers);
  return {
    repo: repo.full_name,
    stars: repo.stargazers_count ?? null,
    forks: repo.forks_count ?? null,
    openIssues: repo.open_issues_count ?? null,
    createdAt: repo.created_at ?? null,
    pushedAt: repo.pushed_at ?? null,
    description: repo.description ?? null,
  };
}

async function main() {
  log(`═══ Java 探针观察：keelbase-java-starter 需求信号 ═══`);
  log(`Maven Central ${GROUP_PATH}:*（${ARTIFACTS.length} 构件）· GitHub ${REPO}\n`);

  const artifacts = [];
  for (const a of ARTIFACTS) {
    try {
      const p = await probeArtifact(a);
      artifacts.push(p);
      if (p.online) {
        log(`  ✓ ${a} — online, latest=${p.latest ?? '?'}, versions=${p.versions.length}`);
      } else {
        log(`  ✗ ${a} — 不在 repo1（status=${p.status}）`);
      }
    } catch (e) {
      artifacts.push({ artifactId: a, online: false, status: null, latest: null, versions: [], error: e.message });
      log(`  ✗ ${a} — 探测失败（${e.message}）`);
    }
  }

  const onlineCount = artifacts.filter((a) => a.online).length;

  let github = null;
  try {
    github = await probeGithub();
    log(`\n  GitHub ${github.repo}: ⭐${github.stars} 🍴${github.forks} 开issue ${github.openIssues} · 最后推送 ${github.pushedAt}`);
  } catch (e) {
    log(`\n  ✗ GitHub 探测失败（${e.message}）——网络受限或限流`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshot = {
    gate: 'Java 探针观察：keelbase-java-starter 需求信号快照',
    date: timestamp,
    repo: REPO,
    groupPath: GROUP_PATH,
    artifactsOnline: `${onlineCount}/${ARTIFACTS.length}`,
    artifacts,
    github,
    note: '触发 KeelBase4J 启动的信号 = 集成商反馈「产品好，但整体不是 Java 无法立项」（需求驱动，非可行性驱动）；采纳信号（下载量/star/集成商 PoC）达门槛前不另立 Java 版模块。',
  };
  mkdirSync(resolve(__dirname, '../docs/benchmark'), { recursive: true });
  writeFileSync(resolve(__dirname, `../docs/benchmark/java-probe-${timestamp}.json`), JSON.stringify(snapshot, null, 2));
  log(`\n═══ 探针快照：构件 ${onlineCount}/${ARTIFACTS.length} 在线（${Math.round((Date.now() - startMs) / 1000)}s）═══`);
  log(`报告：docs/benchmark/java-probe-${timestamp}.json`);
  process.exit(onlineCount === ARTIFACTS.length ? 0 : 1);
}

main().catch((e) => { console.error(`✗ 失败：${e.message}`); process.exit(1); });
