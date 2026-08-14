/**
 * EASY-2 CLI 单测（node:test，零依赖）。
 * 运行：node --test scripts/keelbase-init.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  validateModuleName,
  validateLabel,
  parseFields,
  validateFields,
  buildContext,
  toSingular,
  toPlural,
  toPascal,
} from './generator/validate.mjs';
import { backendFiles } from './generator/templates-backend.mjs';
import { frontendFiles } from './generator/templates-frontend.mjs';
import { adminFiles } from './generator/templates-admin.mjs';
import { taroFiles } from './generator/templates-taro.mjs';
import { wireBackend, wireFrontend, wireAdmin, wireTaro } from './generator/wire.mjs';
import { buildSpecPrompt, parseSpecResponse, extractSpec, llmConfig } from './generator/llm.mjs';

// ── 工具 ─────────────────────────────────────────────────────────────────────
async function tempRoot() {
  const dir = await mkdtemp(join(tmpdir(), 'keelbase-cli-'));
  return dir.replace(/\\/g, '/');
}

const BE = (root, p) => `${root}/Server-Nodejs/src/${p}`;
const FE = (root, p) => `${root}/Front-Flutter/lib/${p}`;

async function write(p, c) {
  await mkdir(p.substring(0, p.lastIndexOf('/')), { recursive: true });
  await writeFile(p, c, 'utf8');
}

/** 生成一套最小接线 fixture（含各锚点）。 */
async function makeFixtures(root) {
  await write(BE(root, 'app.module.ts'), `import { TodosModule } from './todos/todos.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [
    EventsModule,
    TodosModule,
  ],
})
export class AppModule {}

const MIGRATIONS = [
  'dist/migrations/*AddAiToolSideEffects*.js',
];
`);
  await write(
    BE(root, 'common/modules/modules-manifest.ts'),
    `export const BUSINESS_MODULES = ['events', 'todos'] as const;

const businessEntries: ModuleManifestEntry[] = [
  { id: 'events', category: 'business', deps: ['notifications'], label: '事件' },
  { id: 'todos', category: 'business', deps: [], label: '待办' },
];`,
  );
  await write(
    BE(root, 'feature-flags/feature-flags.constants.ts'),
    `export const FEATURE_KEYS = {
  TODOS: 'todos',
} as const;`,
  );
  await write(
    BE(root, 'ai/tools/navigate-page.tool.ts'),
    `const PAGE_ROUTES: Record<string, { route: string; description: string }> = {
  todos: { route: '/todos', description: '待办清单' },
};`,
  );
  await write(
    FE(root, 'main.dart'),
    `import 'features/todos/data/repositories/todos_repository.dart';
import 'features/todos/presentation/providers/todos_provider.dart';

      providers: [
        ChangeNotifierProvider<TodosProvider>(
          create: (_) => TodosProvider(TodosRepository(apiClient), cache: AppCache(prefs)),
        ),
      ],`,
  );
  await write(
    FE(root, 'core/router/app_router.dart'),
    `import '../../features/todos/presentation/pages/todos_page.dart';
    routes: [
      // Legal pages
    ],`,
  );
  await write(
    FE(root, 'core/i18n/app_localizations.dart'),
    `  String get deleteTodoConfirm => _t('Delete this todo?', '删除该待办？');
}`,
  );
}

function ctx(over = {}) {
  return { ...buildContext('posts', '帖子', parseFields('title:string,content:text')), featureFlag: true, ...over };
}

// ── 校验与命名 ───────────────────────────────────────────────────────────────
test('validateModuleName：合法/非法', () => {
  assert.equal(validateModuleName('posts'), null);
  assert.equal(validateModuleName('user_profile'), null);
  assert.ok(validateModuleName('Posts'));
  assert.ok(validateModuleName('帖子'));
  assert.ok(validateModuleName('post-title'));
  assert.equal(validateModuleName('bu'), null); // 短但合法
  assert.ok(validateModuleName('bus')); // 去 s 后过短 → 拒绝
});

