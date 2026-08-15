import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let service: jest.Mocked<Pick<TemplatesService, 'listTemplates' | 'importTemplate'>>;

  beforeEach(() => {
    service = { listTemplates: jest.fn(), importTemplate: jest.fn() };
    controller = new TemplatesController(service as unknown as TemplatesService);
  });

  it('list 委托 service.listTemplates', () => {
    const list = [{ id: 'daily', name: '每日日程' }];
    service.listTemplates.mockReturnValue(list as never);
    expect(controller.list()).toBe(list);
    expect(service.listTemplates).toHaveBeenCalled();
  });

  it('importTemplate 透传 id 与 userId', async () => {
    const result = { events: 2, todos: 1 };
    service.importTemplate.mockResolvedValue(result as never);
    await expect(controller.importTemplate('daily', 5)).resolves.toBe(result);
    expect(service.importTemplate).toHaveBeenCalledWith('daily', 5);
  });

  it('importTemplate 不传 userId 时透传 undefined', async () => {
    service.importTemplate.mockResolvedValue({ events: 0, todos: 0 } as never);
    await expect(controller.importTemplate('daily', undefined)).resolves.toMatchObject({});
    expect(service.importTemplate).toHaveBeenCalledWith('daily', undefined);
  });
});
