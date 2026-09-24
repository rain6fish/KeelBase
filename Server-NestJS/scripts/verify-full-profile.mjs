#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * Full 剖面合规 runner（CE-1③ / JV-13 L0）。
 *
 * **⚠ 本文件是过渡副本。** 权威副本在契约仓 `rain6fish/keelbase-contract` 的 `runner/verify-full-profile.mjs`
 * （2026-09-24 迁入，两份只差两行路径：契约在哪、报告写哪）。测试都只读契约，故迁移不影响它们；
 * 本副本留着，是因为本仓的 CI `full-profile` job 经 `proof-full-profile.sh` 调用它。
 *
 * **何时可以删掉这一份**：本仓所钉的 submodule 版本包含 `runner/` 里那个文件之后（改 `proof-full-profile.sh`
 * 指向 submodule 路径即可）。**现在取不到** —— runner 是作为「仓库家具」进契约仓 `main` 的，
 * 而家具不产生 tag，钉版本的消费方自然拿不到。这个规则缺口记在契约仓 `runner/README.md`，尚未裁定。
 * **在裁定前，两份刻意保持一致；改这个文件时请同步改契约仓那份。**
 *
 * 判据来源：docs/protocols/conformance-profile.md §2.2 Full（Core + F1–F5）。
 * 本 runner **只做 Full 的 F4 / F5 两项**（F1–F3 属 Core，由 verify-protocol-conformance.mjs 覆盖）：
 *
 *   F4 wire 形状冻结 —— 实现产出的每一种 wire 载荷，其键集/枚举与 registry schema 一致。
 *      · 离线：registry 每个对象的 samples/* 过其 schema（判据自检，与运行时无关）
 *      · 在线：GET 探针的响应体过 `api-response`；错误响应体过 `error-body`
 *   F5 前端契约面 —— 暴露 `/app/capabilities` + `/app/provenance`，形状符合 schema，
 *      供 Runtime-Neutral 前端按能力（而非 runtime 身份）消费。
 *
 * **语言中性**：只依赖 wire Contract + registry，不假设任何实现细节、不 import 任何实现
 * 源码、不出现 `if (runtime)` 分支。任何 Runtime 指过来都能跑——这是「载体可替换」的
 * 作用③判据（conformance-profile §4）。
 *
 * 用法：
 *   node scripts/verify-full-profile.mjs --base-url http://127.0.0.1:3000 --label ts
 *   node scripts/verify-full-profile.mjs --offline-only          # 只跑判据自检
 * 输出：docs/benchmark/full-profile-<label>-<ts>.json + .md（缺口表）
 * 退出码：0 = 全部通过；1 = 有缺口
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = resolve(__dirname, '../specs/protocol');

/* ─────────── 参数 ─────────── */

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  // 注意用 !== undefined：空串是合法取值（--prefix "" 表示无前缀），不能用真值判断
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const BASE_URL = argOf('base-url', 'http://127.0.0.1:3000').replace(/\/+$/, '');
const PREFIX = argOf('prefix', '/api/v1');
const LABEL = argOf('label', (() => {
  try { const u = new URL(BASE_URL); return `${u.hostname}_${u.port}`; } catch { return 'target'; }
})());
const OUT_DIR = resolve(argOf('out', resolve(__dirname, '../docs/benchmark')));
const OFFLINE_ONLY = argv.includes('--offline-only');

/* ─────────── registry + ajv ───────────
 * schema 加载与 src/common/wire-schema/wire-schema.spec.ts 同一方式（避免两套判据）：
 * 单实例、以各 schema 的 $id 为键（版本间同名文件 $id 不同，不冲突）。
 * validateSchema:false —— 不加载 draft-07 meta 校验 schema 本体（其 $schema 仅供自述）。 */

const registry = JSON.parse(readFileSync(join(SPECS_DIR, 'wire-schema-registry.json'), 'utf8'));
const objects = registry.objects;
const SCHEMAS_ROOT = resolve(SPECS_DIR, registry.schemasDir);
const schemaIdOf = (objId) => objects.find((o) => o.id === objId)?.schema ?? objId;