test('validateLabel：注入防护', () => {
  assert.equal(validateLabel('帖子'), null);
  assert.equal(validateLabel('AB 12'), null);
  assert.ok(validateLabel('包含\'引号'));
  assert.ok(validateLabel('带`反引号'));
  assert.ok(validateLabel('带反斜杠\\'));
  assert.ok(validateLabel('太长了太长了太长了太长了太长了'));
});

test('parseFields + validateFields：类型与保留词', () => {
  const fields = parseFields('title:string,content:text,count:int,ok:bool,when:date');
  assert.equal(validateFields(fields), null);
  assert.ok(validateFields([{ name: 'id', type: 'string' }])); // 保留词
  assert.ok(validateFields([{ name: 'bad type', type: 'string' }]));
  assert.ok(validateFields([{ name: 'x', type: 'unknown' }]));
});

test('命名变换：posts/post 归一', () => {
  const a = buildContext('posts', '帖子', []);
  const b = buildContext('post', '帖子', []);
  assert.equal(a.singular, 'post');
  assert.equal(a.plural, 'posts');
  assert.equal(a.singlePascal, 'Post');
  assert.equal(a.pluralPascal, 'Posts');
  assert.equal(b.singular, a.singular);
  assert.equal(b.plural, a.plural);
});

// ── 骨架 ─────────────────────────────────────────────────────────────────────
test('后端 7 文件骨架', () => {
  const files = backendFiles(ctx());
  assert.equal(files.length, 7);
  const entity = files.find((f) => f.path.endsWith('.entity.ts')).content;
  assert.match(entity, /@Entity\('posts'\)/);
  assert.match(entity, /name: 'user_id'/);
  assert.match(entity, /@DeleteDateColumn/);
  assert.match(entity, /title!: string/);
  assert.match(entity, /content\?: string \| null/);
  const dto = files.find((f) => f.path.includes('create-')).content;
  assert.match(dto, /@MaxLength\(200\)/);
  const updateDto = files.find((f) => f.path.includes('update-')).content;
  assert.match(updateDto, /extends PartialType/);
  const controller = files.find((f) => f.path.endsWith('.controller.ts')).content;
  assert.match(controller, /path: 'posts', version: '1'/);
  assert.match(controller, /@FeatureFlag\('posts'\)/);
  // ⑤-1 admin 端点：管理端全量列表 + 删除任意
  assert.match(controller, /admin\/all/);
  assert.match(controller, /@CheckPolicies\(\(ability\) => ability\.can\('manage', 'all'\)\)/);
  const service = files.find((f) => f.path.endsWith('.service.ts')).content;
  assert.match(service, /findAllForAdmin/);
  assert.match(service, /removeAsAdmin/);
  const module = files.find((f) => f.path.endsWith('.module.ts')).content;
  assert.match(module, /forFeature\(\[Post\]\)/);
});

test('后端 controller：--no-feature-flag 省略装饰器', () => {
  const files = backendFiles(ctx({ featureFlag: false }));
  const controller = files.find((f) => f.path.endsWith('.controller.ts')).content;
  assert.doesNotMatch(controller, /@FeatureFlag/);
  assert.doesNotMatch(controller, /feature-flag\.decorator/);
});

test('前端 4 文件骨架', () => {
  const files = frontendFiles(ctx());
  assert.equal(files.length, 4);
  const model = files.find((f) => f.path.endsWith('_model.dart')).content;
  assert.match(model, /class PostModel/);
  assert.match(model, /fromJson/);
  assert.match(model, /toJson/);
  const repo = files.find((f) => f.path.endsWith('_repository.dart')).content;
  assert.match(repo, /\/posts/);
  assert.match(repo, /class PostsRepository/);
  const provider = files.find((f) => f.path.endsWith('_provider.dart')).content;
  assert.match(provider, /static const _ns = 'posts'/);
  assert.match(provider, /乐观更新/);
  const page = files.find((f) => f.path.endsWith('_page.dart')).content;
  assert.match(page, /class PostsPage/);
  assert.match(page, /l10n\.postsTitle/);
});

