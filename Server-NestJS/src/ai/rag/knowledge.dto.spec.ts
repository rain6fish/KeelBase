// SPDX-License-Identifier: Apache-2.0

import { ValidationPipe } from '@nestjs/common';
import { KnowledgeQueryDto } from './knowledge.dto';

// Same options as the global pipe in app.module (whitelist + forbidNonWhitelisted + transform).
// 与 app.module 全局管道一致（whitelist + forbidNonWhitelisted + transform）。
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

async function transform(value: unknown): Promise<KnowledgeQueryDto> {
  return (await pipe.transform(value, { metatype: KnowledgeQueryDto, type: 'query' })) as KnowledgeQueryDto;
}

describe('KnowledgeQueryDto（与共享 PaginationDto 同一上限）', () => {
  it('limit 超过共享上限 100 被拒 —— 此前无上限，可拉走整张表', async () => {
    await expect(transform({ limit: '101' })).rejects.toThrow();
    await expect(transform({ limit: '1000000' })).rejects.toThrow();
  });

  it('limit = 100 与缺省都通过', async () => {
    await expect(transform({ limit: '100' })).resolves.toMatchObject({ limit: 100 });
    await expect(transform({})).resolves.toBeInstanceOf(KnowledgeQueryDto);
  });

  it('limit 非正数被拒（@Min(1)）', async () => {
    await expect(transform({ limit: '0' })).rejects.toThrow();
    await expect(transform({ limit: '-1' })).rejects.toThrow();
  });
});
