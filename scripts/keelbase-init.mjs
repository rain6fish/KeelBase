#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * KeelBase CLI — 按基座约定生成业务模块（EASY-2 开发期 AI）。
 *
 * 用法：
 *   交互：  node scripts/keelbase-init.mjs
 *   非交互：node scripts/keelbase-init.mjs --module posts --label 帖子 --fields title:string,content:text
 *   预览：  node scripts/keelbase-init.mjs --module posts --label 帖子 --dry-run
 *   选项：  --brand 应用名   --no-feature-flag   --help
 *
 * 零依赖（内置 readline/promises + node:fs），确定性模板生成（LLM 增强见 EASY-2.1）。
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import {
  FIELD_TYPES,
  SEARCHABLE_FIELD_TYPES,
  buildContext,
  validateModuleName,
  validateLabel,
  parseFields,
  validateFields,
  validateAiTools,
  normalizeSpecFields,
  refFields,
  refTarget,
} from './generator/validate.mjs';
import { backendFiles } from './generator/templates-backend.mjs';
import { frontendFiles } from './generator/templates-frontend.mjs';
import { adminFiles } from './generator/templates-admin.mjs';
import { taroFiles } from './generator/templates-taro.mjs';
import { aiFiles } from './generator/templates-ai.mjs';
import { wireBackend, wireFrontend, wireAdmin, wireTaro, wireAiModule, summarize } from './generator/wire.mjs';
import { extractSpec } from './generator/llm.mjs';
import { parseOpenApiSpec } from './generator/import-openapi.mjs';
import { parseOpenApiProxy } from './generator/import-openapi-proxy.mjs';
import { parseSqlDdl } from './generator/import-schema.mjs';
import { parseYaml } from './generator/yaml.mjs';
import { readManifest, writeManifest, writeModuleProvenance } from './generator/manifest.mjs';

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', dim: '\x1b[2m',
};

const HELP = `KeelBase CLI — 按基座约定生成业务模块（EASY-2）

用法:
  node scripts/keelbase-init.mjs                    # 交互式引导（可输自然语言走 LLM）
  node scripts/keelbase-init.mjs --desc "图书管理，有书名、作者、价格"   # LLM 识别（EASY-2.1）
  node scripts/keelbase-init.mjs --module posts --label 帖子 --fields title:string,content:text
  node scripts/keelbase-init.mjs inspect              # 识别 KeelBase 应用（来源 + 能力指纹）
  node scripts/keelbase-init.mjs doctor               # 诊断 KeelBase 应用（完整性/一致性/运行时/版本）
  node scripts/keelbase-init.mjs doctor --env         # 环境预检（起容器/起服务前：Node/Docker/端口/.env/LLM/DB）

已有系统 AI 化入口（P0-12，OpenAPI / SQL DDL → Protocol；AI Bridge B 路径 → Proxy 配置）：
  node scripts/keelbase-init.mjs --import-openapi swagger.json --out specs/customer.json   # 转换→协议文件
  node scripts/keelbase-init.mjs --import-openapi swagger.json --module customer           # 转换→直接生成
  node scripts/keelbase-init.mjs --import-schema schema.sql --table customers --out specs/customer.json
  node scripts/keelbase-init.mjs --import-schema schema.sql                                # 默认取第一张表
  node scripts/keelbase-init.mjs --import-openapi-proxy swagger.json --base-url http://legacy:8080/api --audience legacy-erp --out proxy-config.json   # B 路径：OpenAPI operations → ProxyTool 配置

LLM（--desc / 交互中文输入）需要配置环境变量：
  DEEPSEEK_API_KEY=...        # 云端（默认 deepseek-chat）
  OLLAMA_BASE_URL=...         # 本地 Ollama（无需 key）

选项:
  --module <name>      模块英文名（小写，如 posts / user_profile）
  --label <中文>       模块中文名（1-12 字）
  --fields <a:type,b>  字段列表，type 支持 string/text/int/bool/date/enum（默认 string）；enum 内联选项：status:enum:active,inactive（小写英文，2-10 个，未给时用默认）
  --desc <描述>        自然语言描述 → LLM 提取模块/标签/字段
  --import-openapi <file>   从 OpenAPI 3 / Swagger 2 提取 schema → Protocol（支持 .yaml/.yml，本地相对 $ref 自动合并）
  --import-openapi-proxy <file>   从 OpenAPI paths 提取 operations → ProxyTool 配置（AI Bridge B 路径；读=R1 写=R3，x-keelbase-risk-level 可覆盖）
  --base-url <url>          配合 --import-openapi-proxy 指定目标系统 baseUrl
  --audience <id>           配合 --import-openapi-proxy 指定目标系统 audience（委托 token）
  --import-schema <file>    从 SQL CREATE TABLE 提取表 → Protocol
  --schema <name>      OpenAPI 中选定的 schema 名（默认第一个）
  --list-schemas       列出 OpenAPI 中可用 schema（配合 --import-openapi）
  --list-tools         列出 OpenAPI 将生成的 proxy 工具（配合 --import-openapi-proxy，不生成）
  --table <name>       SQL 中选定的表名（默认第一张）
  --out <file>         配合 --import-* 只写 Protocol JSON（供 --spec 复用）
  --brand <name>       替换应用品牌名（写 app_constants.dart）
  --dry-run            只预览，不写文件
  --no-feature-flag    生成模块不加特性开关
  --tab                生成模块作为 AppShell 底部 Tab（默认顶层全屏页）
  --force              目标已存在时覆盖生成（模块目录撞名时用，如 posts；亦用于覆盖已存在的 --out 文件——覆盖会重写生成文件，接线幂等）
  -h, --help           显示帮助
`;

