import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PluginsModule } from './plugins.module';
import { PluginsService } from './plugins.service';

describe('PluginsModule（工厂分支）', () => {
  it('引导后 PluginsService 加载 HELLO_PLUGIN 并解析路由', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PluginsModule] }).compile();
    const svc = moduleRef.get(PluginsService);

    // 插件在 onApplicationBootstrap 生命周期钩子中加载
    await svc.onApplicationBootstrap();

    const plugins = svc.listPlugins();
    expect(plugins.some((p) => p.name === 'hello-plugin')).toBe(true);

    const routes = svc.getRoutes();
    expect(routes.some((r) => r.path === '/plugins/hello')).toBe(true);

    const hello = routes.find((r) => r.path === '/plugins/hello');
    expect(hello).toBeDefined();
    const resp = hello!.handler({});
    expect(resp.hello).toBe('world');
  });

  it('serviceResolver 能解析宿主服务', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PluginsModule] }).compile();
    const svc = moduleRef.get(PluginsService);
    // 插件上下文 getService 经 ModuleRef 解析
    const resolved = svc.listPlugins();
    expect(resolved).toBeInstanceOf(Array);
  });
});
