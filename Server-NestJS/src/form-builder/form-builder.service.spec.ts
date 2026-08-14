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
});
