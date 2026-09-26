#!/usr/bin/env node

// SPDX-License-Identifier: Apache-2.0
/**
 * 移动预览可运行性门禁（/mobile）。
 *
 * Flutter web 产物被拷进静态树的 `mobile/` 子目录，运行时挂在 `/mobile`。下面四件事缺任何一件，
 * 页面都会停在 Loading，**且服务端不报任何错**——只在浏览器里白屏，所以必须机器判定：
 *
 *   1. 挂载基路径：`flutter build web` 默认产出 `<base href="/">`，浏览器于是向根路径取
 *      `flutter_bootstrap.js`（而根路径回的是工作台 HTML）→ 构建必须带 `--base-href=/mobile/`。
 *   2. 自托管资源：默认从 gstatic CDN 取 CanvasKit 与字体，而本应用 CSP 是 `default-src 'self'`，
 *      CDN 请求会被拦 → 构建必须带 `--no-web-resources-cdn`（canvaskit/ 与字体随产物一起发）。
 *   3. 运行时 CSP：CanvasKit 是 WebAssembly，CSP 下编译 wasm 需要 `'wasm-unsafe-eval'`
 *      （`src/main.ts` 的 helmet 配置）；缺它时连 8 字节的最小 wasm 都编译不了。
 *   4. API 基址：`app_constants.dart` 的 `baseUrl` 默认 `http://localhost:3000/api/v1`，构建期须用
 *      `--dart-define=API_BASE_URL=/api/v1` 覆盖成同域相对路径。缺它时**任何部署出来的移动预览
 *      都在连访客自己的 localhost** → `ERR_CONNECTION_REFUSED`；引擎起得来、视图也建了，
 *      界面却永不渲染。
 *   5. 打包字体：Flutter web **会等 pubspec 里打包的字体加载完才跑 `main()`**，所以字体体积
 *      直接等于首帧时间（不是「渲染时才用」）。2026-09-25 实测：16.4MB 的 OTF 在线上那条
 *      ~430KB/s 链路上独占约 39 秒（首帧 61 秒里的大头）。这份中文字体**不能删**（CanvasKit
 *      的回退字体走 fonts.gstatic.com，大陆不可达 → 豆腐块），所以只能压体积，而压体积就要裁字形——
 *      于是这里守三件事：① 声明必须是 woff2；② 合计不超预算；③ **界面文案不得越出子集**
 *      （子集裁掉的字在断网环境下没有回退，直接豆腐，且服务端/类型检查/门禁之外看不出来）。
 *      子集口径与重生成：`scripts/subset-cjk-font.py`。
 *   6. 传输压缩：两份 nginx 配置（`nginx.conf` 与 `nginx.https.conf`）的 gzip 必须一致，且含
 *      `application/wasm`——CanvasKit 引擎本体 5.4MB，gzip 后 2.1MB，是字体子集化之后的最大单项。
 *      两者在 prod 是**替换**关系（overlay 拿 https 那份覆盖 `default.conf`），差一边就等于没压。
 *
 * 第 1/2/4 项是构建参数，第 3 项是服务端响应头，第 5 项是字体资源，第 6 项是传输配置——都由这里守着，
 * 因为它们只在浏览器里现形。三次踩到，每次都是「服务端全绿、浏览器白屏」：先是基路径
 * （陌生人冷跑报告），再是 CSP（单容器实测），后是 API 基址（2026-09-24 用真浏览器定位：
 * 引擎起来了、界面不渲染、控制台 ERR_CONNECTION_REFUSED）。第 5/6 项是性能而非白屏，
 * 但它们和前面几条一样：**服务端毫无异常，只有真浏览器（或这些断言）看得见**。
 *
 * 零依赖（node:fs + node:path），接入：npm run check:mobile-preview
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
/** 可能承载构建命令的位置（不含 docs：散文提及构建命令不算构建点，避免门禁误报）。 */
const SITES = ['scripts', 'deploy', '.github/workflows'];
const ROOT_FILES = ['Dockerfile', 'Dockerfile.single', 'Makefile'];
const SCAN_EXT = ['.sh', '.bash', '.yml', '.yaml', '.mjs', '.js', '.ts'];

