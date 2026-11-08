#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Dependency vulnerability gate: osv-scanner over every lockfile in the tree, failing on high and
 * critical findings in *production* dependencies.
 *
 * Until now the only vulnerability check in CI was `npm audit --omit=dev --audit-level=high`, and it
 * read one package tree (`Server-NestJS`). The two web consoles, the Taro app and the Flutter app were
 * never audited at all, so a dependency advisory could reach `main` without anything going red. The
 * 2026-11-05 Java security audit found the same shape on the JVM side and named it the structural gap;
 * this script is the npm/Dart half of closing it.
 *
 * Three things about the implementation are worth knowing before changing it.
 *
 * 1. **A failing scan must never look like a clean scan.** Measured on 2026-11-06 with the OSV API
 *    unreachable: `osv-scanner` still wrote a valid results file containing `results: []` and exited
 *    non-zero. Read only the file, and an offline runner reports zero vulnerabilities. So the gate
 *    probes the OSV API itself before scanning, and treats a failed probe, a scanner exit code outside
 *    {0,1}, or an unparseable report as **未核 (unverified)** — a red run that says so, never a pass.
 *
 * 2. **The severity policy is the one the project already had.** `npm audit --omit=dev
 *    --audit-level=high` gates production dependencies at high. This gate keeps that line: high and
 *    critical in the production closure fail; everything else is counted and reported. Development
 *    dependencies are reported but not gated — see the coverage limits in the handoff report.
 *
 * 3. **Existing debt is recorded, not silenced.** The tree already carries high-severity findings in
 *    shipped front-end dependencies. Failing on them from day one would paint the job permanently red,
 *    and a permanently red gate is a gate nobody reads. They live in
 *    `scripts/dependency-scan-baseline.json`; anything *not* in that file fails. `--update-baseline`
 *    regenerates it, and entries that no longer fire are reported so the file cannot quietly rot.
 *    Every entry also carries `reason`, `owner` and `expiry` (YYYY-MM-DD, +08): an exception nobody
 *    re-decides must not become permanent, so an entry missing any of them or past its expiry is a red
 *    run that names it.
 *
 * 4. **The scan must survive where the checkout lives.** osv-scanner honours `.gitignore`, so a
 *    checkout under a path its enclosing repository ignores — the desktop app puts worktrees at
 *    `.claude/worktrees/<name>`, and this repository's `.gitignore` ignores `.claude/*` — walks zero
 *    directories. Measured 2026-11-08: `1 dirs visited`, exit 128. When the walk finds no sources the
 *    gate retries with `--no-ignore`; if that also finds nothing the run is **未核**, never a pass.
 *
 * Not part of `npm run check:all`: it needs the pinned scanner binary and a network, and a local skip
 * would read exactly like a pass in that summary table. CI is the runner.
 *
 * 依赖漏洞门禁：用 osv-scanner 扫全仓每一份锁文件，生产依赖里的高危/严重判红。
 *
 * 在此之前，CI 里唯一的漏洞检查是 `npm audit --omit=dev --audit-level=high`，而它只读一棵包树
 * （`Server-NestJS`）。两个 Web 控制台、Taro 应用和 Flutter 应用从来没有被审过，于是一条依赖公告
 * 可以悄无声息地进 `main`。2026-11-05 的 Java 安全排查在 JVM 侧看到同一形状并把它点名为结构性缺口；
 * 本脚本是补这个缺口的 npm / Dart 那一半。
 *
 * 改动之前，有三件事值得知道。
 *
 * 1. **扫描失败绝不能被读成扫描干净。** 2026-11-06 实测：OSV API 不通时，`osv-scanner` 仍然写出一份
 *    合法的结果文件，内容是 `results: []`，并以非零码退出。只读文件的话，断网的 runner 会报「零漏洞」。
 *    所以本门禁在扫描前先自己探一次 OSV API，并把「探测失败」「扫描器退出码不在 {0,1}」「报告解析不了」
 *    一律判为**未核** —— 是一次说明理由的红，绝不是通过。
 *
 * 2. **严重度口径沿用项目已有的那条。** `npm audit --omit=dev --audit-level=high` 对生产依赖按 high 判红。
 *    本门禁守同一条线：生产闭包里的 high / critical 判红；其余照实计数并报告。开发依赖只报告、不判红 ——
 *    覆盖边界写在交接件里。
 *
 * 3. **存量债是登记，不是消音。** 这棵树目前确实带着一批已发布前端依赖的 high 级发现。第一天就对它们判红，
 *    会让这个 job 长期挂着红，而长期红着的门禁没人看。它们登记在
 *    `scripts/dependency-scan-baseline.json` 里；**不在**该文件里的一律判红。`--update-baseline` 重生成它，
 *    并报出不再触发的陈旧条目，免得这份文件悄悄烂掉。每条还必须带 `reason`、`owner`、`expiry`
 *    （YYYY-MM-DD，+08）：无人重新裁决的例外不能变成永久例外，缺任一项或已过期都判红并点名。
 *
 * 4. **扫描必须活得过检出所在的位置。** osv-scanner 遵守 `.gitignore`，所以检出若落在其外层仓库忽略的路径下
 *    —— 桌面应用把工作树建在 `.claude/worktrees/<name>`，而本仓 `.gitignore` 忽略 `.claude/*` —— 会零目录
 *    走查（实测 2026-11-08：`1 dirs visited`，退出 128）。走查找不到包源时，门禁改以 `--no-ignore` 重试；
 *    重试仍找不到才算**未核**，绝不写成通过。
 *
 * 它不进 `npm run check:all`：它要钉住的扫描器二进制和网络，而在那张汇总表里本地跳过读起来与通过一模一样。
 * 跑它的是 CI。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = path.join(ROOT, 'scripts', 'dependency-scan-baseline.json');
