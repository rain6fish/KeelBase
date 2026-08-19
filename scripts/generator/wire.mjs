/**
 * EASY-2 接线：把生成模块注册进既有文件。
 * 安全策略：锚点唯一命中；0/多次命中 → 跳过该处 + 返回指引，绝不破坏文件；
 *           marker 已存在 → 幂等跳过（重跑零改动）。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { adminI18nKeys } from './templates-admin.mjs';

/** 在 anchor 之后插入；marker 已存在则幂等跳过。 */
function insertAfter(content, anchor, insertion, marker) {
  if (marker && content.includes(marker)) {
    return { content, changed: false, reason: 'already-wired' };
  }
  if (!content.includes(anchor)) {
    return { content, changed: false, reason: 'anchor-not-found' };
  }
  if (content.split(anchor).length - 1 > 1) {
    return { content, changed: false, reason: 'anchor-ambiguous' };
  }
  const at = content.indexOf(anchor) + anchor.length;
  return {
    content: content.slice(0, at) + insertion + content.slice(at),
    changed: true,
  };
}

/** 在 anchor 之前插入。 */
function insertBefore(content, anchor, insertion, marker) {
  if (marker && content.includes(marker)) {
    return { content, changed: false, reason: 'already-wired' };
  }
  if (!content.includes(anchor)) {
    return { content, changed: false, reason: 'anchor-not-found' };
  }
  if (content.split(anchor).length - 1 > 1) {
    return { content, changed: false, reason: 'anchor-ambiguous' };
  }
  const at = content.indexOf(anchor);
  return {
    content: content.slice(0, at) + insertion + content.slice(at),
    changed: true,
  };
}

async function applyFile(file, fn) {
  const abs = `${file}`;
  let original;
  try {
    original = await readFile(abs, 'utf8');
  } catch {
    return { file, changed: false, reason: 'file-not-found' };
  }
  const { content, changed, reason } = fn(original);
  if (!changed) return { file, changed: false, reason };
  await writeFile(abs, content, 'utf8');
  return { file, changed: true, reason };
}

/** 后端接线：app.module + modules-manifest + feature-flags（可选）。root 默认仓库根（cwd）。 */
export async function wireBackend(ctx, root = '') {
  const results = [];
  const sep = root ? (root.endsWith('/') ? '' : '/') : '';
  const BE = `${root}${sep}Server-NestJS/src`;

  // 1) app.module.ts：import + imports 数组
  results.push(
    await applyFile(`${BE}/app.module.ts`, (c) =>
      insertAfter(
        c,
        `import { TodosModule } from './todos/todos.module';`,
        `\nimport { ${ctx.pluralPascal}Module } from './${ctx.plural}/${ctx.plural}.module';`,
        `./${ctx.plural}/${ctx.plural}.module`,
      ),
    ),
  );
  results.push(
    await applyFile(`${BE}/app.module.ts`, (c) =>
      insertAfter(
        c,
        `    TodosModule,`,
        `\n    ${ctx.pluralPascal}Module,`,
        `${ctx.pluralPascal}Module,`,
      ),
    ),
  );

  // 2) modules-manifest.ts：BUSINESS_MODULES + businessEntries
  results.push(
    await applyFile(`${BE}/common/modules/modules-manifest.ts`, (c) => {
      if (new RegExp(`'${ctx.plural}'`).test(c)) return { content: c, changed: false, reason: 'already-wired' };
      const m = c.match(/(export const BUSINESS_MODULES = \[)([^\]]*)(\])/);
      if (!m) return { content: c, changed: false, reason: 'anchor-not-found' };
      const inner = m[2].trim();
      const next = `${m[1]}${inner}${inner ? ', ' : ''}'${ctx.plural}'${m[3]}`;
      return { content: c.replace(m[0], next), changed: true };
    }),
  );
  results.push(
    await applyFile(`${BE}/common/modules/modules-manifest.ts`, (c) =>
      insertAfter(
        c,
        `  { id: 'todos', category: 'business', deps: [], label: '待办' },`,
        `\n  { id: '${ctx.plural}', category: 'business', deps: [], label: '${ctx.label}', description: '${ctx.label}（${ctx.plural} 模块，keelbase init 生成）' },`,
        `id: '${ctx.plural}'`,
      ),
    ),
  );

  // 3) feature-flags.constants.ts（可选）
  if (ctx.featureFlag) {
    results.push(
      await applyFile(`${BE}/feature-flags/feature-flags.constants.ts`, (c) =>
        insertAfter(
          c,
          `  TODOS: 'todos',`,
          `\n  ${ctx.plural.toUpperCase().replace(/-/g, '_')}: '${ctx.plural}',`,
          `'${ctx.plural}',`,
        ),
      ),
    );
  }

  // 4) CaslAbilityFactory：生成模块 CASL 规则（本人所有权）——否则本人更新/删除 403
  results.push(
    await applyFile(`${BE}/common/casl/casl-ability.factory.ts`, (c) =>
      insertAfter(
        c,
        `      can('manage', 'Todo', { userId: user.sub });`,
        `\n      // keelbase init 生成模块\n      can('manage', '${ctx.singlePascal}', { userId: user.sub });`,
        `can('manage', '${ctx.singlePascal}'`,
      ),
    ),
  );

  return results;
}

