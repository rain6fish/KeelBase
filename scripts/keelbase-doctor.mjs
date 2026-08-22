#!/usr/bin/env node
/**
 * KeelBase doctor — 诊断 KeelBase 应用（来源清单 + 运行时能力体检）。
 *
 * 只读、确定性、零网络零 DB。检查五类：
 *   1. 完整性：.keelbase/manifest.json 存在、schema 受支持、必需字段齐全
 *   2. 一致性：manifest 列出的生成模块在仓库中是否仍有对应目录
 *   3. 运行时兼容：基座运行时能力（AI 工具 / CASL / 治理 / 审计 / Agent）是否在位
 *   4. 生成器版本：manifest 记录版本 vs 当前 CLI 版本（升级可用 / 不兼容警示）
 *   5. 兼容矩阵：manifest 协议/schema vs 当前 CLI 支持的协议/schema（协议匹配深化）
 *
 * 输出 PASS/WARN/FAIL + 退出码（0 = 无 FAIL；1 = 有 FAIL 或非 KeelBase）。
 *
 * 用法：
 *   node scripts/keelbase-doctor.mjs              # 诊断当前目录
 *   node scripts/keelbase-init.mjs doctor         # 等价的 CLI 子命令
 *   keelbase doctor                               # npm 安装后
 */
import { access } from 'node:fs/promises';
import { readManifest, manifestPath, generatorVersion, MANIFEST_SCHEMA, MANIFEST_IDENTITY, MANIFEST_PROTOCOL } from './generator/manifest.mjs';

