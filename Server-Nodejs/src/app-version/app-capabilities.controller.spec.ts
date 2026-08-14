import { Test } from '@nestjs/testing';
import { AppCapabilitiesController } from './app-capabilities.controller';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';

describe('AppCapabilitiesController（MOD-4）', () => {
  let controller: AppCapabilitiesController;

  beforeEach(async () => {
    const flagsService = {
      getPreset: () => 'lite',
      getFlags: () => ({
        ai: true,
        search: false,
        push: false,
        sms: false,
        oauth: false,
        upload: true,
        notifications: true,
        todos: true,
        tags: false,
        notes: false,
        books: false,
        posts: false,
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [AppCapabilitiesController],
      providers: [{ provide: FeatureFlagsService, useValue: flagsService }],
    }).compile();
    controller = module.get(AppCapabilitiesController);
  });

  it('返回预设 + 启用模块（lite 预设隐藏未启用导航）', () => {
    const res = controller.getCapabilities();
    expect(res.preset).toBe('lite');
    // lite 预设：events/todos 启用，tags/notes/books/posts 关闭
    const ids = res.businessModules.map((m) => m.id);
    expect(ids).toContain('events');
    expect(ids).toContain('todos');
    expect(ids).not.toContain('tags');
    expect(ids).not.toContain('books');
    // businessModules 每个带 label（前端展示用）
    expect(res.businessModules.every((m) => m.label)).toBe(true);
  });
});
