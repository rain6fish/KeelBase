#!/usr/bin/env node
/**
 * KeelBase inspect — 识别 KeelBase 应用（Provenance 工具，设计建议 §十五）。
 *
 * 只读、确定性、零网络零 DB：读 .keelbase/manifest.json + 扫描仓库能力指纹。
 * 非 KeelBase 项目也可运行（打印干净提示并返回退出码 1，不抛栈）。
 *
 * 用法：
 *   node scripts/keelbase-inspect.mjs          # 识别当前目录
 *   node scripts/keelbase-init.mjs inspect     # 等价的 CLI 子命令
 *   keelbase inspect                           # npm 安装后
 *
 * 退出码：0 = KeelBase 应用（manifest 存在且 schema 有效）；1 = 非 KeelBase / 清单缺失或无效。
 */
import { readFile, access, readdir } from 'node:fs/promises';
import { readManifest, manifestPath, MANIFEST_SCHEMA, readModuleProvenance } from './generator/manifest.mjs';

const C = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m' };

const HELP = `KeelBase inspect — 识别 KeelBase 应用并输出架构指纹

用法:
  node scripts/keelbase-inspect.mjs          # 识别当前目录
  node scripts/keelbase-init.mjs inspect     # 等价的 CLI 子命令

输出: 来源身份（generator/protocol/modules）+ 运行时能力指纹（只读检测目录存在性）
退出码: 0 = KeelBase 应用；1 = 非 KeelBase（清单缺失）或 schema 无效
`;

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** probe: string | string[]（任一存在）| function（返回真值或存在目录数组）。 */
async function probeResult(p) {
  if (typeof p === 'function') return p();
  if (Array.isArray(p)) return (await Promise.all(p.map(exists))).some(Boolean);
  return exists(p);
}

const CAPABILITIES = [
  { name: 'AI Tools', probe: 'Server-NestJS/src/ai/tools', detail: 'Agent 工具（读 / 写确认）' },
  { name: 'CASL Permission', probe: 'Server-NestJS/src/common/casl', detail: '数据级权限' },
  { name: 'Governance', probe: 'Server-NestJS/src/ai/governance', detail: 'HS-9 治理策略' },
  { name: 'AI Audit', probe: 'Server-NestJS/src/ai/audit', detail: 'AI 审计哈希链' },
  { name: 'Operation Audit', probe: 'Server-NestJS/src/operation-audit', detail: '操作审计' },
  { name: 'Agent Runtime', probe: 'Server-NestJS/src/ai', detail: '对话 / 工具 / 记忆 / RAG' },
  {
    name: 'Flagship Apps',
    probe: async () =>
      (await Promise.all(['crm', 'pm', 'approval'].map((d) => exists(`Server-NestJS/src/${d}`).then((ok) => ok && d)))).filter(Boolean),
    detail: 'AI CRM / PM / Approval',
  },
  { name: 'MCP', probe: 'Server-NestJS/src/mcp', detail: 'MCP 出口 / 入口 Gateway' },
  { name: 'Headless', probe: 'Server-NestJS/src/headless', detail: '无头 API（x-api-key）' },
  { name: 'FLOW', probe: 'Server-NestJS/src/flows', detail: '工作流引擎' },
  { name: 'WebSocket', probe: 'Server-NestJS/src/realtime', detail: '实时通道' },
];

export async function runInspect(argv = []) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }

  const man = await readManifest();
  if (!man) {
    console.log(`${C.red}✗ 非 KeelBase 应用${C.reset}：缺少 ${manifestPath()}（来源身份清单缺失）`);
    console.log(`  由 keelbase init 生成——node scripts/keelbase-init.mjs --module <name> 会在项目根写 .keelbase/manifest.json`);
    return 1;
  }
  if (man.schema !== MANIFEST_SCHEMA) {
    console.log(`${C.red}✗ 不支持的 manifest schema ${man.schema}${C.reset}（当前支持 ${MANIFEST_SCHEMA}）`);
    return 1;
  }

  console.log(`${C.green}KeelBase Application${C.reset}`);
  console.log('────────────────────');
  console.log(`Generator:   keelbase v${man.generatorVersion}`);
  console.log(`Protocol:    ${man.protocol}`);
  console.log(`Modules:     ${Array.isArray(man.modules) && man.modules.length ? man.modules.join(', ') : '—'}`);
  console.log(`Identity:    ${man.identity} (schema ${man.schema})`);

  // 模块级生成证明（DNA：AI-generated code is untrusted by default——代码可溯源）
  let modDirs = [];
  try {
    modDirs = (await readdir('Server-NestJS/src', { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch { /* 目录缺失不报错 */ }
  const provenances = [];
  for (const mod of modDirs) {
    const p = await readModuleProvenance(mod);
    if (p) provenances.push(p);
  }
  if (provenances.length) {
    console.log('Module Provenance（生成证明）:');
    for (const p of provenances.sort((a, b) => a.module.localeCompare(b.module))) {
      console.log(`  ${C.green}${p.module}${C.reset}   ${p.source} · keelbase v${p.generatorVersion} · ${p.generatedAt ? p.generatedAt.slice(0, 10) : '?'}`);
    }
    console.log('');
  }

  console.log('Capabilities:');
  for (const cap of CAPABILITIES) {
    const res = await probeResult(cap.probe);
    const present = Array.isArray(res) ? res.length > 0 : !!res;
    const tag = Array.isArray(res) && res.length ? `(${res.join(', ')})` : '';
    console.log(`  ${present ? C.green + '✓' : C.dim + '—'}${C.reset} ${cap.name.padEnd(16)} ${C.dim}${cap.detail}${tag ? ` ${tag}` : ''}${C.reset}`);
  }
  return 0;
}

if (process.argv[1]?.endsWith('keelbase-inspect.mjs')) {
  runInspect(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
