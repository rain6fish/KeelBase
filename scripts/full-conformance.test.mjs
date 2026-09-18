// SPDX-License-Identifier: Apache-2.0

/**
 * Full 剖面静态探针（JV-13 L0）单测（node:test，零依赖）。
 * 运行：node --test scripts/full-conformance.test.mjs（含在 `npm run cli:test` 内）
 *
 * 最后一组是**判据自证**：对**真实 TS 仓**跑探针须 0 缺口。TS 若掉端点，本测即红——
 * 这是本文件进 CI 的价值（Java 跨仓部分 CI 看不见，同 `check-java-vector-sync.mjs`）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractTsRoutes,
  extractJavaRoutes,
  extractGlobalPrefix,
  checkFrontendContract,
  checkEnvelope,
  checkSliceVectors,
  probeRuntime,
  gapsOf,
  collectFiles,
} from './verify-full-conformance.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

/* ═══════════ 路由提取 ═══════════ */

test('TS 路由：对象形式 @Controller({path}) + 方法子路径', () => {
  const src = `
    @Controller({ path: 'app/capabilities', version: '1' })
    export class A { @Get() x() {} }

    @Controller({ path: 'crm', version: '1' })
    export class B { @Get(':id/orders') y() {} @Post() z() {} }
  `;
  const routes = extractTsRoutes(['fake.ts'], () => src);
  assert.deepEqual(routes.map((r) => `${r.method} ${r.path}`), [
    'GET /app/capabilities',
    'GET /crm/:id/orders',
    'POST /crm',
  ]);
});

test('TS 路由：字符串形式 @Controller("x") 亦覆盖；无 @Controller 的文件跳过', () => {
  const withCtrl = extractTsRoutes(['a.ts'], () => `@Controller('legacy') export class A { @Get('ping') p() {} }`);
  assert.deepEqual(withCtrl.map((r) => r.path), ['/legacy/ping']);

  const noCtrl = extractTsRoutes(['b.ts'], () => `export class B { @Get() x() {} }`);
  assert.equal(noCtrl.length, 0);
});

test('Java 路由：类级 @RequestMapping 前缀 + 方法级 Mapping', () => {
  const src = `
    @RestController
    @RequestMapping("/api/v1/things")
    public class ThingController {
      @GetMapping("/list") public Object list() { return null; }
      @PostMapping("/create") public Object create() { return null; }
    }
  `;
  const routes = extractJavaRoutes(['T.java'], () => src);
  assert.deepEqual(routes.map((r) => `${r.method} ${r.path}`), [
    'GET /api/v1/things/list',
    'POST /api/v1/things/create',
  ]);
});

test('Java 路由：无类级前缀时直接用方法路径', () => {
  const routes = extractJavaRoutes(['T.java'], () => `@RestController public class T { @GetMapping("/customers") Object l() { return null; } }`);
  assert.deepEqual(routes.map((r) => r.path), ['/customers']);
});

/* ═══════════ 全局前缀 ═══════════ */

test('全局前缀：TS 从 setGlobalPrefix + defaultVersion 合成，不从路由反推', () => {
  const main = `app.setGlobalPrefix('api');\napp.enableVersioning({ defaultVersion: '1' });`;
  assert.equal(extractGlobalPrefix(main, 'ts'), '/api/v1');
  assert.equal(extractGlobalPrefix(`app.setGlobalPrefix('api');`, 'ts'), '/api');
  assert.equal(extractGlobalPrefix('// 无前缀配置', 'ts'), null);
});

test('全局前缀：Java 读 context-path', () => {
  assert.equal(extractGlobalPrefix('server.servlet.context-path=/svc', 'java'), '/svc');
  assert.equal(extractGlobalPrefix('server:\n  servlet:\n    context-path: /svc', 'java'), '/svc');
  assert.equal(extractGlobalPrefix('spring.datasource.url=x', 'java'), null);
});

/* ═══════════ F4a / F5 ═══════════ */

test('F4a 信封：命中标记即在；优先报非 spec 文件', () => {
  const files = ['src/common/interceptors/response.interceptor.ts', 'src/common/interceptors/response.interceptor.spec.ts'];
  const hit = checkEnvelope(files, () => 'export class ResponseInterceptor {}');
  assert.equal(hit.present, true);
  assert.ok(hit.evidence[0].includes('response.interceptor.ts'));
  assert.ok(!hit.evidence[0].includes('.spec.'));

  assert.equal(checkEnvelope(['a.ts'], () => 'const x = 1;').present, false);
});

test('F5：两端点在/不在，均给出实际路径', () => {
  const has = checkFrontendContract([
    { method: 'GET', path: '/app/capabilities' },
    { method: 'GET', path: '/app/provenance' },
  ]);
  assert.deepEqual(has.map((c) => c.present), [true, true]);
  assert.deepEqual(has[0].paths, ['GET /app/capabilities']);

  const none = checkFrontendContract([{ method: 'GET', path: '/customers' }]);
  assert.deepEqual(none.map((c) => c.present), [false, false]);
});

test('F1–F3：薄片向量按在场与否逐条报', () => {
  const r = checkSliceVectors(join(ROOT, 'Server-NestJS/specs/protocol'));
  assert.equal(r.length, 3);
  assert.ok(r.every((v) => v.present), '主仓薄片向量应齐备');
});

/* ═══════════ 缺口表 ═══════════ */

test('缺口表：F4/F5 缺项各自成行，含 area 标注', () => {
  const probe = {
    sliceVectors: [{ id: 'a', present: true }, { id: 'b', present: false }],
    envelope: { present: false },
    frontendContract: [{ id: 'app/capabilities', present: false }, { id: 'app/provenance', present: true }],
  };
  const gaps = gapsOf(probe);
  assert.deepEqual(gaps.map((g) => g.area), ['F1–F3', 'F4', 'F5']);
  assert.equal(gaps.length, 3);
});

/* ═══════════ 判据自证（对真实 TS 仓） ═══════════ */

test('判据自证：对真实 TS 仓探针须 0 缺口（TS 掉端点则本测红）', () => {
  const ts = probeRuntime({
    label: 'TS',
    routeFiles: collectFiles(join(ROOT, 'Server-NestJS/src'), (n) => n.endsWith('.controller.ts')),
    envelopeFiles: collectFiles(join(ROOT, 'Server-NestJS/src/common'), (n) => n.endsWith('.ts')),
    vectorDir: join(ROOT, 'Server-NestJS/specs/protocol'),
    extractRoutes: extractTsRoutes,
    envelopeMarker: /ApiResponse|ResponseInterceptor/,
    prefixKind: 'ts',
    prefixText: 'app.setGlobalPrefix(\'api\'); app.enableVersioning({ defaultVersion: \'1\' });',
  });

  assert.deepEqual(gapsOf(ts), [], '判据自证失败：TS 侧出现缺口，说明探针判据写错了');
  assert.equal(ts.globalPrefix, '/api/v1');
  assert.ok(ts.routes.length > 100, `TS 路由提取偏少（${ts.routes.length}）——提取器可能漏写法`);
  assert.ok(ts.frontendContract.every((c) => c.present), 'TS 应有 /app/capabilities 与 /app/provenance');
});