// ── 接线 ─────────────────────────────────────────────────────────────────────
test('接线：7 处插入 + 幂等重跑零改动', async () => {
  const root = await tempRoot();
  await makeFixtures(root);
  const c = ctx();

  const r1 = [...(await wireBackend(c, root)), ...(await wireFrontend(c, root))];
  const changed = r1.filter((r) => r.changed);
  assert.ok(changed.length >= 7, `应接线 ≥7 处，实际 ${changed.length}: ${r1.map((r) => r.file).join(',')}`);

  const app = await readFile(BE(root, 'app.module.ts'), 'utf8');
  assert.match(app, /PostsModule/);
  const manifest = await readFile(BE(root, 'common/modules/modules-manifest.ts'), 'utf8');
  assert.match(manifest, /'posts'/);
  assert.match(manifest, /label: '帖子'/);
  const main = await readFile(FE(root, 'main.dart'), 'utf8');
  assert.match(main, /PostsProvider/);
  const router = await readFile(FE(root, 'core/router/app_router.dart'), 'utf8');
  assert.match(router, /path: '\/posts'/);
  const i18n = await readFile(FE(root, 'core/i18n/app_localizations.dart'), 'utf8');
  assert.match(i18n, /postsTitle/);

  // 幂等：重跑全部应 skipped（already-wired）
  const r2 = [...(await wireBackend(c, root)), ...(await wireFrontend(c, root))];
  assert.equal(r2.filter((r) => r.changed).length, 0);
});

test('接线：锚点缺失 → 跳过 + 文件未破坏', async () => {
  const root = await tempRoot();
  // 只写 app.module（缺其他 fixture）
  await write(BE(root, 'app.module.ts'), `import { TodosModule } from './todos/todos.module';\n@Module({ imports: [TodosModule] })\nexport class AppModule {}\n`);
  const original = await readFile(BE(root, 'app.module.ts'), 'utf8');

  const r = [...(await wireBackend(ctx(), root))];
  const appRes = r.find((x) => x.file.endsWith('app.module.ts') && x.changed);
  assert.ok(appRes, 'app.module 应接线成功');
  const missing = r.filter((x) => !x.changed);
  assert.ok(missing.length > 0, '缺 fixture 的文件应跳过');
  // 缺 fixtures 的 manifest 文件未被创建/破坏
  await assert.rejects(access(BE(root, 'common/modules/modules-manifest.ts')));
  const after = await readFile(BE(root, 'app.module.ts'), 'utf8');
  assert.match(after, /PostsModule/);
  assert.ok(after.startsWith(original.slice(0, 40)), 'app.module 未被破坏');
});

// ── LLM（EASY-2.1） ──────────────────────────────────────────────────────────
test('buildSpecPrompt：含描述与 JSON 约束', () => {
  const p = buildSpecPrompt('图书管理');
  assert.match(p, /图书管理/);
  assert.match(p, /"module"/);
  assert.match(p, /"fields"/);
  assert.match(p, /string\|text\|int\|bool\|date/);
});

test('parseSpecResponse：纯净 JSON / 代码块围栏 / 非法', () => {
  const spec = parseSpecResponse('{"module":"books","label":"图书","fields":[{"name":"title","type":"string"},{"name":"price","type":"int"}]}');
  assert.equal(spec.module, 'books');
  assert.equal(spec.fields.length, 2);
  assert.equal(spec.fields[1].type, 'int');

  const fenced = parseSpecResponse('```json\n{"module":"posts","label":"帖子","fields":[{"name":"content","type":"text"}]}\n```');
  assert.equal(fenced.module, 'posts');

  assert.throws(() => parseSpecResponse('无 JSON'));
  assert.throws(() => parseSpecResponse('{bad json'));
});

