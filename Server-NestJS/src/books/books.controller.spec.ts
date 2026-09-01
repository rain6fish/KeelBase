// SPDX-License-Identifier: Apache-2.0

import { BooksController } from './books.controller';
import { BooksService } from './books.service';

describe('BooksController', () => {
  let controller: BooksController;
  let booksService: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };
  const ability = {} as any;

  beforeEach(() => {
    booksService = Object.fromEntries(['create', 'findAll', 'update', 'remove'].map((m) => [m, jest.fn()]));
    controller = new BooksController(booksService as unknown as BooksService);
  });

  it('图书 CRUD 委托 service', async () => {
    const dto = { title: '深入理解计算机系统' };
    booksService.create.mockResolvedValue({ id: 1 });
    booksService.findAll.mockResolvedValue([]);
    booksService.update.mockResolvedValue({ id: 1 });
    booksService.remove.mockResolvedValue(undefined);

    await expect(controller.create(dto as any, mockUser as any)).resolves.toEqual({ id: 1 });
    await expect(controller.findAll(mockUser as any)).resolves.toEqual([]);
    await expect(controller.update(1, dto as any, mockUser as any, ability)).resolves.toEqual({ id: 1 });
    await expect(controller.remove(1, mockUser as any, ability)).resolves.toBeNull();

    expect(booksService.create).toHaveBeenCalledWith(dto, 1);
    expect(booksService.findAll).toHaveBeenCalledWith(1);
    expect(booksService.update).toHaveBeenCalledWith(1, dto, ability);
    expect(booksService.remove).toHaveBeenCalledWith(1, ability);
  });
});
