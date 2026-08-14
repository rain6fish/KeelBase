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
import { wireBackend, wireFrontend, summarize } from './generator/wire.mjs';

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m',
};

const HELP = `KeelBase CLI — 按基座约定生成业务模块（EASY-2）

用法:
  node scripts/keelbase-init.mjs                    # 交互式引导
  node scripts/keelbase-init.mjs --module posts --label 帖子 --fields title:string,content:text

选项:
  --module <name>      模块英文名（小写，如 posts / user_profile）
  --label <中文>       模块中文名（1-12 字）
  --fields <a:type,b>  字段列表，type 支持 string/text/int/bool/date（默认 string）
  --brand <name>       替换应用品牌名（写 app_constants.dart）
  --dry-run            只预览，不写文件
  --no-feature-flag    生成模块不加特性开关
  -h, --help           显示帮助
`;

function parseArgs(argv) {
  const args = { featureFlag: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-feature-flag') args.featureFlag = false;
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

  // ── 收集输入：交互补缺 ──
  let name = args.module;
  let label = args.label;
  let fieldsStr = args.fields;

  if (!name || !label || !fieldsStr) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!name) name = await prompt(rl, '模块英文名（小写，如 posts）', 'posts');
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
  const fields = parseFields(fieldsStr);
  const fieldsErr = validateFields(fields);
  if (fieldsErr) fail(fieldsErr);

  const ctx = buildContext(name, label, fields);
  ctx.featureFlag = args.featureFlag !== false;

  // 目标目录冲突检查
  const beDir = `Server-Nodejs/src/${ctx.plural}`;
  if (!args.dryRun && (await exists(beDir))) {
    fail(`目录已存在：${beDir}（模块 ${ctx.plural} 似乎已生成过）`);
  }

  console.log(`\n${C.yellow}生成业务模块：${ctx.plural}（${ctx.label}）${C.reset}`);
  console.log(`${C.dim}  singular=${ctx.singular} plural=${ctx.plural} 类=${ctx.pluralPascal} 字段=[${fields.map((f) => f.name).join(', ')}]${C.reset}\n`);

  const backend = backendFiles(ctx).map((f) => ({ ...f, rel: `Server-Nodejs/src/${f.path}` }));
  const frontend = frontendFiles(ctx).map((f) => ({ ...f, rel: `Front-Flutter/lib/${f.path}` }));

  if (args.dryRun) {
    console.log(`${C.yellow}[dry-run] 将生成以下文件：${C.reset}`);
    for (const f of [...backend, ...frontend]) console.log(`  ${f.rel}`);
    console.log(`${C.yellow}[dry-run] 将接线：app.module / modules-manifest / feature-flags / main.dart / app_router / i18n / navigate-page.tool${C.reset}`);
    if (args.brand) console.log(`${C.yellow}[dry-run] 将替换品牌 → ${args.brand}${C.reset}`);
    return;
  }

  // ── 写文件 ──
  for (const f of backend) await writeGenerated(f.rel, f.content);
  for (const f of frontend) await writeGenerated(f.rel, f.content);
  console.log(`${C.green}✓ 已生成 ${backend.length + frontend.length} 个文件${C.reset}`);

  // ── 接线 ──
  const beResults = await wireBackend(ctx);
  const feResults = await wireFrontend(ctx);
  const all = summarize([...beResults, ...feResults]);
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
  console.log(`  cd Server-Nodejs && npm run build        # 验证后端编译`);
  console.log(`  npm test -- ${ctx.plural}.service         # 跑生成模块单测`);
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
