// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { McpGatewayController } from './mcp-gateway.controller';
import { McpGatewayService } from './mcp-gateway.service';
import { CHECK_POLICIES_KEY } from '../../common/casl/check-policies.decorator';

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

  it('call 缺 arguments 时兜底空对象', async () => {
    await controller.call(user as any, { serverName: 'wx', toolName: 't' } as any);
    expect(gateway.callExternalTool).toHaveBeenCalledWith('wx', 't', {}, '1');
  });

  it('全部端点声明 manage:all 策略', () => {
    const ability = { can: jest.fn((a: string, r: string) => a === 'manage' && r === 'all') };
    const proto = McpGatewayController.prototype as any;
    let count = 0;
    for (const method of Object.getOwnPropertyNames(proto)) {
      if (method === 'constructor') continue;
      const handlers = Reflect.getMetadata(CHECK_POLICIES_KEY, proto[method]);
      if (!handlers) continue;
      count++;
      for (const h of handlers) expect(h(ability)).toBe(true);
    }
    expect(count).toBe(5);
  });
});