test('llmConfig：云端/本地/未配置', () => {
  assert.equal(llmConfig({ DEEPSEEK_API_KEY: 'k' }).apiKey, 'k');
  const cloud = llmConfig({ DEEPSEEK_API_KEY: 'k', DEEPSEEK_BASE_URL: 'https://api.deepseek.com' });
  assert.equal(cloud.apiKey, 'k');
  assert.match(cloud.endpoint, /\/chat\/completions$/);
  const local = llmConfig({ OLLAMA_BASE_URL: 'http://localhost:11434' });
  assert.equal(local.apiKey, '');
  assert.match(local.endpoint, /\/v1\/chat\/completions$/);
  assert.equal(llmConfig({}), null);
});

test('extractSpec：mock fetch 成功 / API 错误 / 无配置', async () => {
  const okFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"module":"books","label":"图书","fields":[{"name":"author","type":"string"}]}' } }] }),
  });
  const r = await extractSpec('图书管理', { fetchImpl: okFetch, env: { DEEPSEEK_API_KEY: 'k' } });
  assert.equal(r.ok, true);
  assert.equal(r.spec.module, 'books');

  const errFetch = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
  const r2 = await extractSpec('x', { fetchImpl: errFetch, env: { DEEPSEEK_API_KEY: 'k' } });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /401/);

  const r3 = await extractSpec('x', { fetchImpl: okFetch, env: {} });
  assert.equal(r3.ok, false);
  assert.match(r3.error, /DEEPSEEK_API_KEY|OLLAMA_BASE_URL/);
});

test('--tab：路由 shell 分支 + app_shell Tab + i18n tab 标签（非 tab 不生成顶层路由）', async () => {
  const root = await tempRoot();
  await write(FE(root, 'main.dart'), `import 'features/todos/data/repositories/todos_repository.dart';
import 'features/todos/presentation/providers/todos_provider.dart';
      providers: [
        ChangeNotifierProvider<TodosProvider>(
          create: (_) => TodosProvider(TodosRepository(apiClient), cache: AppCache(prefs)),
        ),
      ],`);
  await write(FE(root, 'core/router/app_router.dart'), `
    routes: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/todos',
                pageBuilder: (_, _) => const NoTransitionPage(child: TodosPage()),
              ),
            ],
          ),
      // Legal pages
    ],`);
  await write(FE(root, 'core/widgets/app_shell.dart'), `    _TabItem(icon: CupertinoIcons.checkmark_square, labelKey: 'tabTodos'),
  String _label(AppLocalizations l10n, String key) {
    switch (key) {
      case 'tabTodos':
        return l10n.tabTodos;
    }
  }`);
  await write(FE(root, 'core/i18n/app_localizations.dart'), `  String get tabTodos => _t('Todos', '待办');`);

  const c = ctx({ isTab: true });
  await wireFrontend(c, root);

  const router = await readFile(FE(root, 'core/router/app_router.dart'), 'utf8');
  assert.match(router, /path: '\/posts'/);
  assert.match(router, /StatefulShellBranch/);
  assert.doesNotMatch(router, /builder: \(_, _\) => const PostsPage\(\)/); // 非顶层路由

  const shell = await readFile(FE(root, 'core/widgets/app_shell.dart'), 'utf8');
  assert.match(shell, /labelKey: 'tabPosts'/);
  assert.match(shell, /case 'tabPosts':/);

  const i18n = await readFile(FE(root, 'core/i18n/app_localizations.dart'), 'utf8');
  assert.match(i18n, /tabPosts/);
});