const PROBE_URL = process.env.OSV_PROBE_URL || 'https://api.osv.dev/v1/query';
const SCANNER_PIN = '2.7.0';

const GATED_BANDS = new Set(['HIGH', 'CRITICAL', 'UNKNOWN']);

/** Every baseline entry must carry these, or the exception silently becomes permanent. */
const TRIAGE_FIELDS = ['reason', 'owner', 'expiry'];

function log(msg) {
  console.log(`[dependency-scan] ${msg}`);
}

function fail(msg) {
  console.error(`[dependency-scan] ${msg}`);
}

/** 未核 is its own outcome: neither a pass nor an ordinary finding. */
function unverified(reason) {
  fail(`未核 (unverified) — ${reason}`);
  fail('未核 (unverified) — this run does NOT prove the tree is clean / 本次运行不证明这棵树干净');
  process.exit(2);
}

function severityBand(cvss) {
  const score = Number.parseFloat(cvss);
  if (!Number.isFinite(score)) return 'UNKNOWN';
  if (score >= 9) return 'CRITICAL';
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MODERATE';
  return 'LOW';
}

/**
 * Ask the OSV API for one answer before trusting anything the scanner says about the tree.
 *
 * Node's own fetch rather than the scanner: the point is to test reachability independently, and node
 * does not honour HTTP(S)_PROXY, so a runner behind a proxy needs NODE_USE_ENV_PROXY or a direct route.
 * The probe query is a package and version the database has nothing against; any well-formed JSON
 * answer — including an empty `{}` — means the API is up.
 */
async function probeOsvApi() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(PROBE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: '0.0.0-osv-probe', package: { name: 'osv-gate-probe', ecosystem: 'npm' } }),
      signal: controller.signal,
    });
    if (!res.ok) return `OSV API answered ${res.status}`;
    await res.json();
    return null;
  } catch (err) {
    return `OSV API unreachable (${err.name === 'AbortError' ? 'timeout' : err.message})`;
  } finally {
    clearTimeout(timer);
  }
}

function scannerPath() {
  return process.env.OSV_SCANNER || 'osv-scanner';
}

/** Paths are compared and reported relative to the repository root, with forward slashes. */
function toRel(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}

/**
 * One directory, one lockfile: when a directory carries both `package-lock.json` and a pnpm/yarn
 * lockfile, CI installs with `npm ci`, so the pnpm/yarn file is a stale local artefact and would only
 * report the same packages twice.
 *
 * 一个目录一份锁文件：目录里同时有 `package-lock.json` 和 pnpm / yarn 锁时，CI 用的是 `npm ci`，
 * 那个 pnpm / yarn 文件只是本地残留，扫它只会把同一批包重复报一遍。
 */
function isShadowed(lockfile) {
  const dir = path.dirname(lockfile);
  const base = path.basename(lockfile);
  if (base === 'package-lock.json') return false;
  return fs.existsSync(path.join(dir, 'package-lock.json'));
}

