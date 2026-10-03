// SPDX-License-Identifier: Apache-2.0

import { ValidationPipe } from '@nestjs/common';
import { CONFIRMATION_STATUS } from '../confirmation/confirmation.store';
import { MyConfirmationQueryDto } from './my-confirmation-query.dto';

// Same options as the global pipe in app.module (whitelist + forbidNonWhitelisted + transform).
// 与 app.module 全局管道一致（whitelist + forbidNonWhitelisted + transform）。
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

async function transform(value: unknown): Promise<MyConfirmationQueryDto> {
  return (await pipe.transform(value, { metatype: MyConfirmationQueryDto, type: 'query' })) as MyConfirmationQueryDto;
}

describe('MyConfirmationQueryDto（对齐全局 ValidationPipe）', () => {
  it('取值域与单源 CONFIRMATION_STATUS 完全一致', async () => {
    for (const value of Object.values(CONFIRMATION_STATUS)) {
      await expect(transform({ status: value })).resolves.toMatchObject({ status: value });
    }
  });

  it('未知 status 被拒 —— 原实现会静默忽略并退回「返回全部」（never silently widen）', async () => {
    await expect(transform({ status: 'bogus' })).rejects.toThrow();
    await expect(transform({ status: '' })).rejects.toThrow();
  });

  it('不传 status 通过（不按状态过滤是显式选择）', async () => {
    const dto = await transform({});
    expect(dto).toBeInstanceOf(MyConfirmationQueryDto);
    expect(dto.status).toBeUndefined();
  });
});