/** 前端接线：main.dart + app_router + app_localizations + navigate-page.tool。 */
export async function wireFrontend(ctx, root = '') {
  const results = [];
  const sep = root ? (root.endsWith('/') ? '' : '/') : '';
  const FE = `${root}${sep}Front-Flutter/lib`;
  const BE = `${root}${sep}Server-NestJS/src`;

  // 4) main.dart：imports + Provider
  results.push(
    await applyFile(`${FE}/main.dart`, (c) => {
      const anchor = `import 'features/todos/data/repositories/todos_repository.dart';`;
      const marker = `features/${ctx.plural}/presentation/providers`;
      if (c.includes(marker)) return { content: c, changed: false, reason: 'already-wired' };
      if (!c.includes(anchor)) return { content: c, changed: false, reason: 'anchor-not-found' };
      const insertion =
        `\nimport 'features/${ctx.plural}/data/repositories/${ctx.plural}_repository.dart';\n` +
        `import 'features/${ctx.plural}/presentation/providers/${ctx.plural}_provider.dart';\n`;
      return {
        content: c.slice(0, c.indexOf(anchor) + anchor.length) + insertion + c.slice(c.indexOf(anchor) + anchor.length),
        changed: true,
      };
    }),
  );
  results.push(
    await applyFile(`${FE}/main.dart`, (c) =>
      insertAfter(
        c,
        `        ChangeNotifierProvider<TodosProvider>(\n          create: (_) => TodosProvider(TodosRepository(apiClient), cache: AppCache(prefs)),\n        ),`,
        `\n        // ${ctx.label}（EASY-2 生成）\n        ChangeNotifierProvider<${ctx.pluralPascal}Provider>(\n          create: (_) => ${ctx.pluralPascal}Provider(${ctx.pluralPascal}Repository(apiClient), cache: AppCache(prefs)),\n        ),`,
        `${ctx.pluralPascal}Provider(`,
      ),
    ),
  );

  // 5) app_router.dart：import + 顶层路由
  results.push(
    await applyFile(`${FE}/core/router/app_router.dart`, (c) =>
      insertAfter(
        c,
        `import '../../features/todos/presentation/pages/todos_page.dart';`,
        `\nimport '../../features/${ctx.plural}/presentation/pages/${ctx.plural}_page.dart';`,
        `features/${ctx.plural}/presentation/pages`,
      ),
    ),
  );
  results.push(
    await applyFile(`${FE}/core/router/app_router.dart`, (c) => {
      if (ctx.isTab) {
        // --tab：作为底部 Tab 的 StatefulShellBranch，追加到 todos 分支后
        return insertAfter(
          c,
          `                pageBuilder: (_, _) => const NoTransitionPage(child: TodosPage()),\n              ),\n            ],\n          ),`,
          `\n          StatefulShellBranch(\n            routes: [\n              GoRoute(\n                path: '/${ctx.plural}',\n                pageBuilder: (_, _) => const NoTransitionPage(child: ${ctx.pluralPascal}Page()),\n              ),\n            ],\n          ),`,
          `path: '/${ctx.plural}'`,
        );
      }
      // 非 tab：顶层全屏页
      return insertBefore(
        c,
        `      // Legal pages`,
        `      // ${ctx.label}（EASY-2 生成）\n      GoRoute(\n        path: '/${ctx.plural}',\n        builder: (_, _) => const ${ctx.pluralPascal}Page(),\n      ),\n`,
        `path: '/${ctx.plural}'`,
      );
    }),
  );

  // 6) --tab：app_shell 底部 Tab + i18n tab 标签
  if (ctx.isTab) {
    results.push(
      await applyFile(`${FE}/core/widgets/app_shell.dart`, (c) =>
        insertAfter(
          c,
          `    _TabItem(icon: CupertinoIcons.checkmark_square, labelKey: 'tabTodos'),`,
          `\n    _TabItem(icon: CupertinoIcons.doc_text, labelKey: 'tab${ctx.pluralPascal}'),`,
          `labelKey: 'tab${ctx.pluralPascal}'`,
        ),
      ),
    );
    results.push(
      await applyFile(`${FE}/core/widgets/app_shell.dart`, (c) =>
        insertAfter(
          c,
          `      case 'tabTodos':\n        return l10n.tabTodos;`,
          `\n      case 'tab${ctx.pluralPascal}':\n        return l10n.tab${ctx.pluralPascal};`,
          `case 'tab${ctx.pluralPascal}'`,
        ),
      ),
    );
    results.push(
      await applyFile(`${FE}/core/i18n/app_localizations.dart`, (c) =>
        insertAfter(
          c,
          `  String get tabTodos => _t('Todos', '待办');`,
          `\n  String get tab${ctx.pluralPascal} => _t('${ctx.singlePascal}', '${ctx.label}');`,
          `tab${ctx.pluralPascal}`,
        ),
      ),
    );
  }

  // 7) app_localizations.dart：4 个页面 getter
  const enTitle = ctx.singlePascal;
  results.push(
    await applyFile(`${FE}/core/i18n/app_localizations.dart`, (c) =>
      insertAfter(
        c,
        `  String get deleteTodoConfirm => _t('Delete this todo?', '删除该待办？');`,
        `\n\n  // --- ${ctx.label}（EASY-2 生成） ---\n` +
          `  String get ${ctx.plural}Title => _t('${enTitle}', '${ctx.label}');\n` +
          `  String get ${ctx.plural}AddTitle => _t('New ${enTitle}', '新增${ctx.label}');\n` +
          `  String get ${ctx.plural}Empty => _t('No ${enTitle} yet', '暂无${ctx.label}');\n` +
          `  String get ${ctx.plural}DeleteConfirm => _t('Delete this ${enTitle.toLowerCase()}?', '删除该${ctx.label}？');`,
        `String get ${ctx.plural}Title`,
      ),
    ),
  );

  // 8) navigate-page.tool.ts：PAGE_ROUTES
  results.push(
    await applyFile(`${BE}/ai/tools/navigate-page.tool.ts`, (c) =>
      insertAfter(
        c,
        `  todos: { route: '/todos', description: '待办清单' },`,
        `\n  ${ctx.plural}: { route: '/${ctx.plural}', description: '${ctx.label}' },`,
        `  ${ctx.plural}: { route: '/${ctx.plural}'`,
      ),
    ),
  );

  return results;
}

