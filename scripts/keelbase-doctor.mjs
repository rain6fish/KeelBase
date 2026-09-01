#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
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
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { readManifest, manifestPath, generatorVersion, MANIFEST_SCHEMA, MANIFEST_IDENTITY, MANIFEST_PROTOCOL } from './generator/manifest.mjs';

const C = { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m' };

const HELP = `KeelBase doctor — 诊断 KeelBase 应用 + 本地环境预检

用法:
  node scripts/keelbase-doctor.mjs              # 诊断当前目录（应用体检）
  node scripts/keelbase-doctor.mjs --env        # 本地环境预检（起容器/起服务前跑一次）
  node scripts/keelbase-init.mjs doctor         # 等价的 CLI 子命令
  node scripts/keelbase-init.mjs doctor --env   # 环境预检子命令

应用检查: ① 完整性（manifest/schema/字段）② 一致性（生成模块目录）③ 运行时兼容（基座能力）
      ④ 生成器版本（manifest vs 当前 CLI）⑤ 兼容矩阵（协议/schema vs 当前 CLI 支持）
环境预检: Node 版本 / Docker / 常用端口 / .env 密钥 / LLM 配置 / 数据库类型（每项给修复指引）
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

export function report(checks) {
  let fail = 0;
  let warn = 0;
  for (const c of checks) {
    if (c.status === 'fail') fail += 1;
    if (c.status === 'warn') warn += 1;
    const mark =
      c.status === 'pass'
        ? `${C.green}✓${C.reset}`
        : c.status === 'warn'
          ? `${C.yellow}⚠${C.reset}`
          : c.status === 'info'
            ? `${C.dim}·${C.reset}`
            : `${C.red}✗${C.reset}`;
    console.log(`  ${mark} ${c.name.padEnd(12)} ${C.dim}${c.detail}${C.reset}`);
    if (c.fix) console.log(`             ${C.yellow}→ ${c.fix}${C.reset}`);
  }
  console.log('');
  const verdict = fail === 0 ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`;
  console.log(`── Result ── ${verdict}（${fail} fail, ${warn} warn）`);
  return fail === 0 ? 0 : 1;
}

// ── 环境预检（--env / --preflight）：起容器/起服务前一次查全 ──

/** 解析 KEY=VALUE 文本（.env），忽略注释与空行；引号包裹的值去引号。 */
export function parseEnv(text) {
  const out = {};
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return out;
}

/** Node 版本检查：后端 engines 要求 >=20。 */
export function checkNodeVersion(v) {
  const major = Number(String(v).split('.')[0]) || 0;
  if (major >= 20) return { status: 'pass', name: 'Node', detail: `v${v}（满足 engines >=20）` };
  return {
    status: major >= 18 ? 'warn' : 'fail',
    name: 'Node',
    detail: `v${v}——后端 engines 要求 >=20`,
    fix: '升级 Node 至 20+（nvm install 20 / nodejs.org 下载 LTS）',
  };
}

/** Docker 检查：serverVersion 为探测结果（'NOT_INSTALLED'/'DAEMON_DOWN'/版本串）。 */
export function checkDocker(serverVersion) {
  if (serverVersion === 'NOT_INSTALLED') {
    return { status: 'fail', name: 'Docker', detail: '未安装 docker CLI', fix: '安装 Docker Desktop（https://www.docker.com/products/docker-desktop/）' };
  }
  if (serverVersion === 'DAEMON_DOWN') {
    return { status: 'fail', name: 'Docker', detail: 'docker 已装但守护进程未运行', fix: '启动 Docker Desktop 等待就绪后重试' };
  }
  return { status: 'pass', name: 'Docker', detail: `server v${serverVersion}` };
}

/** 端口占用检查。 */
export function checkPort(port, free) {
  return free
    ? { status: 'pass', name: `端口 ${port}`, detail: '空闲' }
    : { status: 'warn', name: `端口 ${port}`, detail: '被占用', fix: `停止占用 ${port} 的进程（netstat -ano | findstr :${port}），或改 PORT 环境变量` };
}

const REQUIRED_ENV_KEYS = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
const LLM_KEYS = ['DEEPSEEK_API_KEY', 'QWEN_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'];

