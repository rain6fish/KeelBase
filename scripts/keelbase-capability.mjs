#!/usr/bin/env node
/**
 * EB-3 轻量 Capability 声明层（Enterprise Capability Bridge，roadmap §22.11）。
 *
 * 外部系统「能力声明」（YAML，比 OpenAPI 更轻量）→ B 路径 Proxy 工具配置
 * （与 openapi-proxy 同构 `{ baseUrl, audience, tools }`，运行时 ProxyToolRegistryService 注册）。
 *
 * 用法：
 *   node scripts/keelbase-capability.mjs specs/external-crm.capability.yaml            # 输出 proxy 工具配置 JSON
 *   node scripts/keelbase-capability.mjs <file> --list                                 # 人类可读工具清单
 *
 * 声明格式（capability: { id, label, description?, action: read|write, risk?, http: {method,path,pathParams?,query?,body?} }）：
 *   action: read  → riskLevel R1（自动执行）| write → R3（需人工确认）；risk 字段显式覆盖。
 */
import { readFile } from 'node:fs/promises';
import { parseYaml } from './generator/yaml.mjs';

/** 列表规范化：兼容 YAML flow 数组被解析成字符串（如 "[a, b]" 或 "a, b"） */
function toList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const s = v.trim();
    const inner = s.startsWith('[') && s.endsWith(']') ? s.slice(1, -1) : s;
    return inner.split(',').map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

export function parseCapability(decl) {
  const system = decl?.system ?? {};
  const capabilities = Array.isArray(decl?.capabilities) ? decl.capabilities : [];
  const tools = capabilities.map((c) => {
    if (!c?.id || !c?.http?.method || !c?.http?.path) {
      throw new Error(`capability 缺 id/http.method/http.path：${JSON.stringify(c)?.slice(0, 80)}`);
    }
    const riskLevel = c.risk || (c.action === 'write' ? 'R3' : 'R1');
    const parameters = [
      ...toList(c.http?.pathParams).map((p) => ({ name: p, type: 'string', required: true })),
      ...toList(c.http?.query).map((p) => ({ name: p, type: 'string', required: false })),
      ...toList(c.http?.body).map((p) => ({ name: p, type: 'string', required: false })),
    ];
    return {
      name: c.id,
      description: c.description || `${c.label || c.id}（B 路径代理：${c.http.method} ${c.http.path}）`,
      method: c.http.method,
      path: c.http.path,
      parameters,
      riskLevel,
    };
  });
  return { baseUrl: system.baseUrl ?? '', audience: system.audience ?? '', tools };
}

async function main(argv) {
  if (!argv[0] || argv[0] === '--help' || argv[0] === '-h') {
    console.log(`KeelBase Capability 声明解析（EB-3）
用法: node scripts/keelbase-capability.mjs <capability.yaml> [--list]
声明: capabilities: [{ id, label, action: read|write, risk?, http: { method, path, pathParams?, query?, body? } }]
read → R1（自动）| write → R3（需人工确认）；risk 显式覆盖。`);
    return 0;
  }
  const file = argv[0];
  const yaml = await readFile(file, 'utf8');
  const decl = parseYaml(yaml);
  const config = parseCapability(decl);

  if (argv.includes('--list')) {
    const riskLabel = { R1: '自动（读）', R3: '需人工确认（写）', R4: '双人审批（写）', R5: '阻断' };
    console.log(`系统: ${decl.system?.name ?? '?'} (${config.baseUrl} / ${config.audience})`);
    for (const t of config.tools) {
      console.log(`  ${t.method.padEnd(5)} ${t.path.padEnd(32)} → ${t.name.padEnd(24)} | risk ${t.riskLevel} ${riskLabel[t.riskLevel] ?? ''}`);
    }
    console.log(`共 ${config.tools.length} 个能力工具`);
  } else {
    console.log(JSON.stringify(config, null, 2));
  }
  return 0;
}

if (process.argv[1]?.endsWith('keelbase-capability.mjs')) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  });
}
