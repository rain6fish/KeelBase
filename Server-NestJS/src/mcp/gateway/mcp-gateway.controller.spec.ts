import { Test } from '@nestjs/testing';
import { McpGatewayController } from './mcp-gateway.controller';
import { McpGatewayService } from './mcp-gateway.service';

describe('McpGatewayController (HS-10 入口 admin)', () => {
  let controller: McpGatewayController;
  let gateway: jest.Mocked<Pick<McpGatewayService, 'listServers' | 'registerServer' | 'removeServer' | 'discoverTools' | 'callExternalTool'>>;

  const user = { sub: 1, username: 'admin', role: 'admin' as const };

  beforeEach(async () => {
    gateway = {
      listServers: jest.fn().mockResolvedValue([]),
      registerServer: jest.fn().mockResolvedValue([]),
      removeServer: jest.fn().mockResolvedValue([]),
      discoverTools: jest.fn().mockResolvedValue([]),
      callExternalTool: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [McpGatewayController, { provide: McpGatewayService, useValue: gateway }],
    }).compile();
    controller = moduleRef.get(McpGatewayController);
  });

  it('listServers 委托', async () => {
    gateway.listServers.mockResolvedValue([{ name: 'wx', url: 'http://x' }]);
    await expect(controller.listServers()).resolves.toEqual([{ name: 'wx', url: 'http://x' }]);
  });

  it('register 传 name/url', async () => {
    await controller.register({ name: 'wx', url: 'http://x' } as any);
    expect(gateway.registerServer).toHaveBeenCalledWith('wx', 'http://x');
  });

  it('remove 传 name', async () => {
    await controller.remove('wx');
    expect(gateway.removeServer).toHaveBeenCalledWith('wx');
  });

  it('discover 透传 force', async () => {
    await controller.discover('true');
    expect(gateway.discoverTools).toHaveBeenCalledWith(true);
    await controller.discover(undefined);
    expect(gateway.discoverTools).toHaveBeenCalledWith(false);
  });

  it('call 透传并带 userId', async () => {
    await controller.call(user as any, { serverName: 'wx', toolName: 't', arguments: { a: 1 } } as any);
    expect(gateway.callExternalTool).toHaveBeenCalledWith('wx', 't', { a: 1 }, '1');
  });
});
