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
import { aiFiles } from './generator/templates-ai.mjs';
import { wireBackend, wireFrontend, wireAdmin, wireTaro, wireAiModule } from './generator/wire.mjs';
import { buildSpecPrompt, parseSpecResponse, extractSpec, llmConfig } from './generator/llm.mjs';
import { parseOpenApiSpec } from './generator/import-openapi.mjs';
import { parseSqlDdl } from './generator/import-schema.mjs';

// ── 工具 ─────────────────────────────────────────────────────────────────────
async function tempRoot() {
  const dir = await mkdtemp(join(tmpdir(), 'keelbase-cli-'));
  return dir.replace(/\\/g, '/');
}

const BE = (root, p) => `${root}/Server-NestJS/src/${p}`;
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
  await write(
    BE(root, 'ai/ai.module.ts'),
    `import { TodosModule } from '../todos/todos.module';
import { TodosService } from '../todos/todos.service';
import { CreateTodoTool } from './tools/create-todo.tool';

@Module({
  imports: [
    TodosModule,
  ],
})
export class AiModule {
  useFactory(
        todosService: TodosService,
  ) {
    const toolRegistry = new ToolRegistry();
        toolRegistry.register(new CreateTodoTool(todosService));
  }
}
inject: [TodosService, MemoriesService, ConfirmationStore],
`,
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

test('enum（协议反推）：类型 + 选项校验 + CLI 默认选项', () => {
  // CLI 字符串 `status:enum` → 默认选项
  const cliFields = parseFields('title:string,status:enum');
  assert.equal(cliFields[1].type, 'enum');
  assert.deepEqual(cliFields[1].enum, ['active', 'inactive']);
  assert.equal(validateFields(cliFields), null);

  // CLI 内联 enum 选项：`status:enum:active,inactive,paid`（选项不被外层逗号拆散）
  const inline = parseFields('title:string,status:enum:active,inactive,paid');
  assert.equal(inline[1].type, 'enum');
  assert.deepEqual(inline[1].enum, ['active', 'inactive', 'paid']);
  assert.equal(validateFields(inline), null);

  // 协议 JSON 提供的 enum 选项
  const specFields = [
    { name: 'title', type: 'string' },
    { name: 'status', type: 'enum', enum: ['pending', 'approved', 'rejected'] },
  ];
  assert.equal(validateFields(specFields), null);

  // 非法：无选项 / 选项非法 / 选项超长
  assert.ok(validateFields([{ name: 's', type: 'enum' }]));
  assert.ok(validateFields([{ name: 's', type: 'enum', enum: ['大写'] }]));
  assert.ok(validateFields([{ name: 's', type: 'enum', enum: ['a'.repeat(30)] }]));
  assert.ok(validateFields([{ name: 's', type: 'enum', enum: ['onlyone'] }]));
});

test('enum 模板：后端 @IsIn + 前端下拉', () => {
  const c = buildContext('suppliers', '供应商', [
    { name: 'name', type: 'string' },
    { name: 'status', type: 'enum', enum: ['active', 'inactive', 'blacklist'] },
  ]);
  const files = backendFiles({ ...c, featureFlag: true });
  const entity = files.find((f) => f.path.endsWith('.entity.ts')).content;
  assert.match(entity, /default: 'active'/);
  const dto = files.find((f) => f.path.includes('create-')).content;
  assert.match(dto, /@IsIn\(\['active', 'inactive', 'blacklist'\]\)/);
  assert.match(dto, /import.*IsIn/);

  const fe = frontendFiles({ ...c, featureFlag: true });
  const model = fe.find((f) => f.path.endsWith('_model.dart')).content;
  assert.match(model, /this\.status = 'active'/);
  const page = fe.find((f) => f.path.endsWith('_page.dart')).content;
  assert.match(page, /CupertinoSegmentedControl<String>/);
  assert.match(page, /data\['status'\] = _statusVal;/);
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
test('后端 8 文件骨架', () => {
  const files = backendFiles(ctx());
  assert.equal(files.length, 8);
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
  // controller.spec：生成模块自动带 controller 单测（覆盖管理端 admin 端点）
  const controllerSpec = files.find((f) => f.path.endsWith('.controller.spec.ts')).content;
  assert.match(controllerSpec, /describe\('PostsController'/);
  assert.match(controllerSpec, /findAllForAdmin/);
  assert.match(controllerSpec, /removeAsAdmin/);
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

test('AI 工具模板：query 读 + create 写需确认', () => {
  const c = buildContext('suppliers', '供应商', [
    { name: 'name', type: 'string', required: true },
    { name: 'status', type: 'enum', enum: ['active', 'inactive'] },
  ]);
  const files = aiFiles({ ...c, featureFlag: true });
  assert.equal(files.length, 4);
  const query = files.find((f) => f.path.includes('query-') && !f.path.endsWith('.spec.ts')).content;
  assert.match(query, /name = 'query_suppliers'/);
  assert.match(query, /findAll\(Number\(userId\)\)/);
  const create = files.find((f) => f.path.includes('create-') && !f.path.endsWith('.spec.ts')).content;
  assert.match(create, /name = 'create_supplier'/);
  assert.match(create, /requiresConfirmation = true/);
  assert.match(create, /requireVerifiedEmail: true/);
  assert.match(create, /@IsIn|enum: \['active', 'inactive'\]/);
  assert.match(create, /dto\.name = args\.name/);
  // AI 工具 spec：query/create 各带单测（写工具断言 requiresConfirmation）
  const querySpec = files.find((f) => f.path.endsWith('query-suppliers.tool.spec.ts')).content;
  assert.match(querySpec, /describe\('QuerySuppliersTool'/);
  assert.match(querySpec, /toHaveBeenCalledWith\(7\)/);
  const createSpec = files.find((f) => f.path.endsWith('create-suppliers.tool.spec.ts')).content;
  assert.match(createSpec, /describe\('CreateSupplierTool'/);
  assert.match(createSpec, /requiresConfirmation/);
});

test('wireAiModule：ai.module 六处接线 + 幂等', async () => {
  const root = await tempRoot();
  await makeFixtures(root);
  const c = buildContext('suppliers', '供应商', [{ name: 'name', type: 'string', required: true }]);

  const r1 = await wireAiModule({ ...c, featureFlag: true }, root);
  assert.ok(r1.filter((x) => x.changed).length >= 6, `应接线 ≥6 处，实际 ${r1.filter((x) => x.changed).length}`);

  const ai = await readFile(BE(root, 'ai/ai.module.ts'), 'utf8');
  assert.match(ai, /SuppliersModule/);
  assert.match(ai, /QuerySuppliersTool/);
  assert.match(ai, /new CreateSupplierTool\(suppliersService\)/);
  assert.match(ai, /inject: \[TodosService, SuppliersService/);

  // 幂等重跑零改动
  const r2 = await wireAiModule({ ...c, featureFlag: true }, root);
  assert.equal(r2.filter((x) => x.changed).length, 0);
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

test('端到端：--spec 读协议 JSON（含 enum 选项）生成', async () => {
  const root = await tempRoot();
  await makeFixtures(root);
  const cli = fileURLToPath(new URL('./keelbase-init.mjs', import.meta.url));
  const specPath = `${root}/supplier.json`;
  await write(specPath, JSON.stringify({
    module: 'suppliers',
    label: '供应商',
    fields: [
      { name: 'name', type: 'string', label: '名称' },
      { name: 'status', type: 'enum', label: '状态', enum: ['active', 'inactive', 'blacklist'] },
    ],
  }));

  const out = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cli, '--spec', specPath], { cwd: root });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => (code === 0 ? resolve(o + e) : reject(new Error(`exit ${code}: ${o}${e}`))));
  });

  assert.match(out, /生成业务模块：suppliers/);
  // enum 选项透传：后端 @IsIn + entity 默认值；前端 model 默认 + 下拉
  const dto = await readFile(BE(root, 'suppliers/dto/create-supplier.dto.ts'), 'utf8');
  assert.match(dto, /@IsIn\(\['active', 'inactive', 'blacklist'\]\)/);
  const entity = await readFile(BE(root, 'suppliers/supplier.entity.ts'), 'utf8');
  assert.match(entity, /default: 'active'/);
  const page = await readFile(FE(root, 'features/suppliers/presentation/pages/suppliers_page.dart'), 'utf8');
  assert.match(page, /CupertinoSegmentedControl<String>/);
  // AI 工具自动生成：读 + 写需确认
  await access(BE(root, 'ai/tools/query-suppliers.tool.ts'));
  await access(BE(root, 'ai/tools/create-suppliers.tool.ts'));
  const createTool = await readFile(BE(root, 'ai/tools/create-suppliers.tool.ts'), 'utf8');
  assert.match(createTool, /requiresConfirmation = true/);
  const aiModule = await readFile(BE(root, 'ai/ai.module.ts'), 'utf8');
  assert.match(aiModule, /new CreateSupplierTool\(suppliersService\)/);
});

// ── P0-12 输入通道：OpenAPI → Protocol ─────────────────────────────────────────
test('parseOpenApiSpec：OpenAPI 3 类型映射（string/int/bool/date/enum + 保留字段/对象跳过）', () => {
  const spec = {
    openapi: '3.0.0',
    components: { schemas: { Customer: { type: 'object', properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      status: { type: 'string', enum: ['active', 'inactive', 'archived'] },
      birthday: { type: 'string', format: 'date' },
      vip: { type: 'boolean' },
      score: { type: 'number' },
      orders: { type: 'array', items: { type: 'object' } },
      meta: { type: 'object' },
    } } } },
  };
  const r = parseOpenApiSpec(spec);
  assert.equal(r.module, 'customers');
  assert.deepEqual(
    r.fields.map((f) => `${f.name}:${f.type}`),
    ['name:string', 'status:enum', 'birthday:date', 'vip:bool', 'score:int'],
  );
  assert.deepEqual(r.fields.find((f) => f.name === 'status').enum, ['active', 'inactive', 'archived']);
});

test('parseOpenApiSpec：Swagger 2 definitions + 指定 schema', () => {
  const spec = { swagger: '2.0', definitions: { Order: { type: 'object', properties: {
    id: { type: 'integer' },
    amount: { type: 'number' },
    createdAt: { type: 'string', format: 'date-time' },
  } }, Customer: { type: 'object', properties: { name: { type: 'string' } } } } };
  const r = parseOpenApiSpec(spec, { schema: 'Customer', module: 'clients', label: '客户' });
  assert.equal(r.module, 'clients');
  assert.equal(r.label, '客户');
  assert.deepEqual(r.fields, [{ name: 'name', type: 'string' }]);
});

test('parseOpenApiSpec：无 schemas / enum 选项不合法时降级 string', () => {
  assert.match(parseOpenApiSpec({ openapi: '3.0.0' }).error, /未找到可用的 schemas/);
  const spec = { components: { schemas: { Foo: { properties: { status: { type: 'string', enum: ['Active', 'in progress', 'x'] } } } } } };
  const r = parseOpenApiSpec(spec);
  assert.equal(r.fields[0].type, 'string'); // 选项非法 → 降级 string
});

test('parseOpenApiSpec：required/label 透传 + skipped 诊断（保留/关系/非法名/enum 降级）', () => {
  const spec = {
    openapi: '3.0.0',
    components: { schemas: { Customer: {
      type: 'object',
      required: ['name', 'status', 'owner', 'tier'],
      properties: {
        id: { type: 'integer' },
        name: { type: 'string', title: '客户名称' },
        status: { type: 'string', enum: ['Active', 'in progress'] },
        owner: { type: 'string', description: '负责人' },
        tier: { type: 'string', enum: ['basic', 'pro'], title: '等级' },
        orders: { type: 'array', items: { $ref: '#/components/schemas/Order' } },
        ref: { $ref: '#/components/schemas/Contact' },
        '9first': { type: 'string' },
        extra: { type: 'string', title: '额外' },
      },
    } } },
  };
  const r = parseOpenApiSpec(spec);
  // required 透传（合法字段 + required 才标；保留/关系不在 fields 中）
  assert.equal(r.fields.find((f) => f.name === 'name').required, true);
  assert.equal(r.fields.find((f) => f.name === 'owner').required, true);
  assert.equal(r.fields.find((f) => f.name === 'tier').required, true);
  assert.equal(r.fields.find((f) => f.name === 'extra').required, undefined); // 未列 required 不误标
  // label 透传：title 优先，description 兜底
  assert.equal(r.fields.find((f) => f.name === 'name').label, '客户名称');
  assert.equal(r.fields.find((f) => f.name === 'owner').label, '负责人');
  assert.equal(r.fields.find((f) => f.name === 'extra').label, '额外');
  // label 安全化：去掉引号/换行/反斜杠
  const badTitle = parseOpenApiSpec({ components: { schemas: { Foo: { properties: { a: { type: 'string', title: "引'号\n反\\斜杠" } } } } } });
  assert.equal(badTitle.fields[0].label, '引号反斜杠');
  // 合法 enum 保留 + required；非法 enum 降级 string + 诊断
  assert.deepEqual(r.fields.find((f) => f.name === 'tier').enum, ['basic', 'pro']);
  assert.equal(r.fields.find((f) => f.name === 'status').type, 'string');
  assert.ok(r.skipped.some((s) => s.name === 'status' && /降级/.test(s.reason)));
  // 保留字段 / 关系 / 非法名 诊断
  assert.ok(r.skipped.some((s) => s.name === 'id' && /保留/.test(s.reason)));
  assert.ok(r.skipped.some((s) => s.name === 'orders' && /关系/.test(s.reason)));
  assert.ok(r.skipped.some((s) => s.name === 'ref' && /关系/.test(s.reason)));
  assert.ok(r.skipped.some((s) => s.name === '9first' && /非法/.test(s.reason)));
  // 全部保留/关系字段被记入，fields 只含标量
  assert.deepEqual(r.fields.map((f) => f.name), ['name', 'status', 'owner', 'tier', 'extra']);
});

// ── P0-12 输入通道：SQL DDL → Protocol ────────────────────────────────────────
test('parseSqlDdl：类型映射（text/int/bool/date/enum）+ 保留列/约束行跳过', () => {
  const sql = `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    bio TEXT,
    vip BOOLEAN DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
    birthday DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    deleted_at DATETIME,
    score DECIMAL(10,2),
    long_note VARCHAR(1000),
    UNIQUE (email)
  );`;
  const r = parseSqlDdl(sql);
  assert.equal(r.module, 'customers');
  assert.deepEqual(
    r.fields.map((f) => `${f.name}:${f.type}`),
    ['name:string', 'bio:text', 'vip:bool', 'status:enum', 'birthday:date', 'score:int', 'long_note:text'],
  );
  assert.deepEqual(r.fields.find((f) => f.name === 'status').enum, ['active', 'inactive', 'archived']);
});

test('parseSqlDdl：多表选指定表 + 无 CREATE TABLE 报错', () => {
  const sql = `CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    amount NUMERIC(12,2),
    status TEXT CHECK (status IN ('pending','paid','cancelled')),
    created_at TIMESTAMP
  );
  CREATE TABLE customers (id INTEGER PRIMARY KEY, name VARCHAR(50));`;
  const r = parseSqlDdl(sql, { table: 'orders' });
  assert.equal(r.module, 'orders');
  assert.deepEqual(r.fields.map((f) => f.name), ['customer_id', 'amount', 'status']);
  assert.match(parseSqlDdl('SELECT 1;').error, /未找到 CREATE TABLE/);
  assert.match(parseSqlDdl('').error, /空的 SQL/);
});

// ── P0-12 CLI：--import-* --out 写协议 JSON ───────────────────────────────────
test('端到端：--import-openapi --out 写出可被 --spec 消费的协议 JSON', async () => {
  const root = await tempRoot();
  const cli = fileURLToPath(new URL('./keelbase-init.mjs', import.meta.url));
  const swaggerPath = `${root}/swagger.json`;
  await write(swaggerPath, JSON.stringify({ components: { schemas: {
    Customer: { properties: { name: { type: 'string' }, status: { type: 'string', enum: ['active', 'inactive'] } } },
  } } }));

  const out = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cli, '--import-openapi', swaggerPath, '--module', 'customers', '--out', `${root}/spec.json`], { cwd: root });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => (code === 0 ? resolve(o + e) : reject(new Error(`exit ${code}: ${o}${e}`))));
  });

  assert.match(out, /写出协议/);
  const spec = JSON.parse(await readFile(`${root}/spec.json`, 'utf8'));
  assert.equal(spec.module, 'customers');
  assert.ok(spec.fields.some((f) => f.name === 'name'));
  // 产物可被 --spec 消费（字段合法）
  assert.equal(validateFields(spec.fields), null);
});