/**
 * Names a lockfile says are reachable in production. `null` means "this gate cannot tell" — the caller
 * then gates everything the scanner reported rather than letting unknown shapes hide.
 *
 * 锁文件里「生产可达」的那些包名。返回 `null` 表示本门禁判不出来 —— 调用方那时对扫描器报出的全部都判红，
 * 而不是让不认识的形状藏起来。
 */
function productionNames(absLockfile) {
  const base = path.basename(absLockfile);

  if (base === 'package-lock.json') {
    let lock;
    try {
      lock = JSON.parse(fs.readFileSync(absLockfile, 'utf8'));
    } catch {
      return null;
    }
    const version = Number(lock.lockfileVersion || 1);
    if (version < 2) return null; // v1 has no flat package list; treat as unknown rather than guess.
    const names = new Set();
    for (const [key, meta] of Object.entries(lock.packages || {})) {
      if (!key) continue;
      if (meta && meta.dev === true) continue;
      const marker = key.lastIndexOf('node_modules/');
      names.add(marker === -1 ? key : key.slice(marker + 'node_modules/'.length));
    }
    return names;
  }

  if (base === 'pubspec.lock') {
    // Pub's lockfile has no reachability closure: a transitive package pulled in only by a dev
    // dependency is still labelled "transitive". Treating only explicit "direct dev" as dev is the
    // conservative direction — it can over-gate, never under-gate.
    // pub 的锁文件没有可达闭包：只被 dev 依赖引入的传递包也标 "transitive"。只把显式 "direct dev"
    // 当开发依赖是保守方向 —— 可能多判，不会漏判。
    const names = new Set();
    let current = null;
    for (const line of fs.readFileSync(absLockfile, 'utf8').split(/\r?\n/)) {
      const start = /^ {2}([A-Za-z0-9_]+):\s*$/.exec(line);
      if (start) {
        current = start[1];
        continue;
      }
      const kind = /^ {4}dependency:\s*"?([^"#]+?)"?\s*$/.exec(line);
      if (kind && current && kind[1].trim() !== 'direct dev') names.add(current);
      if (/^\S/.test(line)) current = null;
    }
    return names;
  }

  return null;
}

function runScanner(dir, env, { noIgnore = false } = {}) {
  const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'osv-gate-')), 'osv.json');
  const args = ['scan', 'source', '-r', dir, '--format', 'json', '--output-file', outFile];
  if (noIgnore) args.push('--no-ignore');
  const result = spawnSync(
    scannerPath(),
    args,
    { encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 },
  );

  if (result.error) {
    unverified(`osv-scanner could not be run (${result.error.code || result.error.message}); pin ${SCANNER_PIN} and set OSV_SCANNER`);
  }
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  // A failed extraction means the scan did not complete; the retry below must never read it as
  // "nothing to scan". / 提取失败表示扫描没有完成；下面的重试路径不得把它读成「没有可扫的东西」。
  if (/Error during extraction/i.test(stderr)) {
    unverified(`osv-scanner reported an extraction error\n${stderr.trim()}`);
  }
  // osv-scanner honours .gitignore. A checkout that sits under a path its enclosing repository
  // ignores walks zero directories and exits 128 — measured 2026-11-08 on a worktree at
  // .claude/worktrees/<name>, whose enclosing .gitignore ignores .claude/*. That is not a scan
  // failure; the caller retries with --no-ignore (node_modules is skipped natively either way).
  // osv-scanner 遵守 .gitignore。检出若落在其外层仓库忽略的路径下（实测 2026-11-08：工作树位于
  // .claude/worktrees/<name>，外层 .gitignore 忽略 .claude/*），会零目录退出 128。这不是扫描失败，
  // 调用方改以 --no-ignore 重试（两种方式都会原生跳过 node_modules）。
  if (/No package sources found/i.test(`${stdout}\n${stderr}`)) {
    return { report: { results: [] }, scanned: [], outFile, stderr, noSources: true };
  }
  // Exit 1 is "vulnerabilities found" and is expected. Anything else — including the 127 a failed
  // network fetch produced when measured — means the scan itself did not happen.
  // 退出码 1 = 找到漏洞，是预期；其余任何码（包括实测到的网络失败时的 127）都表示扫描本身没发生。
  if (result.status !== 0 && result.status !== 1) {
    unverified(`osv-scanner exited ${result.status}\n${stderr.trim() || stdout.trim()}`);
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  } catch (err) {
    unverified(`osv-scanner produced no readable report (${err.message})`);
  }
  if (!Array.isArray(report.results)) unverified('osv-scanner report has no `results` array');

  // The scanner names every lockfile it read; that list is the honest answer to "what was covered".
  // Its progress log goes to stderr, not stdout — measured 2026-11-06.
  // 扫描器会点名它读过的每一份锁文件，那就是「覆盖了什么」的诚实答案。它的进度日志走 stderr 而非 stdout（实测）。
  const scanned = [...`${stdout}\n${stderr}`.matchAll(/^Scanned (.+) file and found (\d+) packages?$/gm)].map((m) => ({
    abs: m[1],
    file: toRel(m[1]),
    packages: Number(m[2]),
  }));

  return { report, scanned, outFile, stderr };
}

