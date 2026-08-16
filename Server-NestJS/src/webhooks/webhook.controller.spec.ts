import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

describe('WebhookController', () => {
  let controller: WebhookController;
  let webhookService: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };

  beforeEach(() => {
    webhookService = Object.fromEntries(
      ['subscribe', 'list', 'setEnabled', 'remove', 'testDeliver'].map((m) => [m, jest.fn()]),
    );
    controller = new WebhookController(webhookService as unknown as WebhookService);
  });

  it('订阅委托 service', () => {
    const dto = { name: 'api', url: 'https://example.com/hook', events: ['event.created'] };
    webhookService.subscribe.mockReturnValue({ id: 1 });
    expect(controller.subscribe(mockUser as any, dto as any)).toEqual({ id: 1 });
    expect(webhookService.subscribe).toHaveBeenCalledWith(1, dto);
  });

  it('列表委托 service', () => {
    webhookService.list.mockReturnValue([]);
    expect(controller.list(mockUser as any)).toEqual([]);
    expect(webhookService.list).toHaveBeenCalledWith(1);
  });

  it('启停委托 service', async () => {
    webhookService.setEnabled.mockResolvedValue({ id: 2, enabled: false });
    await expect(controller.setEnabled(mockUser as any, 2, { enabled: false } as any)).resolves.toEqual({ id: 2, enabled: false });
    expect(webhookService.setEnabled).toHaveBeenCalledWith(1, 2, false);
  });

  it('删除/测试投递委托 service', async () => {
    webhookService.remove.mockResolvedValue({ deleted: true });
    webhookService.testDeliver.mockResolvedValue({ delivered: true });

    await expect(controller.remove(mockUser as any, 3)).resolves.toEqual({ deleted: true });
    expect(webhookService.remove).toHaveBeenCalledWith(1, 3);

    await expect(controller.test(mockUser as any, 3)).resolves.toEqual({ delivered: true });
    expect(webhookService.testDeliver).toHaveBeenCalledWith(1, 3);
  });
});
