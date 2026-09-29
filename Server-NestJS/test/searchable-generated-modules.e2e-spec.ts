// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser, authHeader } from './helpers';
import { readApplicationManifest } from '../src/common/provenance/application-manifest';

/**
 * P0-9a: a generated module that declares `searchable` is really reachable from global search, and
 * only by its owner.
 *
 * The criterion this closes (roadmap §2.1.1): "after generating a module with `searchable: true`,
 * `GET /search?q=` can match that module's records and narrows by data scope; `searchable: false`
 * does not enter the index; there is an e2e assertion".
 *
 * It runs against the repository's real `.keelbase/manifest.json` — `books` is declared there with
 * its searchable columns — so nothing here stubs the manifest or edits that file. The unit suite
 * (`searchable-entities.spec.ts`) already pins the resolution rules against fakes; this suite is the
 * one that would have caught the failure mode a mock cannot: a search that resolves columns nothing
 * matches, while its mocked tests stay green.
 *
 * P0-9a：声明了 `searchable` 的生成模块，真的能被全局搜索命中，且只有其归属人能命中。
 *
 * 本套件关掉的判据（roadmap §2.1.1）：「生成一个 `searchable: true` 的模块后，`GET /search?q=`
 * 能命中该模块记录且按数据范围过滤；`searchable: false` 不进索引；有 e2e 断言」。
 *
 * 它跑在仓库**真实的** `.keelbase/manifest.json` 上 —— `books` 在其中有声明（含可搜列），
 * 所以这里既不桩掉清单、也不改那个文件。解析规则已由单测（`searchable-entities.spec.ts`）用
 * 假数据钉住；本套件负责的是桩测不出、而 mock 掉的测试照样全绿的那种失效：搜的列一条也匹配不到。
 */
describe('Searchable generated modules (P0-9a, e2e)', () => {
  let app: INestApplication;
  let owner: { accessToken: string };
  let other: { accessToken: string };

  // Distinctive enough that no other fixture in the shared test DB can collide with it.
  // 区分度足够高，共享测试库里没有别的夹具会与它撞。
  const TERM = 'ZephyrSearchable';

  beforeAll(async () => {
    app = await createTestApp();
    owner = await registerUser(app, {
      username: 'srch_owner',
      email: 'srch_owner@test.com',
      password: 'SrchOwner1',
      nickname: 'Owner',
    });
    other = await registerUser(app, {
      username: 'srch_other',
      email: 'srch_other@test.com',
      password: 'SrchOther1',
      nickname: 'Other',
    });
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  const search = (token: string) =>
    request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: TERM })
      .set(authHeader(token))
      .expect(200);

  it('indexes a declared module for its owner', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/books')
      .set(authHeader(owner.accessToken))
      .send({ title: `${TERM} 的书`, author: 'Test Author', status: 'unread' })
      .expect(201);

    const res = await search(owner.accessToken);
    const books = res.body.data.modules.find((b: any) => b.module === 'books');

    expect(books).toBeDefined();
    expect(books.items.some((i: any) => String(i.title).includes(TERM))).toBe(true);
    // The bucket keeps the shared paginated shape, plus its module name.
    // 桶体保持共用的分页形状，另加自己的模块名。
    expect(books).toHaveProperty('total');
    expect(books).toHaveProperty('page');
    expect(books).toHaveProperty('limit');
  });

  it('does not show it to another user', async () => {
    const res = await search(other.accessToken);
    const books = res.body.data.modules.find((b: any) => b.module === 'books');

    // Either the bucket is absent or it is empty for this caller — both mean "not visible".
    // 桶不存在、或对这位调用者为空 —— 两者都表示「看不到」。
    expect(books?.items ?? []).toHaveLength(0);
  });

  it('leaves a module that declares nothing searchable out of the index', async () => {
    // The declaration is the gate: only modules listed in `searchableModules` may produce a bucket.
    // Asserted by absence rather than by seeding a row, because a generated module's endpoints are
    // themselves feature-flag gated (they 404 when off) — and this clause is about the search, not
    // about that module's own reachability.
    // 声明才是闸门：只有 `searchableModules` 里列出的模块才可能产生桶。这里用「不出现」来断言，
    // 而不是先往那个模块塞一行 —— 生成模块的端点本身受 feature flag 门控（关掉即 404），
    // 而本条判的是搜索，不是那个模块自己通不通。
    const res = await search(owner.accessToken);
    const buckets = res.body.data.modules as Array<{ module: string }>;

    // Read the declared set from the same manifest the service reads — hardcoding it here would
    // drift the moment a module is added.
    // 声明的集合从服务读的同一份清单里取 —— 硬编码在这里的话，一加模块就会漂。
    const declared = new Set(
      ((readApplicationManifest().manifest?.searchableModules ?? []) as Array<{ module: string }>).map(
        (m) => m.module,
      ),
    );
    expect(declared.size).toBeGreaterThan(0);

    expect(buckets.some((b) => b.module === 'tags')).toBe(false);
    expect(buckets.every((b) => declared.has(b.module))).toBe(true);
  });

  it('keeps answering the buckets that were already there', async () => {
    const res = await search(owner.accessToken);

    expect(res.body.data).toHaveProperty('events');
    expect(res.body.data).toHaveProperty('users');
    expect(Array.isArray(res.body.data.modules)).toBe(true);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/search').query({ q: TERM }).expect(401);
  });
});