function baselineKey(entry) {
  return `${entry.lockfile}|${entry.package}|${entry.id}`;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return { entries: [], map: new Map() };
  const parsed = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const entries = parsed.findings || [];
  const map = new Map(entries.map((entry) => [baselineKey(entry), entry]));
  return { entries, map };
}

/** Today's date in +08, the timezone the baseline expiry dates are written in. */
function todayInShanghai() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * An exception nobody re-decides is an exception that becomes permanent. Every entry needs a real
 * reason, an owner, and an expiry; an entry past its expiry is no longer accepted, whether or not the
 * finding still fires.
 *
 * 无人重新裁决的例外，会变成永久例外。每条都要有真实理由、责任人与到期日；一旦过期，不论发现是否
 * 仍然触发，都不再算被接受。
 */
function baselineProblems(entries, today = todayInShanghai()) {
  const problems = [];
  for (const entry of entries) {
    const key = `${entry.lockfile} ${entry.package}@${entry.version} ${entry.id}`;
    const missing = TRIAGE_FIELDS.filter((field) => typeof entry[field] !== 'string' || entry[field].trim() === '');
    if (missing.length) {
      problems.push({ key, kind: 'missing', detail: `missing ${missing.join(', ')}` });
      continue;
    }
    const expiry = entry.expiry.trim();
    const parsed = new Date(`${expiry}T00:00:00Z`);
    const wellFormed =
      /^\d{4}-\d{2}-\d{2}$/.test(expiry) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === expiry;
    if (!wellFormed) {
      problems.push({ key, kind: 'invalid-expiry', detail: `expiry "${entry.expiry}" is not a YYYY-MM-DD date` });
    } else if (expiry < today) {
      problems.push({ key, kind: 'expired', detail: `expired on ${expiry} (today is ${today})` });
    }
  }
  return problems;
}

function printBaselineProblems(problems) {
  fail(`FAIL — ${problems.length} baseline entr(y/ies) are untriaged or expired:`);
  for (const p of problems) fail(`  - ${p.key} — ${p.detail}`);
  fail('FAIL — 基线有条目缺理由/责任人/到期，或已过期。');
  fail('Give every entry a real reason, an owner, and an expiry (YYYY-MM-DD, +08); re-decide rather than extending a date.');
  fail('每条都要写真实理由、责任人、到期日（+08）；要延期，先重新裁决。');
}

/**
 * Every reported group, classified. Gated means "would fail if it is not in the baseline".
 * 扫描器报出的每一组，逐条归类。「受门禁约束」= 不在基线里就判红。
 */
function classify(report) {
  const findings = [];
  const skipped = new Set();
  const prodCache = new Map();

  for (const res of report.results) {
    const lockfile = toRel(res.source.path);
    if (isShadowed(res.source.path)) {
      skipped.add(lockfile);
      continue;
    }
    if (!prodCache.has(res.source.path)) prodCache.set(res.source.path, productionNames(res.source.path));
    const prodNames = prodCache.get(res.source.path);

    for (const pkg of res.packages || []) {
      const name = pkg.package?.name;
      const version = pkg.package?.version;
      const inProduction = prodNames === null ? true : prodNames.has(name);
      for (const group of pkg.groups || []) {
        const band = severityBand(group.max_severity);
        findings.push({
          lockfile,
          package: name,
          version,
          id: (group.ids || [])[0] || '(id missing)',
          aliases: group.ids || [],
          band,
          production: inProduction,
          gated: inProduction && GATED_BANDS.has(band),
        });
      }
    }
  }
  return { findings, skipped };
}

