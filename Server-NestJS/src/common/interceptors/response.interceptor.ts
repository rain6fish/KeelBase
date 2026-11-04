// SPDX-License-Identifier: Apache-2.0

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';
import { RAW_RESPONSE_KEY } from '../decorators/raw.decorator';
import { RESPONSE_ORDERING_KEY } from '../decorators/response-ordering.decorator';
import type { OrderingDeclaration } from '../../governance-shared/services/ordering';

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | T>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | T> {
    const isRaw = this.reflector.getAllAndOverride<boolean>(
      RAW_RESPONSE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isRaw) {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const httpStatus = response.statusCode;

    // Declared by the read that produced the rows, carried by the response that delivers them.
    // 由产出这些行的读声明，由交付它们的响应随身带走。
    const ordering = this.reflector.getAllAndOverride<OrderingDeclaration | undefined>(
      RESPONSE_ORDERING_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((data) => ({
        code: httpStatus,
        message: '操作成功',
        data: data ?? null,
        timestamp: new Date().toISOString(),
        ...(ordering ? { ordering } : {}),
      })),
    );
  }
}