const loadFailures = [];
const schemasById = new Map();
for (const f of readdirSync(SCHEMAS_ROOT, { recursive: true })) {
  if (!String(f).endsWith('.schema.json')) continue;
  const schema = JSON.parse(readFileSync(join(SCHEMAS_ROOT, f), 'utf8'));
  if (!schema.$id) { loadFailures.push(`schema 缺 $id: ${f}`); continue; }
  schemasById.set(schema.$id, schema);
}

const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
addFormats(ajv);
for (const [id, schema] of schemasById) {
  try { ajv.addSchema(schema, id); } catch (e) { loadFailures.push(`schema 非法: ${id} — ${String(e).split('\n')[0]}`); }
}

/** 以 $id 校验一份数据。返回 {ok, errors} */
function validate(schemaId, data) {
  const v = (() => { try { return ajv.getSchema(schemaId); } catch { return undefined; } })();
  if (!v) return { ok: false, errors: [`schema 未注册：${schemaId}`] };
  const ok = v(data);
  const errors = ok ? [] : (v.errors ?? []).slice(0, 6).map((e) => `${e.instancePath || '/'} ${e.message}`);
  return { ok, errors };
}

/* ─────────── 结果收集 ─────────── */

const results = [];
const record = (profile, name, pass, detail = '') => {
  results.push({ profile, name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} [${profile}] ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log(`═══ Full 剖面合规（F4 + F5）═══\n目标：${BASE_URL}${OFFLINE_ONLY ? '（仅离线判据自检）' : ''}\n`);

/* ═══════════ F4 离线：registry 样本 × schema（判据自检） ═══════════ */

console.log('─ F4 离线：registry 样本 × schema（判据自检，与运行时无关）─');

let sampleChecked = 0;
let sampleBad = 0;
for (const obj of objects) {
  const samples = obj.samples ?? [];
  if (samples.length === 0) {
    record('F4', `样本 ${obj.id}`, false, 'registry 未登记 samples');
    sampleBad++;
    continue;
  }
  for (const rel of samples) {
    const P = join(SPECS_DIR, rel);
    if (!existsSync(P)) {
      record('F4', `样本 ${obj.id}`, false, `样例文件不存在：${rel}`);
      sampleBad++;
      continue;
    }
    const { ok, errors } = validate(obj.schema, JSON.parse(readFileSync(P, 'utf8')));
    sampleChecked++;
    if (!ok) {
      record('F4', `样本 ${obj.id}`, false, errors.join(' ｜ '));
      sampleBad++;
    }
  }
}
record('F4', 'registry 全部对象样本过其 schema', sampleBad === 0, `${sampleChecked} 份样本（${objects.length} 对象），${sampleBad} 处不符`);
if (loadFailures.length) record('F4', 'schema 全部注册成功', false, loadFailures.join(' | '));

/* ═══════════ F4 / F5 在线探针 ═══════════ */

async function probe(path) {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json', connection: 'close' } });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    return { url, status: res.status, ok: res.ok, body, raw: text.slice(0, 300), contentType: res.headers.get('content-type') ?? '' };
  } catch (e) {
    return { url, status: 0, ok: false, body: null, raw: String(e.message), contentType: '' };
  }
}

if (!OFFLINE_ONLY) {
  console.log('\n─ F4 在线：信封 / 错误形状 ─');

  const probed = {};
  for (const path of [`${PREFIX}/app/capabilities`, `${PREFIX}/app/provenance`]) {
    const r = await probe(path);
    probed[path] = r;
    if (r.status !== 200) {
      record('F4', `信封 ${path}`, false, `HTTP ${r.status}${r.status === 0 ? `（${r.raw}）` : ''}`);
      continue;
    }
    const { ok, errors } = validate(schemaIdOf('api-response'), r.body);
    record('F4', `信封 ${path}`, ok, ok ? 'api-response ✓' : errors.join(' ｜ '));
  }

  // 错误形状：故意打一个不存在的路径，取 4xx 响应体（不依赖任何实现细节）
  const e = await probe(`${PREFIX}/__full-profile-probe-not-found__`);
  if (e.status === 0) {
    record('F4', '错误形状 error-body', false, `探针不可达：${e.raw}`);
  } else if (e.status < 400) {
    record('F4', '错误形状 error-body', false, `期望 4xx，实得 ${e.status}`);
  } else {
    const { ok, errors } = validate(schemaIdOf('error-body'), e.body);
    record('F4', '错误形状 error-body', ok, ok ? `HTTP ${e.status} ✓` : errors.join(' ｜ '));
  }

  console.log('\n─ F5 前端契约面 ─');

  const f5 = [
    { path: `${PREFIX}/app/capabilities`, objId: 'capabilities' },
    { path: `${PREFIX}/app/provenance`, objId: 'app-provenance' },
  ];
  for (const p of f5) {
    const r = probed[p.path] ?? (await probe(p.path));
    if (r.status !== 200) {
      record('F5', `端点 ${p.objId}`, false, `HTTP ${r.status}${r.status === 0 ? `（${r.raw}）` : ''}`);
      continue;
    }
    // data 恒存在（可能 null）；本族端点按契约返回对象
    const payload = r.body && Object.prototype.hasOwnProperty.call(r.body, 'data') ? r.body.data : null;
    if (payload === null) {
      record('F5', `端点 ${p.objId}`, false, '信封内 data 为 null（该端点应返回对象）');
      continue;
    }
    const { ok, errors } = validate(schemaIdOf(p.objId), payload);
    record('F5', `端点 ${p.objId}`, ok, ok ? '形状 ✓' : errors.join(' ｜ '));
  }
}

/* ═══════════ 报告 ═══════════ */

const passCount = results.filter((r) => r.pass).length;
const gaps = results.filter((r) => !r.pass);
const ts = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(OUT_DIR, { recursive: true });
const base = join(OUT_DIR, `full-profile-${LABEL}-${ts}`);

const report = {
  gate: 'Conformance Full 剖面（F4 + F5；CE-1③ / JV-13 L0）',
  criteria: 'docs/protocols/conformance-profile.md §2.2 Full',
  target: { baseUrl: BASE_URL, prefix: PREFIX, label: LABEL, offlineOnly: OFFLINE_ONLY },
  registry: { version: registry.registryVersion, objects: objects.length },
  date: ts,
  pass: passCount,
  total: results.length,
  gaps: gaps.map((g) => ({ profile: g.profile, name: g.name, detail: g.detail })),
  cases: results,
};
writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));