async function evaluate(dir, baseline) {
  const probeProblem = await probeOsvApi();
  if (probeProblem) unverified(probeProblem);

  let scan = runScanner(dir, {});
  if (scan.noSources) {
    log('recursive walk found no package sources; retrying with --no-ignore (the checkout may sit under a path its enclosing repository ignores, e.g. .claude/worktrees/*)');
    scan = runScanner(dir, {}, { noIgnore: true });
    if (scan.noSources) unverified('osv-scanner found no package sources in this tree, with or without .gitignore');
  }
  const { report, scanned, outFile, stderr } = scan;
  const { findings, skipped } = classify(report);

  const counts = { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0, UNKNOWN: 0 };
  for (const f of findings) counts[f.band] += 1;

  const gated = findings.filter((f) => f.gated);
  const fresh = gated.filter((f) => !baseline.has(`${f.lockfile}|${f.package}|${f.id}`));
  const known = gated.filter((f) => baseline.has(`${f.lockfile}|${f.package}|${f.id}`));
  const devOnly = findings.filter((f) => !f.production && GATED_BANDS.has(f.band));
  const lower = findings.filter((f) => !GATED_BANDS.has(f.band));

  return { scanned, skipped, counts, gated, fresh, known, devOnly, lower, outFile, stderr };
}

function report(ev, { verbose }) {
  const covered = ev.scanned.filter((s) => !isShadowed(s.abs));
  log(`scanned ${covered.length} lockfile(s):`);
  for (const s of covered) log(`  - ${s.file} (${s.packages} packages)`);
  if (ev.skipped.size) log(`skipped ${ev.skipped.size} shadowed lockfile(s) (a package-lock.json covers the same directory): ${[...ev.skipped].join(', ')}`);

  const fmt = (list) => `${list.length}`;
  log(`high/critical in production dependencies: ${fmt(ev.known)} known, ${fmt(ev.fresh)} new`);
  log(`high/critical in dev-only dependencies: ${fmt(ev.devOnly)} (recorded, not gated — same line as \`npm audit --omit=dev\`)`);
  log(`moderate/low: ${fmt(ev.lower)} (recorded, not gated)`);
  log(`all severities reported: critical ${ev.counts.CRITICAL}, high ${ev.counts.HIGH}, moderate ${ev.counts.MODERATE}, low ${ev.counts.LOW}, unknown ${ev.counts.UNKNOWN}`);

  if (verbose && ev.devOnly.length) {
    log('dev-only high/critical findings (top 10, full list in the artifact):');
    for (const f of ev.devOnly.slice(0, 10)) log(`  - ${f.lockfile} ${f.package}@${f.version} ${f.id} [${f.band}]`);
    if (ev.devOnly.length > 10) log(`  ... ${ev.devOnly.length - 10} more`);
  }
}

function printFresh(list) {
  fail(`FAIL — ${list.length} high/critical finding(s) in production dependencies that the baseline does not record:`);
  for (const f of list) {
    fail(`  - ${f.lockfile} ${f.package}@${f.version} ${f.aliases.join(', ')} [${f.band}]`);
  }
  fail('FAIL — 生产依赖里有上面这些基线未登记的高危/严重发现。');
  fail('Either upgrade the dependency, or record the exception with `--update-baseline` and give it a reason, an owner and an expiry.');
  fail('请升级该依赖；确实要保留的，跑 `--update-baseline` 登记，并补上理由、责任人与到期日。');
}

