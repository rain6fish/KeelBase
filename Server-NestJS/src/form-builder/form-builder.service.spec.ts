import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FormSchema } from './form-schema.entity';
import { FormSubmission } from './form-submission.entity';
import { FormBuilderService } from './form-builder.service';

function makeRepo() {
  return {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn((d: any) => d),
    save: jest.fn(async (d: any) => ({ ...d, id: 1 })),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

const validSchema = {
  title: '活动报名',
  fields: [
    { key: 'name', label: '姓名', type: 'text', required: true },
    { key: 'email', label: '邮箱', type: 'email', required: true },
    { key: 'city', label: '城市', type: 'select', options: ['北京', '上海'] },
  ],
};

describe('FormBuilderService（PL-10）', () => {
  let service: FormBuilderService;
  let schemaRepo: ReturnType<typeof makeRepo>;
  let subRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    schemaRepo = makeRepo();
    subRepo = makeRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FormBuilderService,
        { provide: getRepositoryToken(FormSchema), useValue: schemaRepo },
        { provide: getRepositoryToken(FormSubmission), useValue: subRepo },
      ],
    }).compile();
    service = moduleRef.get(FormBuilderService);
  });

  it('createSchema 合法 schema 保存', async () => {
    schemaRepo.findOne.mockResolvedValue(null);
    const result = await service.createSchema({ title: '报名', slug: 'signup', schema: validSchema });
    expect(result.id).toBe(1);
  });

  it('createSchema 无字段抛错', async () => {
    await expect(service.createSchema({ title: 'x', slug: 'x', schema: { title: 'x', fields: [] } } as never))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('createSchema slug 重复抛错', async () => {
    schemaRepo.findOne.mockResolvedValue({ id: 1 });
    await expect(service.createSchema({ title: 'x', slug: 'dup', schema: validSchema }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('submit 合法数据保存并返回 id', async () => {
    schemaRepo.findOne.mockResolvedValue({ id: 1, enabled: true, schemaJson: JSON.stringify(validSchema) });
    const result = await service.submit('signup', 42, { name: '张三', email: 'z@x.com', city: '北京' });
    expect(result.id).toBe(1);
    expect(subRepo.save).toHaveBeenCalled();
  });

  it('submit 缺必填抛校验错误', async () => {
    schemaRepo.findOne.mockResolvedValue({ id: 1, enabled: true, schemaJson: JSON.stringify(validSchema) });
    await expect(service.submit('signup', 42, { name: '' }))
      .rejects.toMatchObject({ message: '表单校验失败' });
  });

  it('submit 邮箱格式错误', async () => {
    schemaRepo.findOne.mockResolvedValue({ id: 1, enabled: true, schemaJson: JSON.stringify(validSchema) });
    await expect(service.submit('signup', 42, { name: '张三', email: 'not-email' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('getSchemaBySlug 已停用抛 404', async () => {
    schemaRepo.findOne.mockResolvedValue({ id: 1, enabled: false, schemaJson: '{}' });
    await expect(service.getSchemaBySlug('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── 补充覆盖：列表 / 更新 / 删除 / 各类校验 ────────────────────────────────

  it('getSchemaBySlug schemaJson 损坏抛 400', async () => {
    schemaRepo.findOne.mockResolvedValue({ id: 1, enabled: true, schemaJson: '{broken' });
    await expect(service.getSchemaBySlug('x')).rejects.toMatchObject({ message: '表单定义损坏' });
  });

  it('listSchemas 分页返回', async () => {
    schemaRepo.findAndCount.mockResolvedValue([[{ id: 1, title: '报名' }], 1]);
    const result = await service.listSchemas({ page: 2, limit: 10 });
    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(schemaRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('listSchemas 缺省分页参数', async () => {
    const result = await service.listSchemas();
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('updateSchema 更新标题/描述/启用并校验新 schema', async () => {
    const row = { id: 1, title: '旧', description: 'd', enabled: true, schemaJson: '{}' };
    schemaRepo.findOneBy.mockResolvedValue(row);
    schemaRepo.save.mockImplementation(async (r: any) => ({ ...r, id: 1 }));
    await service.updateSchema(1, { title: '新', description: 'd2', enabled: false, schema: validSchema });
    expect(schemaRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: '新', description: 'd2', enabled: false }),
    );
  });

  it('updateSchema 不存在抛 404；schema 非法抛 400', async () => {
    schemaRepo.findOneBy.mockResolvedValueOnce(null);
    await expect(service.updateSchema(99, { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);

    schemaRepo.findOneBy.mockResolvedValueOnce({ id: 1, schemaJson: '{}' });
    await expect(service.updateSchema(1, { schema: { title: 'x', fields: [] } as never }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('removeSchema 删除 schema 及关联提交', async () => {
    await expect(service.removeSchema(3)).resolves.toEqual({ deleted: true });
    expect(schemaRepo.delete).toHaveBeenCalledWith(3);
    expect(subRepo.delete).toHaveBeenCalledWith({ schemaId: 3 });
  });

  it('listSubmissions 解析 data JSON', async () => {
    subRepo.findAndCount.mockResolvedValue([
      [{ id: 1, userId: 5, data: '{"name":"张三"}', createdAt: new Date() }],
      1,
    ]);
    const result = await service.listSubmissions(1, 1, 20);
    expect(result.items[0].data).toEqual({ name: '张三' });
    expect(result.items[0].userId).toBe(5);
  });

  it('mySubmissions 按 slug+本人过滤', async () => {
    schemaRepo.findOne.mockResolvedValue({ id: 1, enabled: true, schemaJson: JSON.stringify(validSchema) });
    subRepo.findAndCount.mockResolvedValue([
      [{ id: 1, data: '{"name":"张三"}', createdAt: new Date() }],
      1,
    ]);
    const result = await service.mySubmissions('signup', 42, 1, 20);
    expect(result.items).toHaveLength(1);
    expect(subRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schemaId: 1, userId: 42 } }),
    );
  });

  it('validateData：number/boolean/select/text 非法值', async () => {
    const mixedSchema = {
      title: '混合',
      fields: [
        { key: 'age', label: '年龄', type: 'number' },
        { key: 'agree', label: '同意', type: 'boolean' },
        { key: 'city', label: '城市', type: 'select', options: ['北京'] },
        { key: 'note', label: '备注', type: 'text' },
      ],
    };
    schemaRepo.findOne.mockResolvedValue({ id: 1, enabled: true, schemaJson: JSON.stringify(mixedSchema) });
    await expect(
      service.submit('mixed', 1, { age: 'abc', agree: 'yes', city: '上海', note: 123 }),
    ).rejects.toMatchObject({ message: '表单校验失败' });
  });

  it('validateData：number 字符串数字合法、boolean true 合法、text 字符串合法', async () => {
    const mixedSchema = {
      title: '混合',
      fields: [
        { key: 'age', label: '年龄', type: 'number' },
        { key: 'agree', label: '同意', type: 'boolean' },
        { key: 'note', label: '备注', type: 'text' },
      ],
    };
    schemaRepo.findOne.mockResolvedValue({ id: 1, enabled: true, schemaJson: JSON.stringify(mixedSchema) });
    const result = await service.submit('mixed', 1, { age: '18', agree: true, note: 'hi' });
    expect(result.id).toBe(1);
  });
});