/** AI 工具接线（第 11-12 周）：ai.module.ts 注册生成的 query/create 工具。 */
export async function wireAiModule(ctx, root = '') {
  const results = [];
  const sep = root ? (root.endsWith('/') ? '' : '/') : '';
  const BE = `${root}${sep}Server-NestJS/src`;
  const AI = `${BE}/ai/ai.module.ts`;

  // 1) 模块 + service import
  results.push(
    await applyFile(AI, (c) =>
      insertAfter(
        c,
        `import { TodosService } from '../todos/todos.service';`,
        `\nimport { ${ctx.pluralPascal}Module } from '../${ctx.plural}/${ctx.plural}.module';\nimport { ${ctx.pluralPascal}Service } from '../${ctx.plural}/${ctx.plural}.service';`,
        `../${ctx.plural}/${ctx.plural}.module`,
      ),
    ),
  );
  // 2) 工具文件 import
  results.push(
    await applyFile(AI, (c) =>
      insertAfter(
        c,
        `import { CreateTodoTool } from './tools/create-todo.tool';`,
        `\nimport { Query${ctx.pluralPascal}Tool } from './tools/query-${ctx.plural}.tool';\nimport { Create${ctx.singlePascal}Tool } from './tools/create-${ctx.plural}.tool';`,
        `./tools/query-${ctx.plural}.tool`,
      ),
    ),
  );
  // 3) imports 数组
  results.push(
    await applyFile(AI, (c) =>
      insertAfter(c, `    TodosModule,`, `\n    ${ctx.pluralPascal}Module,`, `${ctx.pluralPascal}Module,`),
    ),
  );
  // 4) useFactory 参数
  results.push(
    await applyFile(AI, (c) =>
      insertAfter(
        c,
        `        todosService: TodosService,`,
        `\n        ${ctx.plural}Service: ${ctx.pluralPascal}Service,`,
        `${ctx.plural}Service: ${ctx.pluralPascal}Service`,
      ),
    ),
  );
  // 5) inject 数组：`TodosService, `（大写 + 逗号 + 空格）仅在 inject 数组出现（useFactory 参数是逗号+换行），唯一锚点
  results.push(
    await applyFile(AI, (c) =>
      insertAfter(
        c,
        `TodosService, `,
        `${ctx.pluralPascal}Service, `,
        `${ctx.pluralPascal}Service, MemoriesService`,
      ),
    ),
  );
  // 6) 注册 query + create 工具
  results.push(
    await applyFile(AI, (c) =>
      insertAfter(
        c,
        `        toolRegistry.register(new CreateTodoTool(todosService));`,
        `\n        // ${ctx.label}（EASY-2 自动生成 AI 工具：读 + 写需确认）\n        toolRegistry.register(new Query${ctx.pluralPascal}Tool(${ctx.plural}Service));\n        toolRegistry.register(new Create${ctx.singlePascal}Tool(${ctx.plural}Service));`,
        `new Query${ctx.pluralPascal}Tool(`,
      ),
    ),
  );

  return results;
}

