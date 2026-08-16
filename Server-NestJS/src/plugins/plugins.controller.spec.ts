import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';

describe('PluginsController', () => {
  let controller: PluginsController;
  let pluginsService: Record<string, jest.Mock>;

  beforeEach(() => {
    pluginsService = { listPlugins: jest.fn(), getRoutes: jest.fn() };
    controller = new PluginsController(pluginsService as unknown as PluginsService);
  });

  it('插件列表委托 service', () => {
    pluginsService.listPlugins.mockReturnValue([{ name: 'hello' }]);
    expect(controller.list()).toEqual([{ name: 'hello' }]);
    expect(pluginsService.listPlugins).toHaveBeenCalled();
  });

  it('插件路由存在时调用 handler', async () => {
    const handler = jest.fn().mockReturnValue({ ok: true });
    pluginsService.getRoutes.mockReturnValue([{ path: '/plugins/hello', handler }, { path: '/plugins/other', handler: jest.fn() }]);
    await expect(controller.invoke('hello', { name: 'x' })).resolves.toEqual({ ok: true });
    expect(handler).toHaveBeenCalledWith({ name: 'x' });
  });

  it('插件路由不存在时返回错误对象', async () => {
    pluginsService.getRoutes.mockReturnValue([]);
    await expect(controller.invoke('unknown', {})).resolves.toEqual({ error: '插件路由 /plugins/unknown 不存在' });
  });
});