function parseArgs(argv) {
  const args = { featureFlag: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-feature-flag') args.featureFlag = false;
    else if (a === '--tab') args.tab = true;
    else if (a === '--force') args.force = true;
    else if (a === '--list-schemas') args['list-schemas'] = true;
    else if (a === '--list-tools') args['list-tools'] = true;
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = a.slice(2, eq < 0 ? undefined : eq);
      const value = eq < 0 ? argv[++i] : a.slice(eq + 1);
      if (value === undefined) {
        console.error(`${C.red}缺少 --${key} 的值${C.reset}`);
        process.exit(1);
      }
      args[key] = value;
    }
  }
  return args;
}

async function prompt(rl, q, def) {
  const a = await rl.question(`${C.green}? ${q}${def ? ` [${def}]` : ''} ${C.reset}`);
  return a.trim() || def;
}

function fail(msg) {
  console.error(`${C.red}✗ ${msg}${C.reset}`);
  process.exit(1);
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** #9 多文件 OpenAPI：扫描本地相对 $ref（./other.yaml#/...）→ 加载外部文件并合并其 schemas 到主 spec。 */
async function resolveLocalRefs(spec, file) {
  const dir = file.substring(0, Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')));
  const seen = new Set([file]);
  const json = JSON.stringify(spec);
  const refs = [...json.matchAll(/"\$ref":"(\.\.?\/[^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    const rel = ref.match(/^\.{0,2}\/([^#]+)/)?.[1];
    if (!rel) continue;
    const key = `${dir}/${rel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const raw = await readFile(key, 'utf8');
      const ext = /\.ya?ml$/i.test(rel) ? parseYaml(raw) : JSON.parse(raw);
      const extSchemas = ext.components?.schemas ?? ext.definitions ?? {};
      for (const [n, s] of Object.entries(extSchemas)) {
        if (!spec.components?.schemas?.[n]) {
          spec.components ??= {};
          spec.components.schemas ??= {};
          spec.components.schemas[n] = s;
        }
      }
    } catch {
      // 外部文件缺失：忽略（引用目标保留，后续手写清单提示）
    }
  }
  return spec;
}

// 生成文件统一带 Apache-2.0 SPDX 许可头（输出是 Apache-2.0 模板的衍生作品，合法合规要求保留来源声明）。
// 按扩展名选注释语法；.json 等无注释文件不加。
const SPDX_HEADERS = {
  ts: '// SPDX-License-Identifier: Apache-2.0\n\n',
  tsx: '// SPDX-License-Identifier: Apache-2.0\n\n',
  js: '// SPDX-License-Identifier: Apache-2.0\n\n',
  mjs: '// SPDX-License-Identifier: Apache-2.0\n\n',
  cjs: '// SPDX-License-Identifier: Apache-2.0\n\n',
  dart: '// SPDX-License-Identifier: Apache-2.0\n\n',
  py: '# SPDX-License-Identifier: Apache-2.0\n\n',
  sh: '# SPDX-License-Identifier: Apache-2.0\n\n',
  vue: '<!-- SPDX-License-Identifier: Apache-2.0 -->\n',
};

function spdxHeader(rel) {
  return SPDX_HEADERS[rel.split('.').pop()] || '';
}

async function writeGenerated(rel, content, force = false) {
  await mkdir(rel.substring(0, rel.lastIndexOf('/')), { recursive: true });
  // 幂等：目标文件已存在（如 AI 工具被旗舰/已有模块占用）默认跳过，避免覆盖已有实现；--force 才覆盖
  if (!force) {
    try {
      await access(rel);
      console.log(`${C.dim}○ 已存在（跳过，--force 覆盖）：${rel}${C.reset}`);
      return false;
    } catch {
      // 不存在 → 写入
    }
  }
  const header = content.includes('SPDX-License-Identifier') ? '' : spdxHeader(rel);
  await writeFile(rel, header + content, 'utf8');
  return true;
}

async function brandReplace(brand, dryRun) {
  const file = 'Front-Flutter/lib/core/constants/app_constants.dart';
  let src;
  try {
    src = await readFile(file, 'utf8');
  } catch {
    return { changed: false, reason: 'file-not-found' };
  }
  const marker = `static const String appName = '${brand}'`;
  if (src.includes(marker)) return { changed: false, reason: 'already-wired' };
  const anchor = `static const String appName = 'KeelBase';`;
  if (!src.includes(anchor)) return { changed: false, reason: 'anchor-not-found' };
  const next = src.replace(anchor, marker);
  if (!dryRun) await writeFile(file, next, 'utf8');
  return { changed: true };
}

async function main() {
  // keelbase inspect / doctor 子命令：识别 / 诊断，委托独立脚本
  if (process.argv[2] === 'inspect') {
    const { runInspect } = await import('./keelbase-inspect.mjs');
    process.exitCode = await runInspect(process.argv.slice(3));
    return;
  }
  if (process.argv[2] === 'doctor') {
    const { runDoctor } = await import('./keelbase-doctor.mjs');
    process.exitCode = await runDoctor(process.argv.slice(3));
    return;
  }

  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(HELP);
    return;
  }

  // ── B 路径（AI Bridge §4 完整 B）：OpenAPI operations → ProxyTool 配置 ──
  const importOpenApiProxy = args['import-openapi-proxy'];
  if (importOpenApiProxy) {
    let spec;
    try {
      const raw = await readFile(importOpenApiProxy, 'utf8');
      spec = /\.ya?ml$/i.test(importOpenApiProxy) ? parseYaml(raw) : JSON.parse(raw);
      if (!spec || typeof spec !== 'object') fail('OpenAPI 文件解析结果无效');
    } catch (err) {
      fail(`无法读取/解析 OpenAPI 文件 ${importOpenApiProxy}: ${err.message}（YAML 需 .yaml/.yml 扩展名）`);
    }
    spec = await resolveLocalRefs(spec, importOpenApiProxy);
    const proxy = parseOpenApiProxy(spec, { baseUrl: args['base-url'], audience: args.audience });
    if (proxy.error) fail(proxy.error);

    // --list-tools：预览将生成的 proxy 工具清单（不生成/不写，供 Java 团队选路/评审）
    if (args['list-tools']) {
      console.log(`可用 proxy 工具（${proxy.tools.length}）：`);
      for (const t of proxy.tools) {
        console.log(`  ${t.name.padEnd(28)} ${t.method} ${t.path}（${t.riskLevel}${t.revokePath ? `，撤销 ${t.revokePath}` : ''}）`);
      }
      if (proxy.skipped?.length) {
        console.log(`${C.cyan}  跳过：${proxy.skipped.map((s) => `${s.tool}.${s.name}（${s.reason}）`).join('；')}${C.reset}`);
      }
      return;
    }

    if (args.out) {
      const wrote = await writeGenerated(args.out, JSON.stringify({ baseUrl: proxy.baseUrl, audience: proxy.audience, tools: proxy.tools }, null, 2) + '\n', args.force);
      console.log(wrote
        ? `${C.green}✓ 已从 OpenAPI 写出 B 路径 Proxy 配置 ${args.out}（${proxy.tools.length} 个工具）${C.reset}`
        : `${C.yellow}○ 未写入 ${args.out}（目标已存在；加 --force 覆盖）${C.reset}`);
      if (proxy.skipped?.length) {
        console.log(`${C.cyan}  跳过：${proxy.skipped.map((s) => `${s.tool}.${s.name}（${s.reason}）`).join('；')}${C.reset}`);
      }
      console.log(`${C.dim}  应用到运行时：PUT /settings/ai_proxy_tools 或管理台「设置」粘贴该 JSON，重启后工具生效${C.reset}`);
    } else {
      console.log(JSON.stringify({ baseUrl: proxy.baseUrl, audience: proxy.audience, tools: proxy.tools }, null, 2));
      console.log(`\n可用工具（${proxy.tools.length}）：${proxy.available.join(', ')}`);
    }
    return;
  }

  // ── 收集输入：--spec 读协议 JSON；--desc 走 LLM；交互可输自然语言 ──
  let name = args.module;
  let label = args.label;
  let fieldsStr = args.fields;
  // --spec 提供的结构化字段（保留 enum 选项）；非空则优先于 parseFields 字符串解析。
  let specFields = null;
  let specAiTools = null;
  // Whether the spec declared the module searchable. Held in a file-scoped flag because the spec
  // itself is bound inside the branch below.
  // 协议里声明的「可搜索」；spec 本身是块内绑定，故在此留一个文件作用域的取值。
  let specSearchable = false;

  // EASY-7：从协议 JSON 文件读取模块规格（docs/module-protocol.md §1 形态）
  if (args.spec) {
    let spec;
    try {
      spec = JSON.parse(await readFile(args.spec, 'utf8'));
    } catch (err) {
      fail(`无法读取协议文件 ${args.spec}: ${err.message}`);
    }
    if (spec.module) name = spec.module;
    if (spec.plural && !name) name = spec.plural;
    if (spec.label) label = spec.label;
    specSearchable = spec.searchable === true;
    if (Array.isArray(spec.fields)) {
      // 协议反推：直接保留结构化字段（name/type/enum/required），避免字符串转换丢失 enum/required
      specFields = normalizeSpecFields(spec.fields);
    }
    // Protocol 2.0：AI 工具层声明（enabled / query / create 风险级与确认）
    if (spec.aiTools) specAiTools = spec.aiTools;
  }

  // P0-12 多输入通道：OpenAPI / SQL DDL → Module Protocol
  // --out 时只写协议 JSON（供复查/共享/后续 --spec 生成）；否则直接复用字段继续生成
  const importOpenapi = args['import-openapi'];
  const importSchema = args['import-schema'];
  if (importOpenapi || importSchema) {
    let imported;
    if (importOpenapi) {
      let spec;
      try {
        const raw = await readFile(importOpenapi, 'utf8');
        // #5 YAML 支持：.yaml/.yml 走内置解析；否则 JSON
        spec = /\.ya?ml$/i.test(importOpenapi) ? parseYaml(raw) : JSON.parse(raw);
        if (!spec || typeof spec !== 'object') fail('OpenAPI 文件解析结果无效');
      } catch (err) {
        fail(`无法读取/解析 OpenAPI 文件 ${importOpenapi}: ${err.message}（YAML 需 .yaml/.yml 扩展名）`);
      }
      // #9 多文件 OpenAPI：本地相对 $ref（./other.yaml#/...）→ 加载外部文件并合并 schemas
      spec = await resolveLocalRefs(spec, importOpenapi);
      imported = parseOpenApiSpec(spec, { schema: args.schema, module: args.module, label: args.label });
      // #3 多 schema：--list-schemas 列出可用 schema（未选的手写清单）
      if (args['list-schemas']) {
        const names = imported.available ?? [];
        console.log(`可用 schema（${names.length}）：${names.join(', ')}`);
        console.log(`${C.dim}  未选 schema 保持手写——用 --schema <name> 指定单个，或 --schemas a,b 循环生成${C.reset}`);
        return;
      }
    } else {
      let sql;
      try {
        sql = await readFile(importSchema, 'utf8');
      } catch (err) {
        fail(`无法读取 SQL 文件 ${importSchema}: ${err.message}`);
      }
      imported = parseSqlDdl(sql, { table: args.table, module: args.module, label: args.label });
    }
    if (imported.error) fail(imported.error);

    if (args.out) {
      const proto = { module: imported.module, label: imported.label, fields: imported.fields };
      if (imported.skipped?.length) proto.skipped = imported.skipped;
      try {
        const wrote = await writeGenerated(args.out, JSON.stringify(proto, null, 2) + '\n', args.force);
        if (!wrote) {
          console.log(`${C.yellow}○ 未写入 ${args.out}（目标已存在；加 --force 覆盖）${C.reset}`);
          return;
        }
        console.log(`${C.green}✓ 已从 ${importOpenapi ? 'OpenAPI' : 'SQL Schema'} 写出协议 ${args.out}${C.reset}`);
        if (imported.notes?.length) {
          console.log(`${C.cyan}  提示：${imported.notes.join('；')}${C.reset}`);
        }
        console.log(`${C.dim}  下一步：node scripts/keelbase-init.mjs --spec ${args.out}${C.reset}`);
        return;
      } catch (err) {
        fail(`写入 ${args.out} 失败: ${err.message}`);
      }
    }

    name = imported.module;
    label = imported.label;
    specFields = imported.fields;
    console.log(`${C.cyan}导入 ${importOpenapi ? 'OpenAPI' : 'SQL Schema'}：模块 ${imported.module} / 标签 ${imported.label} / 字段 ${imported.fields.map((f) => f.name).join(', ')}${C.reset}`);
    if (imported.skipped?.length) {
      console.log(`${C.yellow}  诊断 ${imported.skipped.length} 项：${imported.skipped.map((s) => `${s.name}(${s.reason})`).join('，')}${C.reset}`);
    }
    if (imported.notes?.length) {
      console.log(`${C.cyan}  提示 ${imported.notes.length} 条：${imported.notes.join('；')}${C.reset}`);
    }
  }

  async function llmExtract(description) {
    const r = await extractSpec(description);
    if (!r.ok) fail(r.error);
    if (!name) name = r.spec.module;
    if (!label) label = r.spec.label;
    if (!fieldsStr) fieldsStr = r.spec.fields.map((f) => `${f.name}:${f.type}`).join(',');
    console.log(`${C.cyan}LLM 识别：模块 ${r.spec.module} / 标签 ${r.spec.label} / 字段 ${r.spec.fields.map((f) => f.name).join(', ')}${C.reset}`);
  }

  if (args.desc) {
    await llmExtract(args.desc);
  }

  if (!name || !label || (!fieldsStr && !specFields)) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!name) {
        const a = await prompt(rl, '模块英文名（小写，如 posts）或一句话描述（中文/带空格→LLM 识别）', 'posts');
        if (/^[a-z][a-z0-9_]*$/.test(a)) {
          name = a;
        } else {
          await llmExtract(a);
        }
      }
      if (!label) label = await prompt(rl, '模块中文名（1-12 字）', '帖子');
      if (!fieldsStr) fieldsStr = await prompt(rl, '字段（title:string,content:text）', 'title:string,content:text');
    } finally {
      rl.close();
    }
  }

  // ── 校验 ──
  const nameErr = validateModuleName(name);
  if (nameErr) fail(nameErr);
  const labelErr = validateLabel(label);
  if (labelErr) fail(labelErr);
  const fields = specFields ?? parseFields(fieldsStr);
  const fieldsErr = validateFields(fields);
  if (fieldsErr) fail(fieldsErr);
  const aiToolsErr = validateAiTools(specAiTools);
  if (aiToolsErr) fail(aiToolsErr);

  // A `searchable` flag is a promise, not a decoration: the runtime indexes this module's rows into
  // the global search by it, and that index can only match text columns — a spec with no
  // string / text / enum field has nothing to deliver on the promise. Refusing here beats emitting
  // a module that claims to be searchable and matches nothing (same treatment as a ref target that
  // does not exist yet).
  // searchable 是一条**声明**，不是装饰：运行时据此把模块的记录并进全局 /search 索引，而索引只能匹配
  // 文本列 —— spec 里一个 string / text / enum 字段都没有时，这条声明兑现不了任何东西。与其产出一份
  // 声称可搜、实际什么都搜不到的模块，不如在这里明确报错（与「关联目标必须已生成」同一种处理）。
  if (specSearchable && !fields.some((f) => SEARCHABLE_FIELD_TYPES.has(f.type))) {
    fail(
      `spec 声明了 searchable: true，但字段里没有任何 string / text / enum 字段 —— ` +
        `可搜的前提是有文本列；请加一个这样的字段，或去掉 searchable。`,
    );
  }

  // 关联目标必须是**已生成的模块**：生成物会 import 目标的实体文件，目标不存在就是编译错误。
  // 与其产出一份编译不过的代码，不如在这里明确报错（与自引用同一种处理）。
  // A ref target must already exist as generated code — the module imports its entity file.
  // Emitting code that cannot compile is worse than refusing here.
  for (const r of refFields(fields)) {
    const target = refTarget(r.target);
    const targetEntity = `Server-NestJS/src/${target.plural}/${target.singular}.entity.ts`;
    if (!(await exists(targetEntity))) {
      fail(
        `字段 ${r.name} 关联到「${target.plural}」，但没找到 ${targetEntity} —— ` +
          `请先为 ${target.plural} 生成模块，或改用其它 target。`,
      );
    }
  }

  const ctx = buildContext(name, label, fields);
  ctx.featureFlag = args.featureFlag !== false;
  ctx.isTab = args.tab === true;
  // Declared, never inferred: a module is searchable only if its spec says so.
  // 由声明决定、不做推断：只有 spec 说了可搜，模块才可搜。
  ctx.searchable = specSearchable;
  if (specAiTools) ctx.aiTools = specAiTools;

  // 目标目录冲突检查（合成陌生人实测：内置/示例模块撞名时需覆盖入口）
  const beDir = `Server-NestJS/src/${ctx.plural}`;
  if (!args.dryRun && (await exists(beDir))) {
    // 生成产物判据：模块须在 .keelbase/manifest.json（源头身份）中 → 才是本生成器产物。
    // 既有/手写模块不在 manifest（如 events/todos/users/crm）——即使 --force 也拒绝，防覆盖手写实现
    // （2026-09-15 扫查实证：--force --spec specs/events.json 把手写 events.service.ts 286→64 行）。
    const manifest = await readManifest();
    const generated = Array.isArray(manifest?.modules) && manifest.modules.includes(ctx.plural);
    if (!generated) {
      fail(
        `目录已存在且非本生成器产物：${beDir}（模块 ${ctx.plural} 不在 .keelbase/manifest.json）——疑似手写/既有模块，拒绝覆盖（--force 亦不覆盖，防丢代码）；请改用其它模块名。`,
      );
    } else if (args.force) {
      console.log(
        `${C.yellow}⚠ 目录已存在：${beDir}（--force 覆盖生成；模块在 manifest 中=本生成器产物）——将重写生成文件，接线幂等跳过${C.reset}`,
      );
    } else {
      fail(
        `目录已存在：${beDir}（模块 ${ctx.plural} 已生成过；如确认覆盖请加 --force）`,
      );
    }
  }

  console.log(`\n${C.yellow}生成业务模块：${ctx.plural}（${ctx.label}）${C.reset}`);
  console.log(`${C.dim}  singular=${ctx.singular} plural=${ctx.plural} 类=${ctx.pluralPascal} 字段=[${fields.map((f) => f.name).join(', ')}]${C.reset}\n`);

  const backend = backendFiles(ctx).map((f) => ({ ...f, rel: `Server-NestJS/src/${f.path}` }));
  const frontend = frontendFiles(ctx).map((f) => ({ ...f, rel: `Front-Flutter/lib/${f.path}` }));
  const admin = adminFiles(ctx).map((f) => ({ ...f, rel: `Web-Admin-Vue/${f.path}` }));
  const taro = taroFiles(ctx).map((f) => ({ ...f, rel: `Front-Taro/${f.path}` }));
  // AI 工具（第 11-12 周）：让 Runtime Agent 能安全调用生成模块
  const ai = aiFiles(ctx).map((f) => ({ ...f, rel: `Server-NestJS/src/${f.path}` }));

  // 目标文件撞名检查（缺目录但有同名文件 = 被既有模块/旗舰工具占用）：
  // 模块目录不存在却已有本模块该写的文件 → 该文件属于别的实现（如 AI CRM 的 query-customers.tool.ts）。
  // 此前只查目录 → 静默接线会重复注册同名工具（并 --force 覆盖手写实现）；此检查一律拒绝（不因 --force 放行），要求改名。
  if (!args.dryRun && !(await exists(beDir))) {
    const collided = [];
    for (const f of [...backend, ...frontend, ...admin, ...taro, ...ai]) {
      if (await exists(f.rel)) collided.push(f.rel);
    }
    if (collided.length) {
      fail(
        `目标文件已被占用（与既有模块/旗舰工具撞名，非本模块生成物）：\n  ${collided.join('\n  ')}\n` +
          `模块「${ctx.plural}」与现有实现冲突——继续会重复接线/覆盖手写文件。请改用其它模块名。`,
      );
    }
  }

  if (args.dryRun) {
    console.log(`${C.yellow}[dry-run] 将生成以下文件：${C.reset}`);
    for (const f of [...backend, ...frontend, ...ai]) console.log(`  ${f.rel}`);
    for (const f of admin) console.log(`  ${f.rel}`);
    for (const f of taro) console.log(`  ${f.rel}`);
    const tabNote = ctx.isTab ? ' + app_shell 底部 Tab' : '';
    const aiNote = ai.length > 0 ? `ai.module（${ai.length / 2} 个工具）` : 'ai.module（aiTools 关闭，不接工具）';
    console.log(`${C.yellow}[dry-run] 将接线：app.module / modules-manifest / feature-flags / main.dart / app_router / i18n / navigate-page.tool / ${aiNote}${tabNote} + Web-Admin-Vue（routes/navGroups/i18n）+ Taro（app.config/explore）${C.reset}`);
    if (args.brand) console.log(`${C.yellow}[dry-run] 将替换品牌 → ${args.brand}${C.reset}`);
    console.log(`${C.yellow}[dry-run] 将写 .keelbase/manifest.json（来源身份：generator/version/protocol/modules）${C.reset}`);
    return;
  }

  // ── 写文件（已存在默认跳过，幂等；--force 覆盖）──
  for (const f of backend) await writeGenerated(f.rel, f.content, args.force);
  for (const f of frontend) await writeGenerated(f.rel, f.content, args.force);
  for (const f of admin) await writeGenerated(f.rel, f.content, args.force);
  for (const f of taro) await writeGenerated(f.rel, f.content, args.force);
  for (const f of ai) await writeGenerated(f.rel, f.content, args.force);
  console.log(`${C.green}✓ 已生成 ${backend.length + frontend.length + admin.length + taro.length + ai.length} 个文件（后端 + AI 工具 + Flutter + Web-Admin-Vue + Taro）${C.reset}`);

  // ── 接线 ──
  const beResults = await wireBackend(ctx);
  const feResults = await wireFrontend(ctx);
  const adminResults = await wireAdmin(ctx);
  const taroResults = await wireTaro(ctx);
  const aiResults = await wireAiModule(ctx);
  const all = summarize([...beResults, ...feResults, ...adminResults, ...taroResults, ...aiResults]);
  for (const file of all.wired) console.log(`${C.green}✓ 接线：${file}${C.reset}`);
  // 合成陌生人实测（W3）发现：锚点失败仅「△ 跳过」不阻断，build 检测不出残缺接线（Flutter 页崩 / capabilities 缺）。
  // 区分「幂等跳过（正常）」与「真失败（锚点未命中）」——后者醒目告警 + 汇总 N/M。
  const skippedIdempotent = all.skipped.filter((s) => s.reason === 'already-wired');
  const failed = all.skipped.filter((s) => s.reason !== 'already-wired');
  for (const s of skippedIdempotent) console.log(`${C.dim}○ 已存在：${s.file}（幂等跳过）${C.reset}`);
  if (failed.length > 0) {
    const total = all.wired.length + all.skipped.length;
    console.log(
      `${C.red}⚠ 接线 ${all.wired.length}/${total} 完成，${failed.length} 处锚点未命中——对应端可能残缺（build 检测不出），请手动检查：${C.reset}`,
    );
    for (const s of failed) console.log(`${C.red}  ✗ ${s.file}（${reasonZh(s.reason)}）${C.reset}`);
  }

  // ── Provenance：.keelbase/manifest.json（来源身份，幂等合并——重跑只更新版本不重复）──
  try {
    const man = await writeManifest(ctx.plural, '', { searchable: ctx.searchable === true });
    if (man.changed) {
      console.log(
        `${C.green}✓ ${man.file}${C.reset}（keelbase v${man.manifest.generatorVersion} / protocol ${man.manifest.protocol}，模块 ${man.manifest.modules.join(', ')}）`,
      );
    } else {
      console.log(`${C.yellow}△ ${man.file} 未更新（${reasonZh(man.reason)}——清单由更新版本创建，勿覆盖）${C.reset}`);
    }
  } catch (err) {
    console.log(`${C.yellow}△ 写来源清单跳过：${err.message}${C.reset}`);
  }

  // ── 模块级生成证明（DNA：AI-generated code is untrusted by default）──
  // 每个生成模块的目录写 .keelbase-provenance.json（来源/生成器版本/协议/时刻）——出生证明，供 inspect 溯源。
  try {
    const source = args.spec ? `spec:${args.spec}` : args['import-openapi'] ? `openapi:${args['import-openapi']}` : args['import-schema'] ? `schema:${args['import-schema']}` : 'cli(--module/--fields)';
    const prov = await writeModuleProvenance(ctx.plural, source);
    console.log(`${C.green}✓ ${prov.file}${C.reset}（来源 ${source} · keelbase v${prov.provenance.generatorVersion}）`);
  } catch (err) {
    console.log(`${C.yellow}△ 写模块生成证明跳过：${err.message}${C.reset}`);
  }

  // ── 品牌 ──
  if (args.brand) {
    const br = await brandReplace(args.brand, false);
    console.log(
      br.changed
        ? `${C.green}✓ 品牌 → ${args.brand}${C.reset}`
        : `${C.yellow}△ 品牌跳过（${reasonZh(br.reason)}）${C.reset}`,
    );
  }

  // ── 下一步（完整闭环：编译 → 单测 → 迁移 → 前端 → AI 工具 → 运行/部署）──
  console.log(`\n${C.green}════ 完成！下一步（按顺序） ════${C.reset}`);
  console.log(`  ① 验证后端`);
  console.log(`     cd Server-NestJS && npm run build`);
  console.log(`     npm test -- ${ctx.plural}.service            # 生成模块单测`);
  console.log(`  ② 生产迁移（prod postgres 需要；TypeORM 索引 hash 名禁止手写）`);
  console.log(`     npm run migration:generate -- src/migrations/Add${ctx.pluralPascal}`);
  console.log(`  ③ 验证前端（两端都已接线）`);
  console.log(`     cd Front-Flutter && flutter analyze`);
  console.log(`     cd Web-Admin-Vue && npm run dev               # 工作台/管理台出现「${ctx.label}」菜单`);
  console.log(`  ④ 验证 AI 工具（重启后端后）`);
  console.log(`     生成器已注册 query_${ctx.plural} / create_${ctx.plural} 为 AI 工具——`);
  console.log(`     AI 对话问「帮我建一个${ctx.label}」→ 读自动执行 / 写需人工确认 → 审计哈希链可查`);
  console.log(`  ⑤ 运行 / 部署`);
  console.log(`     本地: flutter run -d chrome 或 Web-Admin-Vue npm run dev`);
  console.log(`     一键容器: docker run -d -p 3000:3000 ghcr.io/rain6fish/keelbase:latest`);
  console.log(`     私有化: ./deploy/deploy.sh（详见 docs/manual/one-click-deploy.md）`);
  console.log(`  API: GET/POST /api/v1/${ctx.plural}（/api/docs 看 Swagger）`);
  // 字段类型数量由闭集推导 —— 硬写数字会像「报错文案写死支持类型」那样悄悄过期。
  console.log(
    `${C.dim}  v1 边界：prod(postgres) 需补迁移；未生成底部 Tab；字段类型 ${FIELD_TYPES.size} 种（见 docs/module-protocol.md）${C.reset}\n`,
  );
}

function reasonZh(reason) {
  switch (reason) {
    case 'already-wired': return '已存在，幂等跳过';
    case 'anchor-not-found': return '锚点未找到（可手动接线）';
    case 'anchor-ambiguous': return '锚点匹配多处（可手动接线）';
    case 'file-not-found': return '文件不存在';
    case 'schema-mismatch': return 'schema 不匹配';
    default: return reason;
  }
}

main().catch((e) => {
  console.error(`${C.red}✗ 失败：${e.message}${C.reset}`);
  process.exit(1);
});
