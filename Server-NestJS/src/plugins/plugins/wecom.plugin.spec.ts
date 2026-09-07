// SPDX-License-Identifier: Apache-2.0

import type { PluginManifest } from '../plugin.interface';

/**
 * wecom.plugin.ts 单元测试（P1-7 企业微信官方插件）。
 *
 * WECOM_CORP_ID/AGENT_ID/SECRET 在模块加载期从 process.env 读取，故用
 * jest.isolateModules 按测试 env 重载模块，分别覆盖：manifest 元数据 /
 * 未配置引导 / 参数校验 / access_token 获取失败 / 发消息成功与失败 /
 * touser 默认值与显式传值 / 网络异常。
 */

const CONFIG_ENV = {
  WECOM_CORP_ID: 'corp_test',
  WECOM_AGENT_ID: '1000002',
  WECOM_SECRET: 'wecom_secret_test',
};

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
    manifest = (require('./wecom.plugin') as { WECOM_PLUGIN: PluginManifest }).WECOM_PLUGIN;
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

/** 构造 fetch 的 JSON 响应 */
function fetchJson(body: unknown) {
  return { json: async () => body } as any;
}

describe('wecom.plugin：未配置（无凭据）', () => {
  beforeEach(() => {
    delete process.env.WECOM_CORP_ID;
    delete process.env.WECOM_AGENT_ID;
    delete process.env.WECOM_SECRET;
  });

  it('manifest 元数据正确；status 返回未配置引导', async () => {
    const manifest = loadManifest();
    expect(manifest).toMatchObject({ name: 'wecom-plugin', version: '1.0.0' });
    expect(manifest.capabilities).toContain('plugin.wecom.send');

    const handler = await boot(manifest);
    const status = (await handler('/plugins/wecom/status')!({})) as any;
    expect(status).toMatchObject({ plugin: 'wecom-plugin', configured: false });
    expect(String(status.hint)).toContain('未配置');
  });

  it('send 未配置返回配置引导且不调外部 API', async () => {
    const handler = await boot(loadManifest());
    global.fetch = jest.fn();
    const send = (await handler('/plugins/wecom/send')!({ text: 'hi' })) as any;
    expect(send.ok).toBe(false);
    expect(String(send.message)).toContain('WECOM_CORP_ID');
    expect(String(send.howToConfigure)).toContain('WECOM_SECRET');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('wecom.plugin：已配置', () => {
  beforeEach(() => {
    process.env.WECOM_CORP_ID = CONFIG_ENV.WECOM_CORP_ID;
    process.env.WECOM_AGENT_ID = CONFIG_ENV.WECOM_AGENT_ID;
    process.env.WECOM_SECRET = CONFIG_ENV.WECOM_SECRET;
  });

  it('status 返回 configured:true 与已配置提示', async () => {
    const handler = await boot(loadManifest());
    const status = (await handler('/plugins/wecom/status')!({})) as any;
    expect(status).toMatchObject({ plugin: 'wecom-plugin', configured: true });
    expect(String(status.hint)).toContain('已配置');
  });

  it('send 缺 text → 参数校验失败且不调外部 API', async () => {
    const handler = await boot(loadManifest());
    global.fetch = jest.fn();
    const send = (await handler('/plugins/wecom/send')!({})) as any;
    expect(send.ok).toBe(false);
    expect(String(send.message)).toContain('text');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('获取 access_token 为空 → ok:false 且只请求一次', async () => {
    const handler = await boot(loadManifest());
    global.fetch = jest.fn().mockResolvedValue(fetchJson({}));
    const send = (await handler('/plugins/wecom/send')!({ text: 'hi' })) as any;
    expect(send).toMatchObject({ ok: false });
    expect(String(send.message)).toContain('access_token');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('send 成功：touser 默认 @all、agentid 转数字、消息体正确', async () => {
    const handler = await boot(loadManifest());
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(fetchJson({ access_token: 'W-TOK' }))
      .mockResolvedValueOnce(fetchJson({ errcode: 0, errmsg: 'ok' }));
    global.fetch = fetchMock as any;

    const send = (await handler('/plugins/wecom/send')!({ text: 'hi' })) as any;
    expect(send).toEqual({ ok: true, message: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [tokenUrl] = fetchMock.mock.calls[0] as [string];
    expect(tokenUrl).toContain('/cgi-bin/gettoken');
    expect(tokenUrl).toContain(`corpid=${CONFIG_ENV.WECOM_CORP_ID}`);
    expect(tokenUrl).toContain(`corpsecret=${CONFIG_ENV.WECOM_SECRET}`);

    const [sendUrl, sendInit] = fetchMock.mock.calls[1] as [string, any];
    expect(sendUrl).toContain('/cgi-bin/message/send?access_token=W-TOK');
    const body = JSON.parse(sendInit.body);
    expect(body).toEqual({
      touser: '@all',
      msgtype: 'text',
      agentid: Number(CONFIG_ENV.WECOM_AGENT_ID),
      text: { content: 'hi' },
    });
  });

  it('send 显式 touser 会原样进入消息体', async () => {
    const handler = await boot(loadManifest());
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(fetchJson({ access_token: 'W-TOK' }))
      .mockResolvedValueOnce(fetchJson({ errcode: 0, errmsg: 'ok' }));
    global.fetch = fetchMock as any;

    await handler('/plugins/wecom/send')!({ touser: 'zhangsan|lisi', text: 'hi' });
    const [, sendInit] = fetchMock.mock.calls[1] as [string, any];
    expect(JSON.parse(sendInit.body).touser).toBe('zhangsan|lisi');
  });

  it('send 企业微信返回 errcode≠0 → ok:false 且 message 取 errmsg', async () => {
    const handler = await boot(loadManifest());
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(fetchJson({ access_token: 'W-TOK' }))
      .mockResolvedValueOnce(fetchJson({ errcode: 93000, errmsg: 'invalid access_token' }));
    const send = (await handler('/plugins/wecom/send')!({ text: 'hi' })) as any;
    expect(send).toEqual({ ok: false, message: 'invalid access_token' });
  });

  it('send 企业微信返回 errcode≠0 且无 errmsg → message 回退为状态码', async () => {
    const handler = await boot(loadManifest());
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(fetchJson({ access_token: 'W-TOK' }))
      .mockResolvedValueOnce({ json: async () => ({}), status: 502 } as any);
    global.fetch = fetchMock as any;

    const send = (await handler('/plugins/wecom/send')!({ text: 'hi' })) as any;
    expect(send).toEqual({ ok: false, message: '企业微信 API 502' });
  });

  it('send fetch 抛异常（网络故障）→ ok:false 且 message 含异常', async () => {
    const handler = await boot(loadManifest());
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED qyapi.weixin.qq.com'));
    const send = (await handler('/plugins/wecom/send')!({ text: 'hi' })) as any;
    expect(send.ok).toBe(false);
    expect(String(send.message)).toContain('ECONNREFUSED');
  });
});
