/**
 * EASY-2 接线：把生成模块注册进既有文件。
 * 安全策略：锚点唯一命中；0/多次命中 → 跳过该处 + 返回指引，绝不破坏文件；
 *           marker 已存在 → 幂等跳过（重跑零改动）。
 */
import { readFile, writeFile } from 'node:fs/promises';

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
  const BE = `${root}${sep}Server-Nodejs/src`;

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
      const marker = `BUSINESS_MODULES = ['events', 'todos', '${ctx.plural}'`;
      if (c.includes(marker)) return { content: c, changed: false, reason: 'already-wired' };
      const anchor = `export const BUSINESS_MODULES = ['events', 'todos'] as const;`;
      if (!c.includes(anchor)) return { content: c, changed: false, reason: 'anchor-not-found' };
      return {
        content: c.replace(
          anchor,
          `export const BUSINESS_MODULES = ['events', 'todos', '${ctx.plural}'] as const;`,
        ),
        changed: true,
      };
    }),
  );
  results.push(
    await applyFile(`${BE}/common/modules/modules-manifest.ts`, (c) =>
      insertAfter(
        c,
        `  { id: 'todos', category: 'business', deps: [], label: '待办' },`,
        `\n  { id: '${ctx.plural}', category: 'business', deps: [], label: '${ctx.label}' },`,
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

  return results;
}

/** 前端接线：main.dart + app_router + app_localizations + navigate-page.tool。 */
export async function wireFrontend(ctx, root = '') {
  const results = [];
  const sep = root ? (root.endsWith('/') ? '' : '/') : '';
  const FE = `${root}${sep}Front-Flutter/lib`;
  const BE = `${root}${sep}Server-Nodejs/src`;

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

/** 汇总接线结果，打印已接入/跳过清单。 */
export function summarize(results) {
  const wired = results.filter((r) => r.changed).map((r) => r.file);
  const skipped = results.filter((r) => !r.changed);
  return { wired, skipped };
}
