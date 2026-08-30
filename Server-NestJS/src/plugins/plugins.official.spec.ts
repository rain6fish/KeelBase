import { PluginsService } from './plugins.service';
import { GITHUB_PLUGIN } from './plugins/github.plugin';
import { FEISHU_PLUGIN } from './plugins/feishu.plugin';
import { WECOM_PLUGIN } from './plugins/wecom.plugin';
import { PluginManifest } from './plugin.interface';

/**
 * P1-7 官方首批插件：github / feishu / wecom。
 * 验证 manifest 加载、路由注册、status 配置引导、未配置凭据不产生外部副作用。
 */

function makeService(plugins: PluginManifest[]) {
  const featureFlags = { isEnabled: jest.fn(() => true) } as any;
  const resolver = () => null as unknown;
  return new PluginsService(featureFlags, resolver, plugins);
}

function handlerOf(service: PluginsService, path: string) {
  return service.getRoutes().find((r) => r.path === path)?.handler;
}

describe('官方首批插件（P1-7）：github / feishu / wecom', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    // @ts-expect-error 清理测试内 mock 的 global.fetch
    delete global.fetch;
  });

  it('github-plugin：status 未配置引导 + repos 调 GitHub API 解析仓库', async () => {
    const service = makeService([GITHUB_PLUGIN]);
    await service.onApplicationBootstrap();

    const status = await handlerOf(service, '/plugins/github/status')!({});
    expect(status).toMatchObject({ plugin: 'github-plugin', tokenConfigured: false });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { name: 'KeelBase', description: 'base', html_url: 'https://github.com/rain6fish/KeelBase', stargazers_count: 10 },
      ],
    } as any);

    const repos = await handlerOf(service, '/plugins/github/repos')!({ owner: 'rain6fish' });
    expect(repos).toMatchObject({ ok: true, owner: 'rain6fish', count: 1 });
    expect(global.fetch).toHaveBeenCalled();
  });

  it('feishu-plugin：未配置时 status/send 返回配置引导且不调外部 API', async () => {
    const service = makeService([FEISHU_PLUGIN]);
    await service.onApplicationBootstrap();

    const status = await handlerOf(service, '/plugins/feishu/status')!({});
    expect(status).toMatchObject({ plugin: 'feishu-plugin', configured: false });

    global.fetch = jest.fn();
    const send = await handlerOf(service, '/plugins/feishu/send')!({ receiveId: 'ou_xxx', text: 'hi' });
    expect(send).toMatchObject({ ok: false });
    expect(String(send.howToConfigure)).toContain('FEISHU_APP_ID');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('wecom-plugin：未配置时 send 返回配置引导且不调外部 API', async () => {
    const service = makeService([WECOM_PLUGIN]);
    await service.onApplicationBootstrap();

    global.fetch = jest.fn();
    const send = await handlerOf(service, '/plugins/wecom/send')!({ text: 'hi' });
    expect(send).toMatchObject({ ok: false });
    expect(String(send.howToConfigure)).toContain('WECOM_CORP_ID');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