const C = { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m' };

const HELP = `KeelBase doctor — 诊断 KeelBase 应用（来源清单 + 运行时能力体检）

用法:
  node scripts/keelbase-doctor.mjs              # 诊断当前目录
  node scripts/keelbase-init.mjs doctor         # 等价的 CLI 子命令

检查: ① 完整性（manifest/schema/字段）② 一致性（生成模块目录）③ 运行时兼容（基座能力）
      ④ 生成器版本（manifest vs 当前 CLI）⑤ 兼容矩阵（协议/schema vs 当前 CLI 支持）
退出码: 0 = 无 FAIL；1 = 有 FAIL 或非 KeelBase
`;

/** 运行时兼容所需的核心基座能力（目录存在性检测）。 */
const REQUIRED_RUNTIME = [
  { name: 'AI Tools', path: 'Server-NestJS/src/ai/tools' },
  { name: 'CASL Permission', path: 'Server-NestJS/src/common/casl' },
  { name: 'Governance', path: 'Server-NestJS/src/ai/governance' },
  { name: 'AI Audit', path: 'Server-NestJS/src/ai/audit' },
  { name: 'Operation Audit', path: 'Server-NestJS/src/operation-audit' },
  { name: 'Agent Runtime', path: 'Server-NestJS/src/ai' },
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** 简单三/四段版本比较：a<b → -1，a>b → 1，a==b → 0。 */
function cmpVersion(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function report(checks) {
  let fail = 0;
  let warn = 0;
  for (const c of checks) {
    if (c.status === 'fail') fail += 1;
    if (c.status === 'warn') warn += 1;
    const mark =
      c.status === 'pass' ? `${C.green}✓${C.reset}` : c.status === 'warn' ? `${C.yellow}⚠${C.reset}` : `${C.red}✗${C.reset}`;
    console.log(`  ${mark} ${c.name.padEnd(10)} ${C.dim}${c.detail}${C.reset}`);
  }
  console.log('');
  const verdict = fail === 0 ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`;
  console.log(`── Result ── ${verdict}（${fail} fail, ${warn} warn）`);
  return fail === 0 ? 0 : 1;
}

export async function runDoctor(argv = []) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }

  const man = await readManifest();
  if (!man) {
    console.log(`${C.red}✗ 非 KeelBase 应用${C.reset}：缺少 ${manifestPath()}（来源清单缺失）`);
    console.log(`  由 keelbase init 生成——node scripts/keelbase-init.mjs --module <name> 会在项目根写 .keelbase/manifest.json`);
    return 1;
  }
  if (man.schema !== MANIFEST_SCHEMA) {
    console.log(`${C.red}✗ 不支持的 manifest schema ${man.schema}${C.reset}（当前支持 ${MANIFEST_SCHEMA}；可能是更新版本创建，请升级 keelbase）`);
    return 1;
  }

  console.log(`${C.green}KeelBase Doctor${C.reset}`);
  console.log('────────────────────');
  console.log(`Manifest:  ${manifestPath()}（schema ${man.schema}, ${man.identity}）`);
  const modules = Array.isArray(man.modules) ? man.modules : [];
  console.log(`Modules:   ${modules.length ? modules.join(', ') : '—'}`);
  console.log('');
  console.log('Checks:');

  const checks = [];

  // ① 完整性：必需字段
  const missing = [
    ['identity', man.identity === MANIFEST_IDENTITY ? '' : `应为 ${MANIFEST_IDENTITY}`],
    ['generator', man.generator === 'keelbase' ? '' : '应为 keelbase'],
    ['generatorVersion', man.generatorVersion ? '' : '缺失'],
    ['protocol', man.protocol ? '' : '缺失'],
    ['modules', Array.isArray(man.modules) ? '' : '应为数组'],
  ].filter(([, issue]) => issue);
  checks.push(
    missing.length === 0
      ? { status: 'pass', name: '完整性', detail: 'schema / 必需字段齐全' }
      : { status: 'fail', name: '完整性', detail: `字段异常：${missing.map(([k, v]) => `${k} ${v}`).join('；')}` },
  );

  // ② 一致性：manifest 模块目录
  const gone = [];
  for (const m of modules) {
    if (!(await exists(`Server-NestJS/src/${m}`))) gone.push(m);
  }
  checks.push(
    gone.length === 0
      ? { status: 'pass', name: '一致性', detail: `${modules.length} 个生成模块目录齐全` }
      : { status: 'warn', name: '一致性', detail: `模块目录缺失（可能已删除，属可移除原则）：${gone.join(', ')}` },
  );

  // ③ 运行时兼容：核心基座能力
  const missingRuntime = [];
  for (const r of REQUIRED_RUNTIME) {
    if (!(await exists(r.path))) missingRuntime.push(r.name);
  }
  checks.push(
    missingRuntime.length === 0
      ? { status: 'pass', name: '运行时', detail: `基座能力在位：${REQUIRED_RUNTIME.map((r) => r.name).join(' / ')}` }
      : { status: 'fail', name: '运行时', detail: `基座能力缺失：${missingRuntime.join('、')}` },
  );

  // ④ 生成器版本：manifest vs 当前 CLI
  const cur = await generatorVersion();
  const cmp = cmpVersion(man.generatorVersion, cur);
  checks.push(
    cmp === 0
      ? { status: 'pass', name: '版本', detail: `manifest v${man.generatorVersion} = 当前 CLI v${cur}` }
      : cmp < 0
        ? { status: 'warn', name: '版本', detail: `manifest v${man.generatorVersion} 旧于当前 CLI v${cur}——可重新运行 keelbase init 合并升级` }
        : { status: 'warn', name: '版本', detail: `manifest v${man.generatorVersion} 新于当前 CLI v${cur}——当前 CLI 可能不认识新字段，勿覆盖` },
  );

  // ⑤ 兼容矩阵：manifest 协议/schema vs 当前 CLI 支持的协议/schema（协议匹配深化）
  const protocolOk = String(man.protocol ?? '') === String(MANIFEST_PROTOCOL);
  const schemaOk = Number(man.schema) === Number(MANIFEST_SCHEMA);
  const matrixDetail =
    `protocol ${man.protocol ?? '?'} ${protocolOk ? '=' : '≠'} ${MANIFEST_PROTOCOL}, ` +
    `schema ${man.schema ?? '?'} ${schemaOk ? '=' : '≠'} ${MANIFEST_SCHEMA}, ` +
    `generator v${man.generatorVersion ?? '?'} vs CLI v${cur}`;
  checks.push(
    protocolOk && schemaOk
      ? { status: 'pass', name: '兼容矩阵', detail: `${matrixDetail} —— 协议/schema 全部匹配` }
      : { status: 'fail', name: '兼容矩阵', detail: `${matrixDetail} —— 协议/schema 不匹配（升级 keelbase 或重建来源清单）` },
  );

  return report(checks);
}

if (process.argv[1]?.endsWith('keelbase-doctor.mjs')) {
  runDoctor(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
