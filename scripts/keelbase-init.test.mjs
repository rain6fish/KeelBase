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
import { parseOpenApiProxy } from './generator/import-openapi-proxy.mjs';
import { parseSqlDdl } from './generator/import-schema.mjs';
import { parseYaml } from './generator/yaml.mjs';
import {
  writeManifest,
  readManifest,
  mergeManifest,
  manifestPath,
  MANIFEST_SCHEMA,
  MANIFEST_IDENTITY,
  MANIFEST_PROTOCOL,
} from './generator/manifest.mjs';

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
  { id: 'todos', category: 'business', deps: [], label: '待办', description: '待办清单与完成状态' },
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

test('required 透传：create DTO @IsNotEmpty + 非可选；前端 model required + 非空类型', () => {
  const c = buildContext('contracts', '合同', [
    { name: 'title', type: 'string', required: true },
    { name: 'amount', type: 'int', required: true },
    { name: 'note', type: 'text' },
  ]);
  const files = backendFiles({ ...c, featureFlag: true });
  const dto = files.find((f) => f.path.includes('create-')).content;
  assert.match(dto, /import.*IsNotEmpty/);
  assert.match(dto, /@IsInt\(\)\n  @IsNotEmpty\(\)\n  amount!: number;/);
  assert.doesNotMatch(dto, /amount\?: number;/);
  assert.match(dto, /@ApiProperty\(/); // 必填字段用 @ApiProperty 非 Optional
  assert.match(dto, /@IsOptional\(\)\n  note\?: string;/); // 非 required 保持可选

  const fe = frontendFiles({ ...c, featureFlag: true });
  const model = fe.find((f) => f.path.endsWith('_model.dart')).content;
  assert.match(model, /final int amount;/);
  assert.match(model, /required this\.amount/);
  assert.match(model, /amount: json\['amount'\] as int,/);
  assert.match(model, /final String\? note;/);
  assert.doesNotMatch(model, /required this\.note/);
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

// ── Provenance：.keelbase/manifest.json + keelbase inspect ────────────────────
test('manifest：首次创建 + 幂等合并（多模块去重、schema/identity 固定）', async () => {
  const root = await tempRoot();
  await writeManifest('posts', root);

  let man = JSON.parse(await readFile(`${root}/.keelbase/manifest.json`, 'utf8'));
  assert.equal(man.schema, MANIFEST_SCHEMA);
  assert.equal(man.identity, MANIFEST_IDENTITY);
  assert.equal(man.protocol, MANIFEST_PROTOCOL);
  assert.equal(man.generator, 'keelbase');
  assert.ok(man.generatorVersion);
  assert.deepEqual(man.modules, ['posts']);

  // 幂等：同模块重跑不重复；新模块追加（排序）
  await writeManifest('posts', root);
  await writeManifest('notes', root);
  await writeManifest('posts', root);
  man = JSON.parse(await readFile(`${root}/.keelbase/manifest.json`, 'utf8'));
  assert.deepEqual(man.modules, ['notes', 'posts']);
  assert.deepEqual((await readManifest(root)).modules, ['notes', 'posts']);
});

test('manifest：mergeManifest 缺省 root 指向 cwd（.keelbase/manifest.json）', async () => {
  const root = await tempRoot();
  const merged = await mergeManifest('books', root);
  assert.equal(manifestPath(root), `${root}/.keelbase/manifest.json`);
  assert.ok(merged.modules.includes('books'));
  // 未写入前 readManifest 返回 null（非 KeelBase 项目也是合法输入）
  assert.equal(await readManifest(root), null);
});

test('manifest：schema 不匹配 → 拒绝覆盖（防更新版本数据丢失）', async () => {
  const root = await tempRoot();
  await write(
    `${root}/.keelbase/manifest.json`,
    JSON.stringify({ schema: 2, identity: 'keelbase-application', generator: 'keelbase', generatorVersion: '9.9.9', protocol: '2.0', modules: ['future'] }),
  );
  const r = await writeManifest('posts', root);
  assert.equal(r.changed, false);
  assert.equal(r.reason, 'schema-mismatch');
  assert.equal(await mergeManifest('posts', root), null);
  // 原文件未被覆盖
  const man = JSON.parse(await readFile(`${root}/.keelbase/manifest.json`, 'utf8'));
  assert.equal(man.schema, 2);
  assert.deepEqual(man.modules, ['future']);
});

test('端到端：inspect 子命令——有 manifest 退出 0 / 无 manifest 退出 1', async () => {
  const cli = fileURLToPath(new URL('./keelbase-init.mjs', import.meta.url));
  const spawnRun = (root) =>
    new Promise((resolve) => {
      const p = spawn(process.execPath, [cli, 'inspect'], { cwd: root });
      let o = '';
      p.stdout.on('data', (d) => (o += d));
      p.on('close', (code) => resolve({ code, o }));
    });
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

  // 无 manifest → 退出 1 + 干净提示（不抛栈）
  const empty = await spawnRun(await tempRoot());
  assert.equal(empty.code, 1);
  assert.match(empty.o, /非 KeelBase 应用/);

  // 有 manifest → 退出 0 + 输出来源身份与能力指纹
  const root = await tempRoot();
  await makeFixtures(root);
  await write(BE(root, 'common/casl/casl-ability.factory.ts'), 'export {};\n');
  await writeManifest('posts', root);
  const ok = await spawnRun(root);
  const plain = stripAnsi(ok.o);
  assert.equal(ok.code, 0);
  assert.match(plain, /KeelBase Application/);
  assert.match(plain, /Protocol:\s+1\.0/);
  assert.match(plain, /Modules:\s+posts/);
  assert.match(plain, /✓\s+AI Tools/);
  assert.match(plain, /✓\s+CASL Permission/);
});

test('端到端：doctor 子命令——四查 PASS / 非 KeelBase / 不支持 schema', async () => {
  const cli = fileURLToPath(new URL('./keelbase-init.mjs', import.meta.url));
  const spawnRun = (root) =>
    new Promise((resolve) => {
      const p = spawn(process.execPath, [cli, 'doctor'], { cwd: root });
      let o = '';
      p.stdout.on('data', (d) => (o += d));
      p.on('close', (code) => resolve({ code, o }));
    });
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

  // 非 KeelBase：无 manifest → 退出 1 + 干净提示
  const empty = await spawnRun(await tempRoot());
  assert.equal(empty.code, 1);
  assert.match(stripAnsi(empty.o), /非 KeelBase 应用/);

  // 完整 fixture（manifest + 模块目录 + 运行时能力）→ 四查 PASS 退出 0
  const root = await tempRoot();
  await makeFixtures(root);
  await write(BE(root, 'common/casl/casl-ability.factory.ts'), 'export {};\n');
  await write(BE(root, 'ai/governance/governance-policy.service.ts'), 'export {};\n');
  await write(BE(root, 'ai/audit/ai-audit.service.ts'), 'export {};\n');
  await write(BE(root, 'operation-audit/operation-audit.service.ts'), 'export {};\n');
  await write(BE(root, 'posts/post.entity.ts'), 'export {};\n');
  await writeManifest('posts', root);
  const ok = await spawnRun(root);
  const plain = stripAnsi(ok.o);
  assert.equal(ok.code, 0);
  assert.match(plain, /PASS/);
  assert.match(plain, /完整性/);
  assert.match(plain, /一致性/);
  assert.match(plain, /运行时/);
  assert.match(plain, /版本/);
  assert.match(plain, /兼容矩阵/);
  assert.match(plain, /protocol/); // ⑤ 协议匹配

  // schema 2 → 退出 1 + 明确提示
  await write(
    `${root}/.keelbase/manifest.json`,
    JSON.stringify({ schema: 2, identity: 'keelbase-application', generator: 'keelbase', generatorVersion: '9.9.9', protocol: '2.0', modules: ['future'] }),
  );
  const fut = await spawnRun(root);
  assert.equal(fut.code, 1);
  assert.match(stripAnsi(fut.o), /不支持的 manifest schema 2/);
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
  await write(`${root}/Front-Taro/src/pages/explore/index.vue`, `  { icon: '⚙️', label: t('explore.settings'), color: '#9333EA', path: '/pages/settings/index' },`);

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
  // Provenance：CLI 自动写 .keelbase/manifest.json（来源身份）
  const man = JSON.parse(await readFile(`${root}/.keelbase/manifest.json`, 'utf8'));
  assert.equal(man.identity, MANIFEST_IDENTITY);
  assert.ok(man.modules.includes('posts'));
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

// ── AI Bridge 加固（§3）：YAML / $ref / allOf / number 精度 / 多 schema 提示 ──
test('parseYaml：嵌套 map/list/引号/内联 enum/多行注释（OpenAPI YAML 子集）', () => {
  const yaml = `
openapi: 3.0.1
info:
  title: Contract API
  version: 1.0
components:
  schemas:
    Contract:
      type: object
      required:
        - title
      properties:
        title:
          type: string
          description: 合同名称
        status:
          type: string
          enum: [draft, active]
        tags:
          - 内部
          - 外部
`;
  const r = parseYaml(yaml);
  assert.equal(r.openapi, '3.0.1');
  assert.equal(r.info.title, 'Contract API');
  assert.deepEqual(r.components.schemas.Contract.required, ['title']);
  assert.equal(r.components.schemas.Contract.properties.title.description, '合同名称');
  assert.deepEqual(r.components.schemas.Contract.properties.status.enum, ['draft', 'active']);
  assert.deepEqual(r.components.schemas.Contract.properties.tags, ['内部', '外部']);
});

test('parseOpenApiSpec：$ref 关系标注 + 顶层 allOf 合并 + number 精度 notes', () => {
  // $ref 关系标注落入手写清单
  const ref = parseOpenApiSpec({
    components: { schemas: { Order: { type: 'object', properties: {
      owner: { $ref: '#/components/schemas/User' },
      title: { type: 'string' },
    } } } },
  });
  assert.ok(ref.skipped.some((s) => s.name === 'owner' && /关系 \$ref/.test(s.reason)));
  assert.ok(ref.fields.some((f) => f.name === 'title'));

  // 顶层 allOf 组合：合并标量 properties + required
  const allOf = parseOpenApiSpec({
    components: { schemas: { Order: { allOf: [
      { type: 'object', properties: { base: { type: 'string' } } },
      { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] },
    ] } } },
  });
  assert.ok(allOf.fields.some((f) => f.name === 'base'));
  const amount = allOf.fields.find((f) => f.name === 'amount');
  assert.equal(amount.required, true);

  // number 精度 notes（format double / type number → int 提示）
  assert.ok(allOf.notes.some((n) => /amount/.test(n) && /丢精度/.test(n)));

  // 字段级 allOf 含 $ref → 关系跳过（需至少一个标量字段避免返回 error）
  const allOfRef = parseOpenApiSpec({
    components: { schemas: { X: { type: 'object', properties: {
      title: { type: 'string' },
      detail: { allOf: [{ $ref: '#/components/schemas/User' }] },
    } } } },
  });
  assert.ok(allOfRef.skipped.some((s) => s.name === 'detail' && /关系/.test(s.reason)));
});

test('parseSqlDdl：DECIMAL/REAL → int 丢精度 notes', () => {
  const r = parseSqlDdl(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    amount DECIMAL(10,2),
    price REAL
  );`);
  assert.ok(r.notes.some((n) => /amount/.test(n) && /DECIMAL/.test(n)));
  assert.ok(r.notes.some((n) => /price/.test(n) && /REAL/.test(n)));
});

// ── AI Bridge B 路径（§4 完整 B）：OpenAPI operations → ProxyTool 配置 ────────
test('parseOpenApiProxy：operations → 工具（读 R1 / 写 R3 + 参数映射）', () => {
  const r = parseOpenApiProxy({
    paths: {
      '/customers': {
        get: { operationId: 'listCustomers', summary: '客户列表', parameters: [{ name: 'keyword', in: 'query', schema: { type: 'string' }, description: '关键字' }] },
        post: { operationId: 'createCustomer', summary: '新建', tags: ['crm'], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, annualSpend: { type: 'number' } } } } } } },
      },
      '/customers/{id}': {
        get: { operationId: 'getCustomer', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }] },
      },
    },
  }, { baseUrl: 'http://erp', audience: 'legacy-erp' });
  assert.equal(r.error, undefined);
  assert.equal(r.baseUrl, 'http://erp');
  assert.equal(r.audience, 'legacy-erp');
  assert.equal(r.tools.length, 3);

  const list = r.tools.find((t) => t.name === 'list_customers');
  assert.equal(list.method, 'GET');
  assert.equal(list.riskLevel, 'R1');
  assert.equal(list.parameters[0].name, 'keyword');
  assert.equal(list.parameters[0].type, 'string');
  assert.equal(list.parameters[0].required, false);

  const create = r.tools.find((t) => t.name === 'create_customer');
  assert.equal(create.method, 'POST');
  assert.equal(create.riskLevel, 'R3'); // 写默认
  assert.match(create.description, /\[crm\]/); // tag 前缀
  const name = create.parameters.find((p) => p.name === 'name');
  assert.equal(name.required, true); // requestBody.required 透传
  const spend = create.parameters.find((p) => p.name === 'annualSpend');
  assert.equal(spend.type, 'number');
  assert.equal(spend.required, false);

  const get = r.tools.find((t) => t.name === 'get_customer');
  assert.equal(get.path, '/customers/{id}'); // OpenAPI 路径模板直接透传
  const id = get.parameters.find((p) => p.name === 'id');
  assert.equal(id.type, 'integer');
  assert.equal(id.required, true); // path 参数必填
});

test('parseOpenApiProxy：riskLevel 覆盖 + YAML flow-map 字符串 schema + 名称冲突去重', () => {
  // YAML 子集解析器把嵌套 flow-map 存为字符串（键值无引号非严格 JSON）——模拟真实 parseYaml 产物
  const r = parseOpenApiProxy({
    paths: {
      '/customers/{id}': {
        delete: {
          operationId: 'removeCustomer',
          'x-keelbase-risk-level': 'R4',
          parameters: [{ name: 'id', in: 'path', required: true, schema: '{ type: integer }' }],
        },
        get: {
          parameters: [{ name: 'id', in: 'path', required: true, schema: '{ type: integer }' }],
        },
      },
    },
  }, {});
  assert.equal(r.tools.length, 2);
  const del = r.tools.find((t) => t.method === 'DELETE');
  assert.equal(del.riskLevel, 'R4'); // x-keelbase-risk-level 覆盖默认 R3
  assert.equal(del.parameters[0].type, 'integer'); // flow-map 字符串 schema 解析出类型
  assert.equal(del.name, 'remove_customer'); // operationId 优先
  // 无 operationId 的 GET → 派生名 method_path
  assert.ok(r.tools.some((t) => t.name === 'get_customers_id'));
});

test('parseOpenApiProxy：连字符 path 参数（{customer-id}）→ 占位符重写为清洗名 {customer_id} + 参数对齐', () => {
  const r = parseOpenApiProxy({
    paths: {
      '/orders/{customer-id}': {
        get: { operationId: 'getOrdersByCustomer', parameters: [{ name: 'customer-id', in: 'path', required: true, schema: { type: 'integer' } }] },
      },
    },
  }, {});
  const t = r.tools[0];
  assert.equal(t.path, '/orders/{customer_id}'); // 占位符与参数名对齐（ProxyTool 按名取 args）
  const p = t.parameters.find((x) => x.name === 'customer_id');
  assert.equal(p.type, 'integer');
  assert.equal(p.required, true);
});

test('parseOpenApiProxy：x-keelbase-revoke-path → revokePath（Java 端补偿端点约定）', () => {
  const r = parseOpenApiProxy({
    paths: {
      '/contracts/{id}': {
        delete: { operationId: 'removeContract', 'x-keelbase-revoke-path': 'DELETE /contracts/{id}', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }] },
      },
    },
  }, {});
  const t = r.tools[0];
  assert.equal(t.revokePath, 'DELETE /contracts/{id}');
  assert.match(t.description, /撤销/);
});

test('parseOpenApiProxy：Swagger 2（in: body 参数）→ body 字段解析', () => {
  const r = parseOpenApiProxy({
    swagger: '2.0',
    paths: {
      '/contracts': {
        post: {
          operationId: 'createContract',
          summary: '新建合同',
          parameters: [
            { name: 'body', in: 'body', required: true, schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', description: '合同名称' }, amount: { type: 'number' } } } },
          ],
        },
      },
    },
  }, {});
  const t = r.tools[0];
  assert.equal(t.method, 'POST');
  const name = t.parameters.find((p) => p.name === 'name');
  const amount = t.parameters.find((p) => p.name === 'amount');
  assert.ok(name, 'Swagger 2 body 参数 schema 属性应解析');
  assert.equal(name.required, true);
  assert.equal(name.type, 'string');
  assert.equal(amount.type, 'number');
});

test('parseOpenApiProxy：无 paths / 空工具 → error', () => {
  assert.match(parseOpenApiProxy({ openapi: '3.0.0' }, {}).error, /未找到可用 operations/);
  assert.match(parseOpenApiProxy({ paths: { '/x': { parameters: [] } } }, {}).error, /没有可转换的 operations/);
  assert.match(parseOpenApiProxy(null, {}).error, /无效的 OpenAPI/);
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

test('parseSqlDdl：NOT NULL → required + skipped 诊断（保留列/约束行/未知类型）', () => {
  const sql = `CREATE TABLE assets (
    id INTEGER PRIMARY KEY,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(100),
    category_id INTEGER,
    meta JSON,
    created_at DATETIME,
    UNIQUE (code)
  );`;
  const r = parseSqlDdl(sql);
  // NOT NULL → required；可空不标
  assert.equal(r.fields.find((f) => f.name === 'code').required, true);
  assert.equal(r.fields.find((f) => f.name === 'name').required, undefined);
  assert.equal(r.fields.find((f) => f.name === 'category_id').required, undefined); // 关系列保留为 int，非 NOT NULL 不标
  // 保留列 / 约束行 / 未知类型 诊断
  assert.ok(r.skipped.some((s) => s.name === 'id' && /保留/.test(s.reason)));
  assert.ok(r.skipped.some((s) => s.name === 'created_at' && /保留/.test(s.reason)));
  assert.ok(r.skipped.some((s) => s.name === 'unique' && /约束/.test(s.reason)));
  assert.ok(r.skipped.some((s) => s.name === 'meta' && /未知类型/.test(s.reason)));
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

test('端到端：--import-openapi-proxy 写出 B 路径 Proxy 配置（读 R1 / 写 R3 + 委托身份）', async () => {
  const root = await tempRoot();
  const cli = fileURLToPath(new URL('./keelbase-init.mjs', import.meta.url));
  const specPath = `${root}/erp.yaml`;
  await write(specPath, `openapi: 3.0.0
paths:
  /customers:
    get:
      operationId: listCustomers
      summary: 客户列表
      parameters:
        - { name: keyword, in: query, schema: { type: string }, description: 关键字 }
    post:
      operationId: createCustomer
      summary: 新建客户
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                name: { type: string }
  /customers/{id}:
    delete:
      operationId: removeCustomer
      x-keelbase-risk-level: R4
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
`);

  const out = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cli, '--import-openapi-proxy', specPath, '--base-url', 'http://erp:8080/api', '--audience', 'legacy-erp', '--out', `${root}/proxy.json`], { cwd: root });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => (code === 0 ? resolve(o + e) : reject(new Error(`exit ${code}: ${o}${e}`))));
  });

  assert.match(out, /写出 B 路径 Proxy 配置/);
  const cfg = JSON.parse(await readFile(`${root}/proxy.json`, 'utf8'));
  assert.equal(cfg.baseUrl, 'http://erp:8080/api');
  assert.equal(cfg.audience, 'legacy-erp');
  assert.equal(cfg.tools.length, 3);
  assert.equal(cfg.tools.find((t) => t.name === 'list_customers').riskLevel, 'R1');
  assert.equal(cfg.tools.find((t) => t.name === 'create_customer').riskLevel, 'R3');
  assert.equal(cfg.tools.find((t) => t.name === 'remove_customer').riskLevel, 'R4');
  assert.equal(cfg.tools.find((t) => t.name === 'get_customers_id'), undefined); // 无 GET /customers/{id}
  // 产物可被 ProxyToolRegistryService 消费（name/method/path/parameters 齐全）
  for (const t of cfg.tools) {
    assert.ok(t.name && t.method && t.path && Array.isArray(t.parameters));
  }
});

test('端到端：多文件 OpenAPI（外部 $ref schema）→ proxy 配置 body 参数解析', async () => {
  const root = await tempRoot();
  const cli = fileURLToPath(new URL('./keelbase-init.mjs', import.meta.url));
  // 主 spec：paths 的 requestBody 引用外部文件 schema（真实企业 spec 常见拆分）
  await write(`${root}/erp.yaml`, `openapi: 3.0.0
paths:
  /contracts:
    post:
      operationId: createContract
      summary: 新建合同
      requestBody:
        content:
          application/json:
            schema:
              $ref: "./schemas.yaml#/components/schemas/Contract"
`);
  // 外部 schema 文件
  await write(`${root}/schemas.yaml`, `components:
  schemas:
    Contract:
      type: object
      required: [name]
      properties:
        name: { type: string, description: 合同名称 }
        tier: { type: string, enum: [basic, pro] }
`);

  const out = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cli, '--import-openapi-proxy', `${root}/erp.yaml`, '--base-url', 'http://erp:8080/api', '--audience', 'legacy-erp', '--out', `${root}/proxy.json`], { cwd: root });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => (code === 0 ? resolve(o + e) : reject(new Error(`exit ${code}: ${o}${e}`))));
  });

  assert.match(out, /写出 B 路径 Proxy 配置/);
  const cfg = JSON.parse(await readFile(`${root}/proxy.json`, 'utf8'));
  const create = cfg.tools.find((t) => t.name === 'create_contract');
  assert.ok(create, '应生成 create_contract');
  // 外部 $ref body schema 已被 deref：name（required）与 tier 进参数
  const name = create.parameters.find((p) => p.name === 'name');
  const tier = create.parameters.find((p) => p.name === 'tier');
  assert.ok(name, '外部 schema 的 name 应解析为 body 参数');
  assert.equal(name.required, true);
  assert.equal(name.type, 'string');
  assert.ok(tier, '外部 schema 的 tier 应解析');
  assert.equal(tier.type, 'string');
});

test('端到端：--import-openapi-proxy --list-tools 预览工具清单（不生成）', async () => {
  const root = await tempRoot();
  const cli = fileURLToPath(new URL('./keelbase-init.mjs', import.meta.url));
  const specPath = `${root}/erp.yaml`;
  await write(specPath, `openapi: 3.0.0
paths:
  /contracts:
    get: { operationId: listContracts }
    post: { operationId: createContract }
`);

  const out = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cli, '--import-openapi-proxy', specPath, '--list-tools'], { cwd: root });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => (code === 0 ? resolve(o + e) : reject(new Error(`exit ${code}: ${o}${e}`))));
  });

  assert.match(out, /可用 proxy 工具（2）/);
  assert.match(out, /list_contracts/);
  assert.match(out, /create_contract/);
  // 不写任何文件（纯预览）
  await assert.rejects(access(`${root}/proxy.json`));
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

test('端到端：--import-schema --out 协议含 required 透传 + skipped 诊断', async () => {
  const root = await tempRoot();
  const cli = fileURLToPath(new URL('./keelbase-init.mjs', import.meta.url));
  const sqlPath = `${root}/schema.sql`;
  await write(sqlPath, `CREATE TABLE contracts (
    id INTEGER PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    meta JSON,
    created_at DATETIME
  );`);

  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cli, '--import-schema', sqlPath, '--table', 'contracts', '--out', `${root}/contract.json`], { cwd: root });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('close', (code) => (code === 0 ? resolve(o + e) : reject(new Error(`exit ${code}: ${o}${e}`))));
  });

  const spec = JSON.parse(await readFile(`${root}/contract.json`, 'utf8'));
  assert.equal(spec.fields.find((f) => f.name === 'title').required, true);
  assert.equal(spec.fields.find((f) => f.name === 'amount').required, true);
  assert.ok(spec.skipped.some((s) => s.name === 'id' && /保留/.test(s.reason)));
  assert.ok(spec.skipped.some((s) => s.name === 'meta' && /未知类型/.test(s.reason)));
  // 产物仍可被 --spec 消费
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

test('specs/ 协议文件全部可被生成器消费（协议生态基础检查）', async () => {
  const fsp = await import('node:fs/promises');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dir = join(root, 'specs');
  // OpenAPI 文件（external-crm.openapi.json 等）是 --import-openapi 输入，非协议 JSON，跳过
  const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json') && !f.endsWith('.openapi.json'));
  assert.ok(files.length >= 8, `应有 ≥8 份协议，实际 ${files.length}`);
  for (const f of files) {
    const spec = JSON.parse(await fsp.readFile(join(dir, f), 'utf8'));
    assert.ok(spec.module, `${f}: 缺 module`);
    assert.equal(validateFields(spec.fields || []), null, `${f}: 字段非法`);
    assert.doesNotThrow(
      () => buildContext(spec.module, spec.label || spec.module, spec.fields || []),
      `${f}: buildContext 失败`,
    );
  }
});

test('生成模块一致性：协议字段 ⊆ 实体字段（books/notes/contracts/suppliers 已验证产物）', async () => {
  const fsp = await import('node:fs/promises');
  const root = fileURLToPath(new URL('..', import.meta.url));
  // 端到端验证过的生成模块：specs 即其生成来源（books/notes 已按 specs 回填实体字段，2026-08-20）
  const verified = [
    { spec: 'books.json', module: 'books' },
    { spec: 'notes.json', module: 'notes' },
    { spec: 'contract.json', module: 'contracts' },
    { spec: 'supplier.json', module: 'suppliers' },
  ];
  for (const { spec, module } of verified) {
    const specData = JSON.parse(await fsp.readFile(join(root, 'specs', spec), 'utf8'));
    const ctx = buildContext(module, specData.label, specData.fields);
    const entityPath = join(root, 'Server-NestJS', 'src', module, `${ctx.singular}.entity.ts`);
    const entity = await fsp.readFile(entityPath, 'utf8');
    for (const f of specData.fields) {
      assert.ok(entity.includes(f.name), `${module}: 实体缺协议字段 ${f.name}`);
    }
  }
});
