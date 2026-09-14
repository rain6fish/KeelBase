// SPDX-License-Identifier: Apache-2.0

import { HttpStatus } from '@nestjs/common';
import { BusinessException } from './business.exception';
import { API_ERROR_CODES } from './api-error-codes';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('BusinessException', () => {
  it('按错误码取默认 HTTP 状态码', () => {
    const ex = new BusinessException('EVENT_NOT_FOUND');
    expect(ex.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(ex.errorCode).toBe('EVENT_NOT_FOUND');
  });

  it('①补 绑定：错误码目录值域 == api-error-code 冻结契约（码集 + HTTP 映射全等）', () => {
    const schema = JSON.parse(
      readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v1/api-error-code.schema.json'), 'utf8'),
    ) as { required: string[]; properties: Record<string, { properties: { status: { const: number } } }> };
    expect(Object.keys(API_ERROR_CODES).sort()).toEqual(schema.required.sort());
    for (const code of schema.required) {
      expect(API_ERROR_CODES[code].status).toBe(schema.properties[code].properties.status.const);
    }
  });

  it('未知错误码回退 400', () => {
    const ex = new BusinessException('UNKNOWN_CODE');
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('未覆盖 message 时 response 不含 message（由 filter 本地化）', () => {
    const ex = new BusinessException('USER_NOT_FOUND');
    expect(ex.getResponse()).toEqual({ errorCode: 'USER_NOT_FOUND' });
  });

  it('覆盖 message 时 response 带自定义文案', () => {
    const ex = new BusinessException('USER_NOT_FOUND', '自定义文案');
    expect(ex.getResponse()).toEqual({ errorCode: 'USER_NOT_FOUND', message: '自定义文案' });
  });

  it('of 工厂等价 new', () => {
    const a = BusinessException.of('FORBIDDEN');
    const b = new BusinessException('FORBIDDEN');
    expect(a.errorCode).toBe(b.errorCode);
    expect(a.getStatus()).toBe(b.getStatus());
  });

  it('仍继承 Error，可被 @Catch() 捕获', () => {
    expect(new BusinessException('RATE_LIMITED')).toBeInstanceOf(Error);
  });
});