function writeBaseline(ev, previousEntries = []) {
  const previous = new Map(previousEntries.map((entry) => [baselineKey(entry), entry]));
  const findings = ev.gated
    .map((f) => {
      const old = previous.get(`${f.lockfile}|${f.package}|${f.id}`) || {};
      return {
        lockfile: f.lockfile,
        package: f.package,
        version: f.version,
        id: f.id,
        severity: f.band,
        // Triage survives regeneration; a new entry starts untriaged, which fails the gate until
        // someone gives it a reason, an owner and an expiry.
        // triage 字段随重生成保留；新条目从「未 triage」起步，补齐理由/责任人/到期之前门禁判红。
        reason: old.reason || '',
        owner: old.owner || 'unassigned',
        expiry: old.expiry || '',
      };
    })
    .sort((a, b) => `${a.lockfile}|${a.package}|${a.id}`.localeCompare(`${b.lockfile}|${b.package}|${b.id}`));
  const payload = {
    _note:
      'High/critical findings in production dependencies that existed when the gate landed, so the gate starts green and fails only on new ones. Each entry must carry `reason`, `owner` and `expiry` (YYYY-MM-DD, +08); the gate fails when any is missing or the expiry has passed. `--update-baseline` keeps existing triage and leaves new entries blank. Entries with no assigned owner expire at the current triage checkpoint (2026-11-12); re-decide or clear them by then. / 门禁落地时已存在的生产依赖高危/严重发现，使门禁从绿起步、只对新发现判红。每条必须带 `reason`、`owner`、`expiry`（YYYY-MM-DD，+08）；缺任一项或已过期，门禁判红。`--update-baseline` 保留既有 triage，新条目留空待补。无责任人的条目到期日取当前 triage 检查点（2026-11-12）；届时须重新裁决或清除。',
    generatedAt: new Date().toISOString().slice(0, 10),
    scanner: `osv-scanner v${SCANNER_PIN}`,
    findings,
  };
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  log(`baseline written: ${toRel(BASELINE_FILE)} (${findings.length} finding(s))`);
}

/** Both directions, on fixtures built in the OS temp dir — nothing vulnerable enters a repository lockfile. */
function fixture(dir, pkg, version) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package-lock.json'),
    JSON.stringify(
      {
        name: 'osv-gate-selftest-fixture',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': { name: 'osv-gate-selftest-fixture', version: '1.0.0', dependencies: { [pkg]: version } },
          // `resolved` and `integrity` are what the npm lockfile parser needs to read a version at all;
          // without them the scanner reports "found 1 package" and then finds nothing.
          // 没有这两个字段，锁文件解析器读不出版本；扫描器会说「找到 1 个包」然后什么也报不出来。
          [`node_modules/${pkg}`]: {
            version,
            resolved: `https://registry.npmjs.org/${pkg}/-/${pkg}-${version}.tgz`,
            integrity: `sha512-${'A'.repeat(86)}==`,
          },
        },
      },
      null,
      2,
    ),
  );
}

