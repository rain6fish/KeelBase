import { PluginsService } from './plugins.service';
import { PluginManifest } from './plugin.interface';

function makeService(overrides: {
  flags?: Record<string, boolean>;
  services?: Record<string, unknown>;
  plugins?: PluginManifest[];
}) {
  const flags = overrides.flags ?? {};
  const featureFlags = {
    isEnabled: jest.fn((k: string) => flags[k] ?? true),
  } as any;
  const services = overrides.services ?? {};
  const resolver = (name: string) => services[name] ?? null;
  const plugins = overrides.plugins ?? [];
  return new PluginsService(featureFlags, resolver, plugins);
}

describe('PluginsService（PL-11）', () => {
  it('加载启用插件并在启动后触发 onAppStart', async () => {
    const onAppStart = jest.fn();
    const plugin: PluginManifest = {
      name: 'p1',
      version: '1.0.0',
      description: 't',
      hooks: { onAppStart },
    };
    const service = makeService({ plugins: [plugin] });

    await service.onApplicationBootstrap();

    expect(onAppStart).toHaveBeenCalled();
    expect(service.listPlugins()).toHaveLength(1);
  });

  it('requires 依赖缺失时跳过插件', async () => {
    const plugin: PluginManifest = {
      name: 'p2',
      version: '1.0.0',
      description: 't',
      requires: ['UsersService'],
    };
    const service = makeService({ plugins: [plugin], services: {} });
    await service.onApplicationBootstrap();
    expect(service.listPlugins()).toHaveLength(0);
  });

  it('requires 依赖存在时加载', async () => {
    const plugin: PluginManifest = {
      name: 'p3',
      version: '1.0.0',
      description: 't',
      requires: ['UsersService'],
    };
    const service = makeService({ plugins: [plugin], services: { UsersService: {} } });
    await service.onApplicationBootstrap();
    expect(service.listPlugins()).toHaveLength(1);
  });

  it('featureFlag 关闭时不加载插件', async () => {
    const plugin: PluginManifest = {
      name: 'p4',
      version: '1.0.0',
      description: 't',
      featureFlag: 'ai',
    };
    const service = makeService({ plugins: [plugin], flags: { ai: false } });
    await service.onApplicationBootstrap();
    expect(service.listPlugins()).toHaveLength(0);
  });

  it('registerRoute 后 getRoutes 可查询并调用', async () => {
    const plugin: PluginManifest = {
      name: 'p5',
      version: '1.0.0',
      description: 't',
      hooks: {
        onAppStart: (ctx) => {
          ctx.registerRoute('/plugins/hello', () => ({ ok: true }));
        },
      },
    };
    const service = makeService({ plugins: [plugin] });
    await service.onApplicationBootstrap();

    const routes = service.getRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/plugins/hello');
    expect(await routes[0].handler(null)).toEqual({ ok: true });
  });

  it('notifyFeatureChange 触发对应插件的 onFeatureChange', async () => {
    const onChange = jest.fn();
    const plugin: PluginManifest = {
      name: 'p6',
      version: '1.0.0',
      description: 't',
      featureFlag: 'ai',
      hooks: { onFeatureChange: onChange },
    };
    const service = makeService({ plugins: [plugin] });
    await service.onApplicationBootstrap();

    await service.notifyFeatureChange('ai', true);

    expect(onChange).toHaveBeenCalledWith('ai', true);
  });
});
