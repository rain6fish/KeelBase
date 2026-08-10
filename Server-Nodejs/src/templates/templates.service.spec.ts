import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { User } from '../common/entities/user.entity';
import { EventsService } from '../events/events.service';
import { TodosService } from '../todos/todos.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TemplatesService } from './templates.service';
import { APP_TEMPLATES } from './templates';

describe('TemplatesService（PL-9）', () => {
  let service: TemplatesService;
  let usersRepo: { findOne: jest.Mock };
  let eventsService: { create: jest.Mock };
  let todosService: { create: jest.Mock };
  let notificationsService: { create: jest.Mock };

  beforeEach(async () => {
    usersRepo = { findOne: jest.fn() };
    eventsService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    todosService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    notificationsService = { create: jest.fn().mockResolvedValue({ id: 1 }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: EventsService, useValue: eventsService },
        { provide: TodosService, useValue: todosService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();
    service = moduleRef.get(TemplatesService);
  });

  it('listTemplates 返回内置模板', () => {
    const templates = service.listTemplates();
    expect(templates.length).toBe(APP_TEMPLATES.length);
    expect(templates.map((t) => t.id)).toContain('personal-assistant');
  });

  it('importTemplate 导入事件与待办到默认 admin', async () => {
    usersRepo.findOne.mockResolvedValueOnce({ id: 5 }).mockResolvedValueOnce(null);
    const result = await service.importTemplate('personal-assistant');

    expect(eventsService.create).toHaveBeenCalled();
    expect(todosService.create).toHaveBeenCalled();
    expect(result.events).toBeGreaterThan(0);
    expect(result.targetUserId).toBe(5);
    expect(notificationsService.create).toHaveBeenCalled();
  });

  it('importTemplate 未知模板抛 404', async () => {
    await expect(service.importTemplate('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
