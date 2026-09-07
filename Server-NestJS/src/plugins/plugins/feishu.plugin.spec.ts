// SPDX-License-Identifier: Apache-2.0

import type { PluginManifest } from '../plugin.interface';

/**
 * feishu.plugin.ts 单元测试（P1-7 飞书官方插件）。
 *
 * FEISHU_APP_ID/SECRET 在模块加载期从 process.env 读取，故用 jest.isolateModules
 * 按测试 env 重载模块，分别覆盖：manifest 元数据 / 未配置引导 / 参数校验 /
 * token 获取失败 / 发消息成功与失败 / 网络异常。
 */

const CONFIG_ENV = { FEISHU_APP_ID: 'cli_app_test', FEISHU_APP_SECRET: 'cli_secret_test' };

const origEnv = { ...process.env };

afterEach(() => {
  process.env = { ...origEnv };
  jest.restoreAllMocks();
  // @ts-expect-error 清理测试内 mock 的 global.fetch
  delete global.fetch;
});

function loadManifest(): PluginManifest {
  let manifest: PluginManifest | undefined;
  jest.isolateModules(() => {
    manifest = (require('./feishu.plugin') as { FEISHU_PLUGIN: PluginManifest }).FEISHU_PLUGIN;
  });
  return manifest!;
}

type RouteHandler = (req: unknown) => Promise<unknown> | unknown;

/** 触发插件 onAppStart，收集注册的 route handler 并返回按 path 取 handler 的函数 */
async function boot(manifest: PluginManifest) {
  const routes = new Map<string, RouteHandler>();
  await manifest.hooks?.onAppStart?.({
    getService: () => null,
    isFeatureEnabled: () => true,
    registerRoute: (path: string, handler: RouteHandler) => {
      routes.set(path, handler);
    },
  } as any);
  return (path: string): RouteHandler | undefined => routes.get(path);
}

/** 构造 fetch 的 JSON 响应（默认 ok:false/无 status） */
function fetchJson(body: unknown, extra: Record<string, unknown> = {}) {
  return { json: async () => body, ...extra } as any;
}

describe('feishu.plugin：未配置（无凭据）', () => {
  beforeEach(() => {
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;
  });

  it('manifest 元数据正确；status 返回未配置引导', async () => {
    const manifest = loadManifest();
    expect(manifest).toMatchObject({ name: 'feishu-plugin', version: '1.0.0' });
    expect(manifest.capabilities).toContain('plugin.feishu.send');

    const handler = await boot(manifest);
    const status = (await handler('/plugins/feishu/status')!({})) as any;
    expect(status).toMatchObject({ plugin: 'feishu-plugin', configured: false });
    expect(String(status.hint)).toContain('未配置');
  });

  it('send 未配置返回配置引导且不调外部 API', async () => {
    const handler = await boot(loadManifest());
    global.fetch = jest.fn();
    const send = (await handler('/plugins/feishu/send')!({ receiveId: 'ou_1', text: 'hi' })) as any;
    expect(send.ok).toBe(false);
    expect(String(send.message)).toContain('FEISHU_APP_ID');
    expect(String(send.howToConfigure)).toContain('FEISHU_APP_SECRET');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('feishu.plugin：已配置', () => {
  beforeEach(() => {
    process.env.FEISHU_APP_ID = CONFIG_ENV.FEISHU_APP_ID;
    process.env.FEISHU_APP_SECRET = CONFIG_ENV.FEISHU_APP_SECRET;
  });

  it('status 返回 configured:true 与已配置提示', async () => {
    const handler = await boot(loadManifest());
    const status = (await handler('/plugins/feishu/status')!({})) as any;
    expect(status).toMatchObject({ plugin: 'feishu-plugin', configured: true });
    expect(String(status.hint)).toContain('已配置');
  });

  it('send 缺 receiveId/text → 参数校验失败且不调外部 API', async () => {
    const handler = await boot(loadManifest());
    global.fetch = jest.fn();

    const noReceive = (await handler('/plugins/feishu/send')!({ text: 'hi' })) as any;
    expect(noReceive.ok).toBe(false);
    expect(String(noReceive.message)).toContain('receiveId');

    const noText = (await handler('/plugins/feishu/send')!({ receiveId: 'ou_1' })) as any;
    expect(noText.ok).toBe(false);
    expect(String(noText.message)).toContain('text');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('获取 tenant_access_token 为空 → ok:false 且只请求一次', async () => {
    const handler = await boot(loadManifest());
    global.fetch = jest.fn().mockResolvedValue(fetchJson({}));
    const send = (await handler('/plugins/feishu/send')!({ receiveId: 'ou_1', text: 'hi' })) as any;
    expect(send).toMatchObject({ ok: false });
    expect(String(send.message)).toContain('tenant_access_token');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('send 成功：携带 Bearer token 与正确消息体', async () => {
    const handler = await boot(loadManifest());
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(fetchJson({ tenant_access_token: 'TOK-1' }))
      .mockResolvedValueOnce(fetchJson({ msg: '已发送' }, { ok: true }));
    global.fetch = fetchMock as any;

    const send = (await handler('/plugins/feishu/send')!({ receiveId: 'ou_1', text: 'hi' })) as any;
    expect(send).toEqual({ ok: true, message: '已发送' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [authUrl, authInit] = fetchMock.mock.calls[0] as [string, any];
    expect(authUrl).toContain('/auth/v3/tenant_access_token/internal');
    expect(JSON.parse(authInit.body)).toEqual({
      app_id: CONFIG_ENV.FEISHU_APP_ID,
      app_secret: CONFIG_ENV.FEISHU_APP_SECRET,
    });

    const [msgUrl, msgInit] = fetchMock.mock.calls[1] as [string, any];
    expect(msgUrl).toContain('/im/v1/messages?receive_id_type=open_id');
    expect(msgInit.headers.Authorization).toBe('Bearer TOK-1');
    const body = JSON.parse(msgInit.body);
    expect(body).toMatchObject({ receive_id: 'ou_1', msg_type: 'text' });
    expect(JSON.parse(body.content)).toEqual({ text: 'hi' });
  });

  it('send 飞书返回失败且无 msg → message 回退为状态码', async () => {
    const handler = await boot(loadManifest());
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(fetchJson({ tenant_access_token: 'TOK-1' }))
      .mockResolvedValueOnce(fetchJson({}, { ok: false, status: 400 }));
    const send = (await handler('/plugins/feishu/send')!({ receiveId: 'ou_1', text: 'hi' })) as any;
    expect(send).toEqual({ ok: false, message: '飞书 API 400' });
  });

  it('send fetch 抛异常（网络故障）→ ok:false 且 message 含异常', async () => {
    const handler = await boot(loadManifest());
    global.fetch = jest.fn().mockRejectedValue(new Error('ENOTFOUND open.feishu.cn'));
    const send = (await handler('/plugins/feishu/send')!({ receiveId: 'ou_1', text: 'hi' })) as any;
    expect(send.ok).toBe(false);
    expect(String(send.message)).toContain('ENOTFOUND');
  });
});