const CMD_RE = /flutter build web/;
/** 构建参数：挂载基路径、自托管 web 资源、API 基址覆盖。 */
const FLAGS = ['--base-href=/mobile/', '--no-web-resources-cdn', '--dart-define=API_BASE_URL='];
/** 已构建产物：存在则顺带校验（CI 在 flutter build 之后跑时命中）。 */
const ARTIFACT = 'Front-Flutter/build/web/index.html';
const ARTIFACT_BOOTSTRAP = 'Front-Flutter/build/web/flutter_bootstrap.js';
/** 编译产物：用来查 API 基址是否被编成了 localhost 默认值。 */
const ARTIFACT_BUNDLE = 'Front-Flutter/build/web/main.dart.js';
/** 未传 --dart-define 时被编进产物的默认 API 基址（`app_constants.dart`）。 */
const API_DEFAULT_MARKER = 'http://localhost:3000/api/v1';
/** 运行时 CSP：wasm 编译许可（helmet 配置所在文件）。 */
const CSP_FILE = 'Server-NestJS/src/main.ts';
const CSP_MARKER = "'wasm-unsafe-eval'";
/** 打包字体声明处（`fonts:` 段），及其体积预算。 */
const PUBSPEC = 'Front-Flutter/pubspec.yaml';
/**
 * 2026-09-26 实测量级：GB2312 子集 1.8MiB。
 * 余量给足，但这道线挡得住两种回退：换回全字形（11.4MiB）、或把 layout features 放回 `*`（3.2MiB）。
 */
const FONT_BUDGET_BYTES = 3 * 1024 * 1024;
/** 子集覆盖清单（由 scripts/subset-cjk-font.py 生成）。 */
const FONT_COVERAGE = 'Front-Flutter/assets/fonts/NotoSansSC-Regular.coverage.txt';
/** 界面文案所在目录：其中的非 ASCII 字符必须全部落在子集内，否则界面会出现豆腐块。 */
const UI_DIR = 'Front-Flutter/lib';
/**
 * 两份 nginx 配置必须有一致的 gzip 设置。prod overlay 拿 `nginx.https.conf` **替换**
 * `/etc/nginx/conf.d/default.conf`，所以写在其中一份里的压缩设置在另一份不生效——
 * 2026-09-25 就是这么丢的：`nginx.conf` 有 gzip、`nginx.https.conf` 没有，线上前端产物一直明文传输。
 */
const NGINX_CONFS = ['nginx.conf', 'nginx.https.conf'];
/** 必须被压缩的类型：CanvasKit 引擎本体是 5.4MB 的 wasm，gzip 后 2.1MB，是当前最大单项。 */
const GZIP_REQUIRED_TYPES = ['application/wasm'];

/** 本文件自身的注释与正则字面量含同样的字面量，不参与判定。 */
const SELF = 'scripts/check-mobile-preview.mjs';

const problems = [];

async function scanFile(path) {
  if (path === SELF) return;
  const isShell = /\.(sh|bash)$/.test(path);
  const text = await readFile(join(ROOT, path), 'utf8');
  text.split('\n').forEach((line, i) => {
    if (!CMD_RE.test(line)) return;
    if (line.trim().startsWith('#')) return;
    const missing = FLAGS.filter((flag) => !line.includes(flag));
    if (missing.length > 0) {
      problems.push(`${path}:${i + 1} 构建命令缺少 ${missing.join(' ')}\n    ${line.trim()}`);
    }
    // Git Bash 会把形如 `--base-href=/mobile/` 里以 / 开头的值改写成 Windows 路径，
    // flutter 于是报「should start and end with /」且不产出（2026-09-22 实测）。
    // 故 shell 脚本里必须禁用该转换，否则本机构建静默失败、镜像里没有可用产物。
    if (isShell && !line.includes('MSYS_NO_PATHCONV')) {
      problems.push(
        `${path}:${i + 1} 需加 MSYS_NO_PATHCONV=1（Git Bash 会改写 --base-href 的值，导致构建静默失败）\n    ${line.trim()}`,
      );
    }
  });
}