test('Web-Admin-Vue 模板：api + view 骨架', () => {
  const files = adminFiles(ctx());
  assert.equal(files.length, 2);
  const api = files.find((f) => f.path.endsWith('.ts')).content;
  assert.match(api, /admin\/all/);
  assert.match(api, /remove\(id/);
  const view = files.find((f) => f.path.endsWith('.vue')).content;
  assert.match(view, /AppTable/);
  assert.match(view, /ConfirmDialog/);
  assert.match(view, /navPosts/);
});

test('wireAdmin：routes + navGroups + i18n zh/en', async () => {
  const root = await tempRoot();
  await write(`${root}/Web-Admin-Vue/src/router/routes.ts`, `      { path: 'data-import', name: 'data-import', component: () => import('@/views/data-import/DataImportView.vue'), meta: { title: 'navDataImport' } },`);
  await write(`${root}/Web-Admin-Vue/src/layouts/AdminLayout.vue`, `      { name: 'data-import', to: '/data-import', icon: 'mdi-upload-multiple', label: t('navDataImport') },`);
  await write(`${root}/Web-Admin-Vue/src/i18n/zh.ts`, `  navDataImport: '数据导入',`);
  await write(`${root}/Web-Admin-Vue/src/i18n/en.ts`, `  navDataImport: 'Data Import',`);

  const r = await wireAdmin(ctx(), root);
  assert.ok(r.filter((x) => x.changed).length >= 4);
  const routes = await readFile(`${root}/Web-Admin-Vue/src/router/routes.ts`, 'utf8');
  assert.match(routes, /PostsView\.vue/);
  const nav = await readFile(`${root}/Web-Admin-Vue/src/layouts/AdminLayout.vue`, 'utf8');
  assert.match(nav, /navPosts/);
  const zh = await readFile(`${root}/Web-Admin-Vue/src/i18n/zh.ts`, 'utf8');
  assert.match(zh, /navPosts: '帖子'/);
  const en = await readFile(`${root}/Web-Admin-Vue/src/i18n/en.ts`, 'utf8');
  assert.match(en, /navPosts: 'Post'/);
});

test('Taro 模板：service/types/store/page 骨架', () => {
  const files = taroFiles(ctx());
  assert.equal(files.length, 5);
  const service = files.find((f) => f.path.endsWith('-service.ts')).content;
  assert.match(service, /\/posts/);
  assert.match(service, /api\.get/);
  const store = files.find((f) => f.path.endsWith('-store.ts')).content;
  assert.match(store, /defineStore/);
  const page = files.find((f) => f.path.endsWith('.vue')).content;
  assert.match(page, /<script setup lang="ts">/);
  assert.match(page, /usePostsStore/);
  assert.match(page, /<style src="\.\/index\.scss" scoped><\/style>/);
});

test('wireTaro：app.config pages + explore quickCards', async () => {
  const root = await tempRoot();
  await write(`${root}/Front-Taro/src/app.config.ts`, `    'pages/search/index',`);
  await write(`${root}/Front-Taro/src/pages/explore/index.vue`, `  { icon: '⚙️', label: 'Settings', color: '#9333EA', path: '/pages/settings/index' },`);

  const r = await wireTaro(ctx(), root);
  assert.ok(r.filter((x) => x.changed).length >= 2);
  const app = await readFile(`${root}/Front-Taro/src/app.config.ts`, 'utf8');
  assert.match(app, /pages\/posts\/index/);
  const explore = await readFile(`${root}/Front-Taro/src/pages/explore/index.vue`, 'utf8');
  assert.match(explore, /pages\/posts\/index/);
});

// ── 端到端：跑真实 CLI ───────────────────────────────────────────────────────
test('端到端：非交互 CLI 生成 + 接线', async () => {
  const root = await tempRoot();
  await makeFixtures(root);
  const cli = fileURLToPath(new URL('./keelbase-init.mjs', import.meta.url));

  const out = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cli, '--module', 'posts', '--label', '帖子', '--fields', 'title:string'], {
      cwd: root,
    });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => (code === 0 ? resolve(o + e) : reject(new Error(`exit ${code}: ${o}${e}`))));
  });

  assert.match(out, /生成业务模块：posts/);
  // 生成文件存在
  await access(BE(root, 'posts/post.entity.ts'));
  await access(BE(root, 'posts/posts.module.ts'));
  await access(FE(root, 'features/posts/data/models/post_model.dart'));
  await access(FE(root, 'features/posts/presentation/pages/posts_page.dart'));
  // 接线已插入
  const app = await readFile(BE(root, 'app.module.ts'), 'utf8');
  assert.match(app, /PostsModule/);
  const router = await readFile(FE(root, 'core/router/app_router.dart'), 'utf8');
  assert.match(router, /path: '\/posts'/);
});
