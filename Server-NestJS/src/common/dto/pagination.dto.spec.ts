// SPDX-License-Identifier: Apache-2.0

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationDto } from './pagination.dto';

describe('PaginationDto', () => {
  it('缺省字段使用默认值', () => {
    const dto = plainToInstance(PaginationDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.sort).toBe('createdTime');
    expect(dto.order).toBe('desc');
  });

  it('字符串数字经 @Type 转换为 number', () => {
    const dto = plainToInstance(PaginationDto, { page: '2', limit: '30' });
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(30);
    expect(typeof dto.page).toBe('number');
  });

  it('合法输入校验通过', async () => {
    const dto = plainToInstance(PaginationDto, { page: 1, limit: 20, sort: 'createdAt', order: 'asc' });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
  });

  it('page<1 / limit>100 校验失败', async () => {
    const dto = plainToInstance(PaginationDto, { page: 0, limit: 999 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const fields = errors.map((e) => e.property);
    expect(fields).toContain('page');
    expect(fields).toContain('limit');
  });

  it('sort/order 非法类型（数字）校验失败', async () => {
    const dto = plainToInstance(PaginationDto, { sort: 123, order: 456 } as any);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'sort')).toBe(true);
    expect(errors.some((e) => e.property === 'order')).toBe(true);
  });
});