async function walk(rel) {
  let entries;
  try {
    entries = await readdir(join(ROOT, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = `${rel}/${entry.name}`;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.isDirectory()) await walk(child);
    else if (SCAN_EXT.some((ext) => entry.name.endsWith(ext))) await scanFile(child);
  }
}

for (const site of SITES) await walk(site);
for (const file of ROOT_FILES) {
  try {
    await stat(join(ROOT, file));
    await scanFile(file);
  } catch {
    /* 该文件不存在则跳过 */
  }
}

// 运行时 CSP：helmet 必须放行 wasm 编译，否则 CanvasKit 永远起不来
try {
  const mainTs = await readFile(join(ROOT, CSP_FILE), 'utf8');
  if (!mainTs.includes(CSP_MARKER)) {
    problems.push(
      `${CSP_FILE} 的 CSP 未授予 ${CSP_MARKER}——CanvasKit 是 WebAssembly，被拦则 /mobile 白屏`,
    );
  }
} catch {
  /* 文件不存在（如裁剪过的检出）则跳过 */
}

// 产物校验：构建过 Flutter web 时才判定，避免本地未构建时误红。
try {
  const html = await readFile(join(ROOT, ARTIFACT), 'utf8');
  if (!html.includes('base href="/mobile/"')) {
    const found = html.match(/<base href="([^"]*)">/)?.[1] ?? '（无 base 标签）';
    problems.push(
      `${ARTIFACT} 的 base href 为 ${found}，应为 /mobile/\n` +
        `    该产物被挂到 /mobile，需重新构建：cd Front-Flutter && flutter build web --base-href=/mobile/ --no-web-resources-cdn`,
    );
  }
  const bootstrap = await readFile(join(ROOT, ARTIFACT_BOOTSTRAP), 'utf8');
  if (!bootstrap.includes('"useLocalCanvasKit":true')) {
    problems.push(
      `${ARTIFACT_BOOTSTRAP} 未自托管 CanvasKit（缺 useLocalCanvasKit）——` +
        `该产物仍会去 gstatic 取，被 CSP 拦后白屏；请带 --no-web-resources-cdn 重新构建`,
    );
  }
  // API 基址：默认值若被编进产物，说明构建没传 --dart-define=API_BASE_URL=。
  // 「构建命令」检查挡不住这条路径——deploy.sh 在产物已存在时**直接用预构建产物**
  // （ECS 上那份就是这样从 Aug 14 一路用到 2026-09-24 的），故必须查产物本身。
  const bundle = await readFile(join(ROOT, ARTIFACT_BUNDLE), 'utf8');
  if (bundle.includes(API_DEFAULT_MARKER)) {
    problems.push(
      `${ARTIFACT_BUNDLE} 编进了 API 默认基址 ${API_DEFAULT_MARKER}——` +
        `构建缺 --dart-define=API_BASE_URL=/api/v1，部署后每个访客的浏览器都会去连自己的 localhost\n` +
        `    请带该参数重新构建：cd Front-Flutter && flutter build web --base-href=/mobile/ --no-web-resources-cdn --dart-define=API_BASE_URL=/api/v1`,
    );
  }
} catch {
  /* 未构建，跳过产物校验 */
}

