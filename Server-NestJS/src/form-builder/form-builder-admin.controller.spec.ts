import { FormBuilderAdminController } from './form-builder-admin.controller';
import { FormBuilderService } from './form-builder.service';

describe('FormBuilderAdminController', () => {
  let controller: FormBuilderAdminController;
  let formBuilder: Record<string, jest.Mock>;

  beforeEach(() => {
    formBuilder = Object.fromEntries(
      ['listSchemas', 'createSchema', 'updateSchema', 'removeSchema', 'listSubmissions'].map((m) => [m, jest.fn()]),
    );
    controller = new FormBuilderAdminController(formBuilder as unknown as FormBuilderService);
  });

  it('列表/提交列表委托 service', () => {
    formBuilder.listSchemas.mockReturnValue({ items: [], total: 0 });
    formBuilder.listSubmissions.mockReturnValue({ items: [], total: 0 });

    expect(controller.list(1, 20)).toEqual({ items: [], total: 0 });
    expect(formBuilder.listSchemas).toHaveBeenCalledWith({ page: 1, limit: 20 });

    expect(controller.submissions(3, 1, 20)).toEqual({ items: [], total: 0 });
    expect(formBuilder.listSubmissions).toHaveBeenCalledWith(3, 1, 20);
  });

  it('创建/更新/删除表单委托 service', () => {
    formBuilder.createSchema.mockReturnValue({ id: 1 });
    formBuilder.updateSchema.mockReturnValue({ id: 1 });
    formBuilder.removeSchema.mockReturnValue(undefined);

    expect(controller.create({ title: 'T', slug: 's', schema: { a: 1 }, description: 'd' } as any)).toEqual({ id: 1 });
    expect(formBuilder.createSchema).toHaveBeenCalledWith({ title: 'T', slug: 's', schema: { a: 1 }, description: 'd' });

    expect(controller.update(1, { title: 'T2', enabled: false } as any)).toEqual({ id: 1 });
    expect(formBuilder.updateSchema).toHaveBeenCalledWith(1, { title: 'T2', schema: undefined, description: undefined, enabled: false });

    expect(controller.remove(1)).toBeUndefined();
    expect(formBuilder.removeSchema).toHaveBeenCalledWith(1);
  });
});
