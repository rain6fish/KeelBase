// SPDX-License-Identifier: Apache-2.0

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuditQueryDto } from './audit-query.dto';

describe('AuditQueryDto', () => {
  it('缺省字段使用默认值（limit=50, offset=0）', () => {
    const dto = plainToInstance(AuditQueryDto, {});
    expect(dto.limit).toBe(50);
    expect(dto.offset).toBe(0);
  });

  it('字符串数字经 @Type 转换为 number', () => {
    const dto = plainToInstance(AuditQueryDto, { orgId: '7', limit: '10', offset: '5' });
    expect(dto.orgId).toBe(7);
    expect(dto.limit).toBe(10);
    expect(dto.offset).toBe(5);
  });

  it('合法输入（含 userId/since）校验通过', async () => {
    const dto = plainToInstance(AuditQueryDto, {
      userId: '3',
      orgId: 7,
      limit: 50,
      offset: 0,
      since: '2026-08-01T00:00:00Z',
    });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
  });

  it('limit>200 / offset<0 / 非日期 since 校验失败', async () => {
    const dto = plainToInstance(AuditQueryDto, { limit: 999, offset: -1, since: 'not-a-date' });
    const errors = await validate(dto);
    const fields = errors.map((e) => e.property);
    expect(fields).toContain('limit');
    expect(fields).toContain('offset');
    expect(fields).toContain('since');
  });
});
