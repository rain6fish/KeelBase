// SPDX-License-Identifier: Apache-2.0

import { ValidationPipe } from '@nestjs/common';
import { CallExternalToolDto, RegisterServerDto } from './mcp-gateway.controller';

// 与 app.module 全局管道一致（whitelist + forbidNonWhitelisted + transform）
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

async function transform<T>(value: unknown, metatype: new () => T): Promise<T> {
  return (await pipe.transform(value, { metatype, type: 'body' })) as T;
}

describe('McpGatewayController DTO 校验（对齐全局 ValidationPipe）', () => {
  it('RegisterServerDto：合法 {name,url} 通过', async () => {
    const dto = await transform({ name: 'srv', url: 'https://example.com/mcp' }, RegisterServerDto);
    expect(dto.name).toBe('srv');
    expect(dto.url).toBe('https://example.com/mcp');
  });

  it('RegisterServerDto：缺字段被拒（否则管理台注册会 400）', async () => {
    await expect(transform({ name: 'srv' }, RegisterServerDto)).rejects.toThrow();
  });

  it('RegisterServerDto：多余字段被拒（forbidNonWhitelisted）', async () => {
    await expect(
      transform({ name: 'srv', url: 'https://x.com', extra: 1 }, RegisterServerDto),
    ).rejects.toThrow();
  });

  it('CallExternalToolDto：合法通过', async () => {
    const dto = await transform(
      { serverName: 's', toolName: 't', arguments: { a: 1 } },
      CallExternalToolDto,
    );
    expect(dto.arguments).toEqual({ a: 1 });
  });

  it('CallExternalToolDto：缺 serverName / arguments 非对象被拒', async () => {
    await expect(transform({ toolName: 't', arguments: {} }, CallExternalToolDto)).rejects.toThrow();
    await expect(
      transform({ serverName: 's', toolName: 't', arguments: 'nope' }, CallExternalToolDto),
    ).rejects.toThrow();
  });
});
