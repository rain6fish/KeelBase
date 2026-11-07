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
 *    并报出不再触发的陈旧条目，免得这份文件悄悄烂掉。
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

function runScanner(dir, env) {
  const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'osv-gate-')), 'osv.json');
  const result = spawnSync(
    scannerPath(),
    ['scan', 'source', '-r', dir, '--format', 'json', '--output-file', outFile],
    { encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 },
  );

  if (result.error) {
    unverified(`osv-scanner could not be run (${result.error.code || result.error.message}); pin ${SCANNER_PIN} and set OSV_SCANNER`);
  }
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  // Exit 1 is "vulnerabilities found" and is expected. Anything else — including the 127 a failed
  // network fetch produced when measured — means the scan itself did not happen.
  // 退出码 1 = 找到漏洞，是预期；其余任何码（包括实测到的网络失败时的 127）都表示扫描本身没发生。
  if (result.status !== 0 && result.status !== 1) {
    unverified(`osv-scanner exited ${result.status}\n${stderr.trim() || stdout.trim()}`);
  }
  if (/Error during extraction/i.test(stderr)) {
    unverified(`osv-scanner reported an extraction error\n${stderr.trim()}`);
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

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return new Map();
  const parsed = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const map = new Map();
  for (const entry of parsed.findings || []) {
    map.set(`${entry.lockfile}|${entry.package}|${entry.id}`, entry);
  }
  return map;
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

  const { report, scanned, outFile, stderr } = runScanner(dir, {});
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
  fail('Either upgrade the dependency, or record the exception with `--update-baseline` and say why in the review.');
  fail('请升级该依赖；确实要保留的，跑 `--update-baseline` 登记，并在评审里写明理由。');
}

function writeBaseline(ev) {
  const findings = ev.gated
    .map((f) => ({ lockfile: f.lockfile, package: f.package, version: f.version, id: f.id, severity: f.band }))
    .sort((a, b) => `${a.lockfile}|${a.package}|${a.id}`.localeCompare(`${b.lockfile}|${b.package}|${b.id}`));
  const payload = {
    _note:
      'High/critical findings in production dependencies that existed when the gate landed, so the gate starts green and fails only on new ones. Regenerate with `node scripts/check-dependency-scan.mjs --update-baseline`; each entry needs a reason in the reviewing PR. / 门禁落地时已存在的生产依赖高危/严重发现，使门禁从绿起步、只对新发现判红。用 `--update-baseline` 重生成；每条都要在评审里写明理由。',
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

  const baseline = loadBaseline();
  const verbose = args.includes('--verbose');
  const ev = await evaluate(ROOT, baseline);

  if (args.includes('--update-baseline')) {
    writeBaseline(ev);
    report(ev, { verbose });
    log('baseline updated; re-run without --update-baseline to see the gated verdict');
    return;
  }

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
