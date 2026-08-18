#!/usr/bin/env node
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
  buildContext,
  validateModuleName,
  validateLabel,
  parseFields,
  validateFields,
} from './generator/validate.mjs';
import { backendFiles } from './generator/templates-backend.mjs';
import { frontendFiles } from './generator/templates-frontend.mjs';
import { adminFiles } from './generator/templates-admin.mjs';
import { taroFiles } from './generator/templates-taro.mjs';
import { aiFiles } from './generator/templates-ai.mjs';
import { wireBackend, wireFrontend, wireAdmin, wireTaro, wireAiModule, summarize } from './generator/wire.mjs';
import { extractSpec } from './generator/llm.mjs';
import { parseOpenApiSpec } from './generator/import-openapi.mjs';
import { parseSqlDdl } from './generator/import-schema.mjs';

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m',
};

const HELP = `KeelBase CLI — 按基座约定生成业务模块（EASY-2）

用法:
  node scripts/keelbase-init.mjs                    # 交互式引导（可输自然语言走 LLM）
  node scripts/keelbase-init.mjs --desc "图书管理，有书名、作者、价格"   # LLM 识别（EASY-2.1）
  node scripts/keelbase-init.mjs --module posts --label 帖子 --fields title:string,content:text

已有系统 AI 化入口（P0-12，OpenAPI / SQL DDL → Protocol）：
  node scripts/keelbase-init.mjs --import-openapi swagger.json --out specs/customer.json   # 转换→协议文件
  node scripts/keelbase-init.mjs --import-openapi swagger.json --module customer           # 转换→直接生成
  node scripts/keelbase-init.mjs --import-schema schema.sql --table customers --out specs/customer.json
  node scripts/keelbase-init.mjs --import-schema schema.sql                                # 默认取第一张表

LLM（--desc / 交互中文输入）需要配置环境变量：
  DEEPSEEK_API_KEY=...        # 云端（默认 deepseek-chat）
  OLLAMA_BASE_URL=...         # 本地 Ollama（无需 key）

选项:
  --module <name>      模块英文名（小写，如 posts / user_profile）
  --label <中文>       模块中文名（1-12 字）
  --fields <a:type,b>  字段列表，type 支持 string/text/int/bool/date/enum（默认 string）
  --desc <描述>        自然语言描述 → LLM 提取模块/标签/字段
  --import-openapi <file>   从 OpenAPI 3 / Swagger 2 JSON 提取 schema → Protocol
  --import-schema <file>    从 SQL CREATE TABLE 提取表 → Protocol
  --schema <name>      OpenAPI 中选定的 schema 名（默认第一个）
  --table <name>       SQL 中选定的表名（默认第一张）
  --out <file>         配合 --import-* 只写 Protocol JSON（供 --spec 复用）
  --brand <name>       替换应用品牌名（写 app_constants.dart）
  --dry-run            只预览，不写文件
  --no-feature-flag    生成模块不加特性开关
  --tab                生成模块作为 AppShell 底部 Tab（默认顶层全屏页）
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

async function writeGenerated(rel, content) {
  await mkdir(rel.substring(0, rel.lastIndexOf('/')), { recursive: true });
  await writeFile(rel, content, 'utf8');
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
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(HELP);
    return;
  }

  // ── 收集输入：--spec 读协议 JSON；--desc 走 LLM；交互可输自然语言 ──
  let name = args.module;
  let label = args.label;
  let fieldsStr = args.fields;
  // --spec 提供的结构化字段（保留 enum 选项）；非空则优先于 parseFields 字符串解析。
  let specFields = null;

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
    if (Array.isArray(spec.fields)) {
      // 协议反推：直接保留结构化字段（name/type/enum），避免字符串转换丢失 enum 选项
      specFields = spec.fields.map((f) => ({
        name: f.name,
        type: f.type || 'string',
        ...(Array.isArray(f.enum) && f.enum.length > 0 ? { enum: f.enum } : {}),
      }));
    }
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
        spec = JSON.parse(await readFile(importOpenapi, 'utf8'));
      } catch (err) {
        fail(`无法读取 OpenAPI 文件 ${importOpenapi}: ${err.message}`);
      }
      imported = parseOpenApiSpec(spec, { schema: args.schema, module: args.module, label: args.label });
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
      try {
        await writeGenerated(args.out, JSON.stringify(proto, null, 2) + '\n');
        console.log(`${C.green}✓ 已从 ${importOpenapi ? 'OpenAPI' : 'SQL Schema'} 写出协议 ${args.out}${C.reset}`);
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

  const ctx = buildContext(name, label, fields);
  ctx.featureFlag = args.featureFlag !== false;
  ctx.isTab = args.tab === true;

  // 目标目录冲突检查
  const beDir = `Server-NestJS/src/${ctx.plural}`;
  if (!args.dryRun && (await exists(beDir))) {
    fail(`目录已存在：${beDir}（模块 ${ctx.plural} 似乎已生成过）`);
  }

  console.log(`\n${C.yellow}生成业务模块：${ctx.plural}（${ctx.label}）${C.reset}`);
  console.log(`${C.dim}  singular=${ctx.singular} plural=${ctx.plural} 类=${ctx.pluralPascal} 字段=[${fields.map((f) => f.name).join(', ')}]${C.reset}\n`);

  const backend = backendFiles(ctx).map((f) => ({ ...f, rel: `Server-NestJS/src/${f.path}` }));
  const frontend = frontendFiles(ctx).map((f) => ({ ...f, rel: `Front-Flutter/lib/${f.path}` }));
  const admin = adminFiles(ctx).map((f) => ({ ...f, rel: `Web-Admin-Vue/${f.path}` }));
  const taro = taroFiles(ctx).map((f) => ({ ...f, rel: `Front-Taro/${f.path}` }));
  // AI 工具（第 11-12 周）：让 Runtime Agent 能安全调用生成模块
  const ai = aiFiles(ctx).map((f) => ({ ...f, rel: `Server-NestJS/src/${f.path}` }));

  if (args.dryRun) {
    console.log(`${C.yellow}[dry-run] 将生成以下文件：${C.reset}`);
    for (const f of [...backend, ...frontend, ...ai]) console.log(`  ${f.rel}`);
    for (const f of admin) console.log(`  ${f.rel}`);
    for (const f of taro) console.log(`  ${f.rel}`);
    const tabNote = ctx.isTab ? ' + app_shell 底部 Tab' : '';
    console.log(`${C.yellow}[dry-run] 将接线：app.module / modules-manifest / feature-flags / main.dart / app_router / i18n / navigate-page.tool / ai.module（query+create 工具）${tabNote} + Web-Admin-Vue（routes/navGroups/i18n）+ Taro（app.config/explore）${C.reset}`);
    if (args.brand) console.log(`${C.yellow}[dry-run] 将替换品牌 → ${args.brand}${C.reset}`);
    return;
  }

  // ── 写文件 ──
  for (const f of backend) await writeGenerated(f.rel, f.content);
  for (const f of frontend) await writeGenerated(f.rel, f.content);
  for (const f of admin) await writeGenerated(f.rel, f.content);
  for (const f of taro) await writeGenerated(f.rel, f.content);
  for (const f of ai) await writeGenerated(f.rel, f.content);
  console.log(`${C.green}✓ 已生成 ${backend.length + frontend.length + admin.length + taro.length + ai.length} 个文件（后端 + AI 工具 + Flutter + Web-Admin-Vue + Taro）${C.reset}`);

  // ── 接线 ──
  const beResults = await wireBackend(ctx);
  const feResults = await wireFrontend(ctx);
  const adminResults = await wireAdmin(ctx);
  const taroResults = await wireTaro(ctx);
  const aiResults = await wireAiModule(ctx);
  const all = summarize([...beResults, ...feResults, ...adminResults, ...taroResults, ...aiResults]);
  for (const file of all.wired) console.log(`${C.green}✓ 接线：${file}${C.reset}`);
  for (const s of all.skipped) {
    console.log(`${C.yellow}△ 跳过：${s.file}（${reasonZh(s.reason)}）${C.reset}`);
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

  // ── 下一步 ──
  console.log(`\n${C.green}════ 完成！下一步 ════${C.reset}`);
  console.log(`  cd Server-NestJS && npm run build        # 验证后端编译`);
  console.log(`  npm test -- ${ctx.plural}.service         # 跑生成模块单测`);
  console.log(`  npm run migration:generate -- src/migrations/Add${ctx.pluralPascal}  # 生成建表迁移（prod postgres 需要，EASY-2.2 结论）`);
  console.log(`  cd Front-Flutter && flutter analyze       # 验证前端接线`);
  console.log(`  flutter run -d chrome                     # 运行看 ${ctx.label} 页`);
  console.log(`  POST /api/v1/${ctx.plural}                # API：/api/docs 看 Swagger`);
  console.log(`${C.dim}  v1 边界：prod(postgres) 需补迁移；未生成底部 Tab；字段仅 5 种类型（见 roadmap EASY-2）${C.reset}\n`);
}

function reasonZh(reason) {
  switch (reason) {
    case 'already-wired': return '已存在，幂等跳过';
    case 'anchor-not-found': return '锚点未找到（可手动接线）';
    case 'anchor-ambiguous': return '锚点匹配多处（可手动接线）';
    case 'file-not-found': return '文件不存在';
    default: return reason;
  }
}

main().catch((e) => {
  console.error(`${C.red}✗ 失败：${e.message}${C.reset}`);
  process.exit(1);
});
