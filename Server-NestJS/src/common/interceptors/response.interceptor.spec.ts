// SPDX-License-Identifier: Apache-2.0

import { lastValueFrom, of } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { ResponseInterceptor } from './response.interceptor';
import { RAW_RESPONSE_KEY } from '../decorators/raw.decorator';

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