const md = [
  `# Full 剖面合规缺口表 — ${LABEL}（${ts}）`,
  '',
  `- 判据：\`docs/protocols/conformance-profile.md\` §2.2 **Full**（F4 wire 形状 + F5 前端契约面）`,
  `- 目标：\`${BASE_URL}\`（前缀 \`${PREFIX}\`）${OFFLINE_ONLY ? '｜**仅离线判据自检**' : ''}`,
  `- 结果：**${passCount}/${results.length}** 通过 ｜ 缺口 **${gaps.length}** 项`,
  '',
  '## 全部判定',
  '',
  '| # | 剖面 | 判定项 | 结果 | 详情 |',
  '|---|---|---|---|---|',
  ...results.map((r, i) => `| ${i + 1} | ${r.profile} | ${r.name} | ${r.pass ? '✅' : '❌'} | ${r.detail} |`),
  '',
  ...(gaps.length
    ? ['## 缺口表（需要实现的）', '', '| 剖面 | 缺口 | 证据 |', '|---|---|---|', ...gaps.map((g) => `| ${g.profile} | ${g.name} | ${g.detail} |`), '']
    : ['**无缺口**——该目标满足 Full 剖面 F4 + F5。', '']),
].join('\n');
writeFileSync(`${base}.md`, md);

console.log(`\n═══ Full 剖面：${passCount}/${results.length} 通过 ｜ 缺口 ${gaps.length} 项 ═══`);
console.log(`报告：${base}.md`);

// 不用 process.exit()：在 Windows 上它会在 fetch/undici 的 socket 仍处于关闭中时触发
// libuv 断言（!(handle->flags & UV_HANDLE_CLOSING)），把进程退出码打成 127，CI 用不了。
// 改为设置 exitCode 并让事件循环自然排空（探针已发 connection: close，socket 会关闭）。
process.exitCode = gaps.length === 0 ? 0 : 1;
