#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * Full 剖面静态探针（JV-13 L0）：跨仓核查「某 runtime 是否满足 Full 合规剖面」。
 *
 * **为什么需要**：`docs/protocols/conformance-profile.md` §2.2 写明「**Java Phase-1 最低合规 = Full**
 * （Core + F1–F5）」，且 F5 的定位句就是「**统一前端可接第二 Runtime 的前置**」。但这条判据
 * **从未指向过 Java**——Java 侧只跑了 Core 向量，Full 的 F4/F5 没有任何机器判据能显示「差多少」。
 * 本探针补的正是这张**缺口表**。
 *
 * **L0 的性质（必读，防被读成运行时合规）**：只读源码，**不起服务、不抓载荷**。它能回答
 * 「端点/信封**在不在**」，**不能**回答「载荷**对不对**」（键集/枚举、值域、错误形状）——
 * 后者属 L1–L3 运行时判决，见 `KeelBase-统一前端接JavaRuntime-最小验证设计_2026-09-18.md`。
 *
 * **判据自证**：对**本仓（TS）应全绿**——TS 确有这些端点与信封。TS 若出现缺口，说明**判据写错了**
 * 而非 TS 不合规，退出码 **2**（优先于被检方缺口）。
 *
 * 用法（需两仓同机；默认不进 CI——CI 只见单仓，与 `check-java-vector-sync.mjs` 同）：
 *   node scripts/verify-full-conformance.mjs [--java <dir>] [--json <out>] [--allow-gaps]
 *   默认 Java 仓 = ../KeelBase4J（或环境变量 KEELBASE_JAVA_REPO）；缺席则 Java 列跳过
 *   --allow-gaps：Java 有缺口时仍退出 0（用于「先落基线、后补缺口」的窗口）
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

/* ───────────────── 通用读取 ───────────────── */

/**
 * 行尾归一（CRLF → LF）后读。本仓无 `.gitattributes`，本机 `core.autocrlf` 会把工作区置成 CRLF；
 * 不归一会把行尾差异误报成内容差异（同 `check-java-vector-sync.mjs` 的 2026-09-17 实测教训）。
 */
export function readText(file) {
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

/** 递归收集文件；`match(name)` 为真才收。跳过 node_modules / target / dist / 点目录。 */
export function collectFiles(dir, match, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'target' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectFiles(p, match, acc);
    else if (match(name)) acc.push(p);
  }
  return acc;
}

/* ───────────────── 路由提取（两侧各一套） ───────────────── */

/**
 * TS 路由：`@Controller('x')` 与 `@Controller({ path: 'x' })` 两种写法 + 方法级装饰器。
 * 只做静态字符串提取（不做 AST）——本仓 **52/53** 个 controller 用对象形式。
 *
 * **按 `@Controller(` 切块**，而不是「取文件里第一个 controller 套用到全文」——
 * 后者在**一文件多 controller** 时会把后者的路由挂到前者的路径下（2026-09-18 单测抓到）。
 */
export function extractTsRoutes(files, read = readText) {
  const routes = [];
  for (const file of files) {
    for (const block of read(file).split(/(?=@Controller\()/)) {
      const ctrl =
        /@Controller\(\s*\{\s*path:\s*'([^']*)'/.exec(block)?.[1] ??
        /@Controller\(\s*'([^']*)'/.exec(block)?.[1];
      if (ctrl === undefined) continue;
      for (const m of block.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
        const parts = [ctrl, m[2]].filter(Boolean);
        routes.push({ method: m[1].toUpperCase(), path: `/${parts.join('/')}`, file: relative(ROOT, file) });
      }
    }
  }
  return routes;
}

/**
 * Java 路由：类级 `@RequestMapping("x")`（可选）+ 方法级 `@GetMapping("y")` 等。
 * 同 TS：**按 `@RestController` 切块**，避免多 controller 同文件时前缀串味。
 */
export function extractJavaRoutes(files, read = readText) {
  const routes = [];
  for (const file of files) {
    for (const block of read(file).split(/(?=@RestController)/)) {
      if (!block.includes('@RestController')) continue;
      const base = /@RequestMapping\(\s*"([^"]*)"/.exec(block)?.[1] ?? '';
      for (const m of block.matchAll(/@(Get|Post|Put|Patch|Delete)Mapping\(\s*(?:value\s*=\s*)?"([^"]*)"/g)) {
        const parts = [base, m[2]].filter(Boolean).map((s) => s.replace(/^\/+|\/+$/g, ''));
        routes.push({ method: m[1].toUpperCase(), path: `/${parts.join('/')}`, file: relative(ROOT, file) });
      }
    }
  }
  return routes;
}