test('端到端：--import-openapi --out 协议含 required/label 透传 + skipped 诊断', async () => {
  const root = await tempRoot();
  const cli = fileURLToPath(new URL('./keelbase-init.mjs', import.meta.url));
  const swaggerPath = `${root}/swagger.json`;
  await write(swaggerPath, JSON.stringify({ components: { schemas: {
    Customer: {
      required: ['name'],
      properties: {
        id: { type: 'integer' },
        name: { type: 'string', title: '客户名称' },
        orders: { type: 'array', items: { type: 'object' } },
      },
    },
  } } }));

  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cli, '--import-openapi', swaggerPath, '--module', 'customers', '--out', `${root}/spec.json`], { cwd: root });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => (code === 0 ? resolve(o + e) : reject(new Error(`exit ${code}: ${o}${e}`))));
  });

  const spec = JSON.parse(await readFile(`${root}/spec.json`, 'utf8'));
  assert.equal(spec.fields.find((f) => f.name === 'name').required, true);
  assert.equal(spec.fields.find((f) => f.name === 'name').label, '客户名称');
  assert.ok(spec.skipped.some((s) => s.name === 'id' && /保留/.test(s.reason)));
  assert.ok(spec.skipped.some((s) => s.name === 'orders' && /关系/.test(s.reason)));
  // 产物仍可被 --spec 消费（skipped 为诊断信息，不影响字段合法性）
  assert.equal(validateFields(spec.fields), null);
});