/** Web-Admin-Vue 接线（⑤-2）：routes + navGroups + i18n zh/en。 */
export async function wireAdmin(ctx, root = '') {
  const results = [];
  const sep = root ? (root.endsWith('/') ? '' : '/') : '';
  const WA = `${root}${sep}Web-Admin-Vue/src`;
  const keys = adminI18nKeys(ctx);

  // 1) 路由：data-import 后加懒加载管理路由
  results.push(
    await applyFile(`${WA}/router/routes.ts`, (c) =>
      insertAfter(
        c,
        `{ path: 'data-import', name: 'data-import', component: () => import('@/views/data-import/DataImportView.vue'), meta: { title: 'navDataImport' } },`,
        `\n      { path: '${ctx.plural}', name: '${ctx.plural}', component: () => import('@/views/${ctx.plural}/${ctx.pluralPascal}View.vue'), meta: { title: 'nav${ctx.pluralPascal}' } },`,
        `name: '${ctx.plural}'`,
      ),
    ),
  );

  // 2) 侧边栏：navData 组 data-import 后加菜单项
  results.push(
    await applyFile(`${WA}/layouts/AdminLayout.vue`, (c) =>
      insertAfter(
        c,
        `{ name: 'data-import', to: '/data-import', icon: 'mdi-upload-multiple', label: t('navDataImport') },`,
        `\n      { name: '${ctx.plural}', to: '/${ctx.plural}', icon: 'mdi-database-outline', label: t('nav${ctx.pluralPascal}') },`,
        `name: '${ctx.plural}'`,
      ),
    ),
  );

  // 3) i18n：zh + en
  for (const [lang, zh] of [['zh', keys.zh], ['en', keys.en]]) {
    const anchor = lang === 'zh' ? `  navDataImport: '数据导入',` : `  navDataImport: 'Data Import',`;
    const insertion =
      `\n  ${Object.entries(zh).map(([k, v]) => `${k}: '${v}',`).join('\n  ')}`;
    results.push(
      await applyFile(`${WA}/i18n/${lang}.ts`, (c) =>
        insertAfter(c, anchor, insertion, `nav${ctx.pluralPascal}`),
      ),
    );
  }

  return results;
}

/** Taro（Vue3）接线（⑤-3）：app.config pages + explore quickCards。 */
export async function wireTaro(ctx, root = '') {
  const results = [];
  const sep = root ? (root.endsWith('/') ? '' : '/') : '';
  const TARO = `${root}${sep}Front-Taro/src`;

  results.push(
    await applyFile(`${TARO}/app.config.ts`, (c) =>
      insertAfter(
        c,
        `    'pages/search/index',`,
        `\n    'pages/${ctx.plural}/index',`,
        `'pages/${ctx.plural}/index'`,
      ),
    ),
  );
  results.push(
    await applyFile(`${TARO}/pages/explore/index.vue`, (c) =>
      insertAfter(
        c,
        `  { icon: '⚙️', label: 'Settings', color: '#9333EA', path: '/pages/settings/index' },`,
        `\n  { icon: '📦', label: '${ctx.label}', color: '#F97316', path: '/pages/${ctx.plural}/index' },`,
        `path: '/pages/${ctx.plural}/index'`,
      ),
    ),
  );

  return results;
}

/** 汇总接线结果，打印已接入/跳过清单。 */
export function summarize(results) {
  const wired = results.filter((r) => r.changed).map((r) => r.file);
  const skipped = results.filter((r) => !r.changed);
  return { wired, skipped };
}