/* ───────────────── 判据 ───────────────── */

/** F1–F3：Core 之上的薄片向量是否在场（治理绑定 / 失败语义 / 确认生命周期）。 */
export const SLICE_VECTORS = [
  'governance-binding-v1-vector.json',
  'failure-semantics-v1-vector.json',
  'confirmation-lifecycle-v1-vector.json',
];

export function checkSliceVectors(vectorDir) {
  return SLICE_VECTORS.map((id) => ({ id, present: existsSync(join(vectorDir, id)) }));
}

/**
 * F4a：`api-response` 信封是否有**实现产出点**。静态判据 = 在候选文件里找到统一响应包装实现。
 * （只判「在不在」；信封字段是否齐、`code` 取值是否合规，属 L1+ 运行时。）
 * 证据优先非 `.spec.` / `.test.` 文件——测试文件引用类型名会造成误读。
 */
export function checkEnvelope(files, read = readText, marker = /ApiResponse|ResponseInterceptor/) {
  const hits = files.filter((f) => marker.test(read(f).slice(0, 8000)));
  const impl = hits.filter((f) => !/\.spec\.|\.test\./.test(f));
  return { present: hits.length > 0, evidence: (impl.length ? impl : hits).slice(0, 3).map((f) => relative(ROOT, f)) };
}

/**
 * 全局路由前缀。**装饰器里的路径是相对于全局前缀的**，两者拼接才是真实 URL。
 * 从前缀来源读（TS: main.ts 的 `setGlobalPrefix` + `defaultVersion`；Java: `server.servlet.context-path`），
 * **不从路由反推**——否则会把「有前缀」误报成「无前缀」（TS 上一版即如此）。
 */