/** .env 密钥检查：缺 .env / 缺 JWT 密钥。 */
export function checkEnvSecrets(envText) {
  if (!envText || envText.trim() === '') {
    return { status: 'warn', name: '.env', detail: 'Server-NestJS/.env 缺失', fix: 'cd Server-NestJS && cp .env.example .env（本地开发可直接跑）' };
  }
  const env = parseEnv(envText);
  const missing = REQUIRED_ENV_KEYS.filter((k) => !env[k]);
  if (missing.length) {
    return { status: 'fail', name: '.env', detail: `密钥缺失：${missing.join('、')}`, fix: `在 Server-NestJS/.env 补 ${missing.join('、')}（openssl rand -hex 32）` };
  }
  return { status: 'pass', name: '.env', detail: '存在，JWT 密钥已配置' };
}

/** LLM 配置检查：AI_PROVIDER+key 或本地 Ollama，缺则 AI 降级。 */
export function checkLlm(envText) {
  const env = parseEnv(envText);
  if (env.AI_PROVIDER === 'ollama' || env.OLLAMA_BASE_URL) {
    return { status: 'pass', name: 'LLM', detail: '本地模型已配置（Ollama）' };
  }
  if (env.AI_PROVIDER && LLM_KEYS.some((k) => env[k])) {
    return { status: 'pass', name: 'LLM', detail: `AI_PROVIDER=${env.AI_PROVIDER} + API Key 已配置` };
  }
  return {
    status: 'warn',
    name: 'LLM',
    detail: '未配置 AI 模型——AI 功能将降级不可用',
    fix: 'Server-NestJS/.env 设 AI_PROVIDER + 对应 Key（如 DEEPSEEK_API_KEY），或用本地模型 OLLAMA_BASE_URL=http://localhost:11434',
  };
}

/** 数据库检查：postgres 需服务在跑；sqlite 零配置。 */
export function checkDbType(envText) {
  const env = parseEnv(envText);
  const db = env.DB_TYPE || 'sqlite';
  if (db === 'postgres') {
    return { status: 'warn', name: 'DB', detail: 'DB_TYPE=postgres——需 postgres 服务在跑', fix: 'docker compose up -d postgres，或开发改回 DB_TYPE=sqlite 免配置' };
  }
  return { status: 'pass', name: 'DB', detail: 'DB_TYPE=sqlite（零配置）' };
}

/** 探测 docker server 版本：返回版本串 / 'NOT_INSTALLED' / 'DAEMON_DOWN'。 */
export function dockerServerVersion() {
  return new Promise((resolve) => {
    execFile('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 8000 }, (err, stdout) => {
      if (err) {
        resolve(err.code === 'ENOENT' ? 'NOT_INSTALLED' : 'DAEMON_DOWN');
      } else {
        resolve(stdout.trim() || 'unknown');
      }
    });
  });
}

/** 端口是否可绑定（127.0.0.1）。 */
export function portFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

/** 环境预检主流程：不依赖 manifest，起容器/起服务前跑。 */
export async function runEnvCheck() {
  console.log(`${C.green}KeelBase Doctor — 环境预检${C.reset}`);
  console.log('────────────────────');
  const checks = [];

  checks.push(checkNodeVersion(process.versions.node));
  checks.push(checkDocker(await dockerServerVersion()));
  for (const port of [3000, 10086]) {
    checks.push(checkPort(port, await portFree(port)));
  }

  // 本地开发模式的 .env 相关检查：单容器路径（无 Server-NestJS 目录）无需本地 .env
  let envText = '';
  try {
    envText = await readFile('Server-NestJS/.env', 'utf8');
  } catch {
    envText = '';
  }
  const isRepo = await exists('Server-NestJS');
  if (!isRepo) {
    checks.push({ status: 'info', name: '.env/LLM/DB', detail: '非本地开发目录（单容器 docker run 路径，无需本地 .env）' });
  } else {
    checks.push(checkEnvSecrets(envText));
    checks.push(checkLlm(envText));
    checks.push(checkDbType(envText));
  }

  console.log('Checks:');
  return report(checks);
}

export async function runDoctor(argv = []) {
  if (argv.includes('--env') || argv.includes('--preflight') || argv[0] === 'env') {
    return runEnvCheck();
  }
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
  const args = process.argv.slice(2);
  (args.includes('--env') || args.includes('--preflight') || args[0] === 'env' ? runEnvCheck() : runDoctor(args)).then((code) => {
    process.exitCode = code;
  });
}