// 打包字体：Flutter web 会等它加载完才跑 main()，故体积直接等于首帧时间。
// 查声明处而非产物，这样未构建时也能判定（CI 不必先 flutter build）。
try {
  const pubspec = await readFile(join(ROOT, PUBSPEC), 'utf8');
  const fontAssets = [...pubspec.matchAll(/^\s*-\s*asset:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  let total = 0;
  for (const asset of fontAssets) {
    const rel = `Front-Flutter/${asset}`;
    try {
      total += (await stat(join(ROOT, rel))).size;
    } catch {
      problems.push(`${PUBSPEC} 声明的字体资源不存在：${rel}`);
      continue;
    }
    if (!asset.endsWith('.woff2')) {
      problems.push(
        `${PUBSPEC} 声明的字体 ${asset} 不是 woff2——Flutter web 会等打包字体加载完才跑 main()，\n` +
          `    字体体积直接计入首帧（2026-09-25 实测：16.4MB 的 OTF 独占约 39 秒）。转换：\n` +
          `    pip install fonttools brotli && python -m fontTools.ttLib.woff2 compress -o <name>.woff2 <name>.otf`,
      );
    }
  }
  if (total > FONT_BUDGET_BYTES) {
    problems.push(
      `打包字体合计 ${(total / 1024 / 1024).toFixed(1)}MB，超出预算 ` +
        `${FONT_BUDGET_BYTES / 1024 / 1024}MB——Flutter web 等它加载完才跑 main()，这直接等于首帧时间\n` +
        `    子集口径与重生成方式见 scripts/subset-cjk-font.py`,
    );
  }

  // 界面文案必须落在子集内。子集裁掉的字在断网（大陆）环境下没有回退可用，直接显示豆腐块——
  // 服务端、类型检查、截图之外的任何检查都看不出这件事，只有这条断言能发现。
  const coverageRaw = await readFile(join(ROOT, FONT_COVERAGE), 'utf8');
  const covLines = coverageRaw.split('\n');
  const covered = new Set(covLines.slice(2).join(''));
  const covBytes = Number(covLines[1]);
  if (covBytes !== total) {
    problems.push(
      `${FONT_COVERAGE} 记录的字体字节数 ${covBytes} 与声明的字体（${total}）不一致——` +
        `字体换了但没重跑 scripts/subset-cjk-font.py`,
    );
  }
  const uiChars = new Set();
  const collect = async (rel) => {
    let entries;
    try {
      entries = await readdir(join(ROOT, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) await collect(child);
      else if (e.name.endsWith('.dart')) {
        for (const ch of await readFile(join(ROOT, child), 'utf8')) {
          if (ch.codePointAt(0) > 127) uiChars.add(ch);
        }
      }
    }
  };
  await collect(UI_DIR);
  const missing = [...uiChars].filter((ch) => !covered.has(ch));
  if (missing.length > 0) {
    problems.push(
      `${UI_DIR} 里有 ${missing.length} 个字符不在字体子集内，这些字在界面上会显示为豆腐块：${missing.join('')}\n` +
        `    重跑：python scripts/subset-cjk-font.py --source <全字形源字体>`,
    );
  }
} catch {
  /* pubspec 或覆盖清单不存在（裁剪过的检出）则跳过 */
}

// 两份 nginx 配置的 gzip 必须一致（一份替换另一份，缺一边就等于没压）
try {
  const parseGzip = (text) => {
    const m = text.match(/^\s*gzip_types\s+([^;]+);/m);
    return m ? new Set(m[1].trim().split(/\s+/)) : null;
  };
  const types = [];
  for (const file of NGINX_CONFS) {
    const set = parseGzip(await readFile(join(ROOT, file), 'utf8'));
    if (set === null) {
      problems.push(`${file} 没有 gzip_types——另一份配置在 prod 里是替换关系，缺一边就等于不压缩`);
      continue;
    }
    const missing = GZIP_REQUIRED_TYPES.filter((t) => !set.has(t));
    if (missing.length > 0) {
      problems.push(
        `${file} 的 gzip_types 缺 ${missing.join(' ')}——CanvasKit 的 wasm 有 5.4MB，不压就白等约 8 秒`,
      );
    }
    types.push(set);
  }
  if (types.length === 2) {
    const [a, b] = types;
    const diff = [...a].filter((t) => !b.has(t)).concat([...b].filter((t) => !a.has(t)));
    if (diff.length > 0) {
      problems.push(
        `${NGINX_CONFS.join(' 与 ')} 的 gzip_types 不一致（${diff.join(' ')}）——` +
          `两者是替换关系，差异只在对应环境下才暴露`,
      );
    }
  }
} catch {
  /* 配置不存在（裁剪过的检出）则跳过 */
}

if (problems.length > 0) {
  console.error('✗ 移动预览门禁未通过：\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\n说明：前四项缺一都会让 /mobile 停在 Loading，且服务端不报错——只在浏览器里白屏；');
  console.error('第五项（打包字体）不白屏，但直接等于首帧时间。');
  process.exit(1);
}

console.log(
  '✓ 移动预览门禁通过（基路径 + 自托管资源 + CSP 允许 wasm + API 基址已覆盖 + 打包字体 woff2、在预算内、且盖住界面文案 + nginx 压缩一致含 wasm）',
);
