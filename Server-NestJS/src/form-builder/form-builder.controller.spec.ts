import { FormBuilderController } from './form-builder.controller';
import { FormBuilderService } from './form-builder.service';

describe('FormBuilderController', () => {
  let controller: FormBuilderController;
  let formBuilder: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };

  beforeEach(() => {
    formBuilder = Object.fromEntries(
      ['getSchemaBySlug', 'submit', 'mySubmissions'].map((m) => [m, jest.fn()]),
    );
    controller = new FormBuilderController(formBuilder as unknown as FormBuilderService);
  });

  it('读取表单定义委托 service', () => {
    formBuilder.getSchemaBySlug.mockReturnValue({ title: '报名表' });
    expect(controller.getForm('signup')).toEqual({ title: '报名表' });
    expect(formBuilder.getSchemaBySlug).toHaveBeenCalledWith('signup');
  });

  it('提交表单委托 service', () => {
    formBuilder.submit.mockReturnValue({ id: 1 });
    const data = { name: '张三' };
    expect(controller.submit('signup', mockUser as any, data)).toEqual({ id: 1 });
    expect(formBuilder.submit).toHaveBeenCalledWith('signup', 1, data);
  });

  it('我的提交记录委托 service', () => {
    formBuilder.mySubmissions.mockReturnValue([]);
    expect(controller.mySubmissions('signup', mockUser as any)).toEqual([]);
    expect(formBuilder.mySubmissions).toHaveBeenCalledWith('signup', 1);
  });
});
