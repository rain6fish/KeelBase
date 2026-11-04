// SPDX-License-Identifier: Apache-2.0

import { lastValueFrom, of } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { ResponseInterceptor } from './response.interceptor';
import { RAW_RESPONSE_KEY } from '../decorators/raw.decorator';
import { RESPONSE_ORDERING_KEY } from '../decorators/response-ordering.decorator';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<unknown>;
  let reflector: Reflector;

  function makeContext(isRaw: boolean) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getResponse: () => ({ statusCode: 201 }) }),
      getArgByIndex: jest.fn(),
      getArgs: () => [],
      getType: () => 'http',
    } as any;
  }

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new ResponseInterceptor(reflector);
  });

  it('未标 @Raw 时包装为统一响应结构', async () => {
    const ctx = makeContext(false);
    const result = await lastValueFrom(
      interceptor.intercept(ctx, { handle: () => of({ id: 1 }) } as any),
    );
    expect(result).toMatchObject({ code: 201, message: '操作成功', data: { id: 1 } });
    expect(result).toHaveProperty('timestamp');
  });

  it('② 绑定：信封键集 ⊆ api-response 冻结契约（v2：ordering 可选）', async () => {
    const schema = JSON.parse(
      readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v2/api-response.schema.json'), 'utf8'),
    ) as { properties: Record<string, unknown> };
    const allowed = Object.keys(schema.properties);
    const result = (await lastValueFrom(
      interceptor.intercept(makeContext(false), { handle: () => of({ id: 1 }) } as any),
    )) as Record<string, unknown>;
    expect(Object.keys(result).filter((k) => !allowed.includes(k))).toEqual([]);
    // 没有声明的读不带这个键 —— 一个永远出现的字段，最后就没人读了
    expect(result).not.toHaveProperty('ordering');
  });

  it('带 @ResponseOrdering 时，声明随信封一起发出（并仍在契约属性内）', async () => {
    const declaration = {
      field: 'createdAt',
      direction: 'desc' as const,
      controlledBy: 'receiver' as const,
      tiebreak: { field: 'id', direction: 'desc' as const },
      attested: 'none' as const,
    };
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
      key === RESPONSE_ORDERING_KEY ? (declaration as never) : (undefined as never),
    );
    const schema = JSON.parse(
      readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v2/api-response.schema.json'), 'utf8'),
    ) as { properties: Record<string, unknown> };

    const result = (await lastValueFrom(
      interceptor.intercept(makeContext(false), { handle: () => of([]) } as any),
    )) as Record<string, unknown>;

    expect(result.ordering).toEqual(declaration);
    expect(Object.keys(result).filter((k) => !Object.keys(schema.properties).includes(k))).toEqual([]);
  });

  it('data 为 null 时包装 null', async () => {
    const ctx = makeContext(false);
    const result = await lastValueFrom(
      interceptor.intercept(ctx, { handle: () => of(null) } as any),
    );
    expect(result).toMatchObject({ code: 201, data: null });
  });

  it('标 @Raw 时跳过包装直接透传', async () => {
    // 手动设置 raw 标记，模拟 @Raw() 装饰器
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const ctx = makeContext(false);
    const result = await lastValueFrom(
      interceptor.intercept(ctx, { handle: () => of({ raw: true }) } as any),
    );
    expect(result).toEqual({ raw: true });
  });

  it('从装饰器元数据读取 RAW_RESPONSE_KEY', () => {
    const spy = jest.spyOn(reflector, 'getAllAndOverride');
    const ctx = makeContext(false);
    interceptor.intercept(ctx, { handle: () => of(1) } as any).subscribe();
    expect(spy).toHaveBeenCalledWith(RAW_RESPONSE_KEY, [ctx.getHandler(), ctx.getClass()]);
  });
});