test('端到端：--import-schema --out 写出协议 JSON（enum 透传）', async () => {
  const root = await tempRoot();
  const cli = fileURLToPath(new URL('./keelbase-init.mjs', import.meta.url));
  const sqlPath = `${root}/schema.sql`;
  await write(sqlPath, `CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY,
    name VARCHAR(100),
    tier VARCHAR(20) CHECK (tier IN ('basic','pro','enterprise'))
  );`);

  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cli, '--import-schema', sqlPath, '--table', 'suppliers', '--out', `${root}/supplier.json`], { cwd: root });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => (code === 0 ? resolve(o + e) : reject(new Error(`exit ${code}: ${o}${e}`))));
  });

  const spec = JSON.parse(await readFile(`${root}/supplier.json`, 'utf8'));
  assert.equal(spec.module, 'suppliers');
  const tier = spec.fields.find((f) => f.name === 'tier');
  assert.deepEqual(tier.enum, ['basic', 'pro', 'enterprise']);
  assert.equal(validateFields(spec.fields), null);
});

test('端到端：--import-schema 直接生成（无 --out，enum 透传 + AI 工具）', async () => {
  const root = await tempRoot();
  await makeFixtures(root);
  const cli = fileURLToPath(new URL('./keelbase-init.mjs', import.meta.url));
  const sqlPath = `${root}/schema.sql`;
  await write(sqlPath, `CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    tier VARCHAR(20) DEFAULT 'basic' CHECK (tier IN ('basic','pro','enterprise')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);

  const out = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cli, '--import-schema', sqlPath, '--table', 'suppliers', '--module', 'suppliers', '--label', '供应商'], { cwd: root });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => (code === 0 ? resolve(o + e) : reject(new Error(`exit ${code}: ${o}${e}`))));
  });

  assert.match(out, /生成业务模块：suppliers/);
  // enum 从 CHECK IN 透传：entity 默认值 + DTO @IsIn
  const entity = await readFile(BE(root, 'suppliers/supplier.entity.ts'), 'utf8');
  assert.match(entity, /default: 'basic'/);
  const dto = await readFile(BE(root, 'suppliers/dto/create-supplier.dto.ts'), 'utf8');
  assert.match(dto, /@IsIn\(\['basic', 'pro', 'enterprise'\]\)/);
  // 自动附 AI 工具（读 + 写需确认）
  await access(BE(root, 'ai/tools/query-suppliers.tool.ts'));
  const createTool = await readFile(BE(root, 'ai/tools/create-suppliers.tool.ts'), 'utf8');
  assert.match(createTool, /requiresConfirmation = true/);
});