export function extractGlobalPrefix(text, kind) {
  if (kind === 'ts') {
    const base = /setGlobalPrefix\(\s*'([^']+)'/.exec(text)?.[1];
    if (!base) return null;
    const v = /defaultVersion:\s*'([^']+)'/.exec(text)?.[1];
    return `/${base.replace(/^\/+|\/+$/g, '')}${v ? `/v${v}` : ''}`;
  }
  const p = /context-path[:=]\s*([^\s"']+)/.exec(text)?.[1];
  return p ? `/${p.replace(/^\/+|\/+$/g, '')}` : null;
}

/** F5：前端契约面两个端点。全局前缀差异单列为 INFO（`globalPrefix`），不判 FAIL。 */
export function checkFrontendContract(routes) {
  return ['app/capabilities', 'app/provenance'].map((id) => {
    const want = new RegExp(`(^|/)${id.replace('/', '\\/')}$`);
    const found = routes.filter((r) => want.test(r.path));
    return { id, present: found.length > 0, paths: found.map((r) => `${r.method} ${r.path}`) };
  });
}

/* ───────────────── 探针 ───────────────── */

export function probeRuntime(subject, read = readText) {
  const { label, routeFiles, envelopeFiles, vectorDir, extractRoutes, prefixKind, prefixText } = subject;
  const routes = extractRoutes(routeFiles, read);
  return {
    label,
    routeFiles: routeFiles.length,
    routes,
    sliceVectors: checkSliceVectors(vectorDir),
    envelope: checkEnvelope(envelopeFiles, read, subject.envelopeMarker),
    frontendContract: checkFrontendContract(routes),
    globalPrefix: prefixText ? extractGlobalPrefix(prefixText, prefixKind) : null,
  };
}

/** 折成缺口表（L0 的交付物）。 */
export function gapsOf(probe) {
  const gaps = [];
  for (const v of probe.sliceVectors) if (!v.present) gaps.push({ area: 'F1–F3', id: v.id, why: '薄片向量不在场' });
  if (!probe.envelope.present) gaps.push({ area: 'F4', id: 'api-response 信封', why: '未找到统一响应包装的实现产出点' });
  for (const c of probe.frontendContract) if (!c.present) gaps.push({ area: 'F5', id: c.id, why: '端点未暴露' });
  return gaps;
}

/* ───────────────── CLI ───────────────── */

function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const allowGaps = argv.includes('--allow-gaps');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonOut = resolve(ROOT, arg('--json', `docs/benchmark/full-conformance-${stamp}.json`));

  const ts = probeRuntime({
    label: 'TS（Server-NestJS，参考实现）',
    routeFiles: collectFiles(join(ROOT, 'Server-NestJS/src'), (n) => n.endsWith('.controller.ts')),
    envelopeFiles: collectFiles(join(ROOT, 'Server-NestJS/src/common'), (n) => n.endsWith('.ts')),
    vectorDir: join(ROOT, 'Server-NestJS/specs/protocol'),
    extractRoutes: extractTsRoutes,
    envelopeMarker: /ApiResponse|ResponseInterceptor/,
    prefixKind: 'ts',
    prefixText: existsSync(join(ROOT, 'Server-NestJS/src/main.ts')) ? readText(join(ROOT, 'Server-NestJS/src/main.ts')) : '',
  });

  const javaRepo = resolve(ROOT, arg('--java', process.env.KEELBASE_JAVA_REPO ?? '../KeelBase4J'));
  const javaSrc = join(javaRepo, 'keelbase4j-runtime/src/main/java');
  const java = existsSync(javaSrc)
    ? probeRuntime({
        label: `Java（${relative(ROOT, javaRepo) || '.'}）`,
        routeFiles: collectFiles(javaSrc, (n) => n.endsWith('.java')),
        envelopeFiles: collectFiles(javaSrc, (n) => n.endsWith('.java')),
        vectorDir: join(javaRepo, 'conformance/vectors'),
        extractRoutes: extractJavaRoutes,
        prefixKind: 'java',
        prefixText: collectFiles(join(javaRepo, 'keelbase4j-runtime/src/main/resources'), (n) => /^application.*\.(properties|ya?ml)$/.test(n))
          .map(readText)
          .join('\n'),
      })
    : null;

  console.log('═══ Full 剖面静态探针（JV-13 L0 · 只读源码，不判载荷形状）═══\n');
  for (const p of [ts, ...(java ? [java] : [])]) {
    const g = gapsOf(p);
    console.log(`── ${p.label}`);
    console.log(`   路由源文件 ${p.routeFiles} · 暴露路由 ${p.routes.length} 条 · 全局前缀 ${p.globalPrefix ?? '(未声明)'}（下列路由为装饰器相对路径）`);
    console.log(`   F1–F3 薄片向量：${p.sliceVectors.filter((v) => v.present).length}/${p.sliceVectors.length}`);
    console.log(`   F4a api-response 信封：${p.envelope.present ? '在' : '缺'}${p.envelope.evidence.length ? `（${p.envelope.evidence.join(', ')}）` : ''}`);
    for (const c of p.frontendContract) console.log(`   F5 ${c.id}：${c.present ? `在（${c.paths.join(', ')}）` : '缺'}`);
    console.log(`   → 缺口 ${g.length} 项${g.length ? `：${g.map((x) => `[${x.area}] ${x.id}`).join(' · ')}` : ''}\n`);
  }
  if (!java) console.log('⚠ Java 仓未找到（--java <dir> 或 KEELBASE_JAVA_REPO）——Java 列跳过。\n');

  const tsGaps = gapsOf(ts);
  const javaGaps = java ? gapsOf(java) : [];

  mkdirSync(dirname(jsonOut), { recursive: true });
  writeFileSync(jsonOut, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    tier: 'Full（静态部分：F1–F5 的「在不在」；载荷形状需 L1+ 运行时）',
    ts: { ...ts, gaps: tsGaps },
    java: java ? { ...java, gaps: javaGaps } : null,
  }, null, 2)}\n`);
  console.log(`报告：${relative(ROOT, jsonOut)}`);

  if (tsGaps.length > 0) {
    console.error(`\n✗ 判据自证失败：TS 侧有 ${tsGaps.length} 项缺口——说明**判据写错了**，先修探针。`);
    process.exit(2);
  }
  if (javaGaps.length > 0) {
    console.error(`\n✗ Java 侧 ${javaGaps.length} 项缺口（TS 侧全绿 = 判据成立）——即 JV-13 L0 的缺口表。`);
    process.exit(allowGaps ? 0 : 1);
  }
  console.log('\n✓ 两侧均无静态缺口（载荷形状仍需 L1+ 运行时验证）');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