async function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'osv-gate-selftest-'));
  const empty = new Map();
  let failures = 0;
  const check = (label, ok, detail) => {
    console.log(`[dependency-scan] ${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures += 1;
  };

  // minimist 1.2.5 carries GHSA-xvch-5gv4-984h (CVSS 9.8, critical); 1.2.6 does not. Same package,
  // one patch apart, so the pair differs in exactly the thing the gate is supposed to notice.
  // minimist 1.2.5 带 GHSA-xvch-5gv4-984h（CVSS 9.8，严重）；1.2.6 没有。同一个包相差一个补丁版本，
  // 两者差的正是这道门该注意到的那件事。
  fixture(path.join(tmp, 'vulnerable'), 'minimist', '1.2.5');
  const bad = await evaluate(path.join(tmp, 'vulnerable'), empty);
  check('red: known-vulnerable pin fails the gate', bad.fresh.length > 0, `${bad.fresh.length} new high/critical`);

  fixture(path.join(tmp, 'fixed'), 'minimist', '1.2.6');
  const good = await evaluate(path.join(tmp, 'fixed'), empty);
  check('green: the fixed pin passes', good.fresh.length === 0 && good.gated.length === 0, `${good.fresh.length} new, ${good.gated.length} gated`);

  // The recursive walk must reach a lockfile one level down, and it must do so even when the checkout
  // itself sits under a path its enclosing repository ignores — the desktop app puts worktrees at
  // `.claude/worktrees/<name>`, and this repository's `.gitignore` ignores `.claude/*`.
  // 递归走查必须走到下一层的锁文件；即便检出本身落在其外层仓库忽略的路径下（桌面应用把工作树建在
  // `.claude/worktrees/<name>`，而本仓 `.gitignore` 忽略 `.claude/*`）也必须走到。
  fixture(path.join(tmp, 'nested-plain', 'one', 'two'), 'minimist', '1.2.5');
  const nested = await evaluate(path.join(tmp, 'nested-plain'), empty);
  check('nested lockfile in a plain tree is scanned', nested.fresh.length > 0, `${nested.fresh.length} new high/critical`);

  const trapped = path.join(tmp, 'ignored-checkout');
  fs.mkdirSync(trapped, { recursive: true });
  fs.writeFileSync(path.join(trapped, '.gitignore'), '.claude/*\n');
  fixture(path.join(trapped, '.claude', 'worktrees', 'wt', 'nested'), 'minimist', '1.2.5');
  const retried = await evaluate(trapped, empty);
  check('nested lockfile under a gitignored checkout path is still scanned', retried.fresh.length > 0, `${retried.fresh.length} new high/critical`);

  // Baseline triage: an entry with no reason/owner/expiry, and an entry past its expiry, are both
  // named as red. A complete, unexpired entry passes.
  // 基线 triage：缺理由/责任人/到期的条目、以及已过期的条目，都要被点名判红；完整且未过期的条目通过。
  const complete = {
    lockfile: 'x/package-lock.json',
    package: 'x',
    version: '1.0.0',
    id: 'GHSA-x',
    severity: 'HIGH',
    reason: 'recorded debt',
    owner: 'unassigned',
    expiry: '2099-12-31',
  };
  const missing = baselineProblems([{ ...complete, reason: '', owner: undefined }], '2026-11-08');
  check(
    'red: a baseline entry missing reason/owner/expiry is named',
    missing.length === 1 && missing[0].kind === 'missing' && missing[0].detail.includes('reason') && missing[0].detail.includes('owner'),
    missing[0] ? missing[0].detail : 'no problem reported',
  );
  const expired = baselineProblems([{ ...complete, expiry: '2026-11-01' }], '2026-11-08');
  check(
    'red: an expired baseline entry is named with its date',
    expired.length === 1 && expired[0].kind === 'expired' && expired[0].detail.includes('2026-11-01'),
    expired[0] ? expired[0].detail : 'no problem reported',
  );
  const clean = baselineProblems([complete], '2026-11-08');
  check('green: a complete, unexpired baseline entry passes', clean.length === 0, JSON.stringify(clean));

  // The offline case must be a red "未核", not a green "zero findings".
  // 断网必须是红的「未核」，不能是绿的「零发现」。
  process.env.OSV_PROBE_URL = 'http://127.0.0.1:9/v1/query';
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8' });
  const said = `${child.stdout}${child.stderr}`;
  check(
    'unverified: an unreachable OSV API fails loudly instead of reading as clean',
    child.status === 2 && said.includes('未核'),
    `exit ${child.status}`,
  );

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures) {
    fail(`self-test: ${failures} expectation(s) not met`);
    process.exit(1);
  }
  log('self-test: red, green and 未核 all behave as specified');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();

  const { entries, map: baseline } = loadBaseline();
  const verbose = args.includes('--verbose');

  if (args.includes('--update-baseline')) {
    const ev = await evaluate(ROOT, baseline);
    writeBaseline(ev, entries);
    report(ev, { verbose });
    log('baseline updated; re-run without --update-baseline to see the gated verdict');
    return;
  }

  // Checked before the scan: an untriaged or expired exception is a verdict on the baseline itself,
  // and it must not depend on the network being up.
  // 在扫描之前判：未 triage 或已过期的例外，是对基线本身的判决，不应取决于网络是否可用。
  const problems = baselineProblems(entries);
  if (problems.length) {
    printBaselineProblems(problems);
    process.exit(1);
  }

  const ev = await evaluate(ROOT, baseline);
  report(ev, { verbose });

  const baselineKeys = new Set(baseline.keys());
  const stale = [...baselineKeys].filter((key) => !ev.gated.some((f) => `${f.lockfile}|${f.package}|${f.id}` === key));
  if (stale.length) {
    log(`${stale.length} baseline entr(y/ies) no longer fire — prune them with --update-baseline:`);
    for (const key of stale.slice(0, 10)) log(`  - ${key}`);
  }

  if (ev.fresh.length) {
    printFresh(ev.fresh);
    process.exit(1);
  }
  log('PASS — no high/critical finding in production dependencies outside the baseline');
  log('通过 —— 生产依赖里没有基线之外的高危/严重发现');
}

main().catch((err) => {
  fail(`unexpected failure: ${err.stack || err.message}`);
  process.exit(3);
});
