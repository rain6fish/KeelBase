// SPDX-License-Identifier: Apache-2.0

import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { CHECK_POLICIES_KEY } from '../../common/casl/check-policies.decorator';

// 捕获 FileInterceptor 的 multer options（fileFilter 仅在真实 multipart 处理时触发，
// 单元测试从捕获的 options 中直接调用以覆盖 mimetype 校验分支）
jest.mock('@nestjs/platform-express', () => ({
  FileInterceptor: jest.fn(() => () => undefined),
}));

const fileInterceptorMock = FileInterceptor as unknown as jest.Mock;

const getFileFilter = (): ((_req: any, file: any, cb: (err: Error | null, ok: boolean) => void) => void) =>
  fileInterceptorMock.mock.calls[0][1].fileFilter;

describe('KnowledgeController', () => {
  let controller: KnowledgeController;
  let knowledgeService: Record<string, jest.Mock>;

  beforeEach(() => {
    knowledgeService = Object.fromEntries(
      [
        'create', 'createDocument', 'findAll', 'getStats', 'debugSearch',
        'findOne', 'getChunks', 'update', 'remove',
      ].map((m) => [m, jest.fn()]),
    );
    controller = new KnowledgeController(knowledgeService as unknown as KnowledgeService);
  });

  it('知识条目 CRUD 委托 service', async () => {
    const dto = { title: '手册', category: 'guide', content: '...' };
    knowledgeService.create.mockReturnValue({ id: 1 });
    knowledgeService.findAll.mockReturnValue({ items: [], total: 0 });
    knowledgeService.findOne.mockReturnValue({ id: 1 });
    knowledgeService.update.mockReturnValue({ id: 1 });
    knowledgeService.remove.mockResolvedValue(undefined);

    expect(controller.create(dto as any)).toEqual({ id: 1 });
    expect(controller.findAll({ q: '手册' } as any)).toEqual({ items: [], total: 0 });
    expect(controller.findOne(1)).toEqual({ id: 1 });
    expect(controller.update(1, { title: '改' } as any)).toEqual({ id: 1 });
    await expect(controller.remove(1)).resolves.toBeNull();

    expect(knowledgeService.create).toHaveBeenCalledWith(dto);
    expect(knowledgeService.findAll).toHaveBeenCalledWith({ q: '手册' });
    expect(knowledgeService.findOne).toHaveBeenCalledWith(1);
    expect(knowledgeService.update).toHaveBeenCalledWith(1, { title: '改' });
    expect(knowledgeService.remove).toHaveBeenCalledWith(1);
  });

  it('文档上传委托 service', async () => {
    knowledgeService.createDocument.mockResolvedValue({ id: 1, chunks: 3 });
    const file = { buffer: Buffer.from('%PDF-1.4'), originalname: 'doc.pdf', mimetype: 'application/pdf' } as Express.Multer.File;
    await expect(controller.upload(file, { title: '文档', category: 'manual' } as any)).resolves.toEqual({ id: 1, chunks: 3 });
    expect(knowledgeService.createDocument).toHaveBeenCalledWith({
      buffer: file.buffer,
      originalName: 'doc.pdf',
      mimetype: 'application/pdf',
      title: '文档',
      category: 'manual',
    });
  });

  it('上传无文件/非法扩展名抛 BadRequest', async () => {
    await expect(controller.upload(undefined as never, { title: 'x' } as any)).rejects.toThrow(BadRequestException);
    const file = { buffer: Buffer.from('x'), originalname: 'evil.exe', mimetype: 'application/x-msdownload' } as Express.Multer.File;
    await expect(controller.upload(file, { title: 'x' } as any)).rejects.toThrow(BadRequestException);
    expect(knowledgeService.createDocument).not.toHaveBeenCalled();
  });

  it('统计/切块/调试委托 service', () => {
    knowledgeService.getStats.mockReturnValue({ entries: 1 });
    knowledgeService.getChunks.mockReturnValue([]);
    knowledgeService.debugSearch.mockReturnValue({ results: [] });

    expect(controller.getStats()).toEqual({ entries: 1 });
    expect(controller.getChunks(1)).toEqual([]);
    expect(controller.debugSearch({ query: '手册', limit: 5 })).toEqual({ results: [] });
    expect(knowledgeService.debugSearch).toHaveBeenCalledWith('手册', 5);
  });

  it('调试查询为空抛 BadRequest', () => {
    expect(() => controller.debugSearch({ query: '   ' })).toThrow(BadRequestException);
    expect(knowledgeService.debugSearch).not.toHaveBeenCalled();
  });

  it('调试 limit 超上限被钳制到 20', () => {
    knowledgeService.debugSearch.mockReturnValue({ results: [] });
    controller.debugSearch({ query: '手册', limit: 99 });
    expect(knowledgeService.debugSearch).toHaveBeenCalledWith('手册', 20);
  });

  it('multer fileFilter：PDF/DOCX mimetype 放行，其余拒绝', () => {
    const fileFilter = getFileFilter();
    const cb = jest.fn();

    fileFilter(null, { mimetype: 'application/pdf' }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);

    fileFilter(null, { mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);

    cb.mockClear();
    fileFilter(null, { mimetype: 'text/plain' }, cb);
    expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
  });

  it('所有端点声明 manage:all 策略', () => {
    const ability = { can: jest.fn((a: string, r: string) => a === 'manage' && r === 'all') };
    const proto = KnowledgeController.prototype as any;
    let count = 0;
    for (const method of Object.getOwnPropertyNames(proto)) {
      if (method === 'constructor') continue;
      const handlers = Reflect.getMetadata(CHECK_POLICIES_KEY, proto[method]);
      if (!handlers) continue;
      count++;
      for (const h of handlers) expect(h(ability)).toBe(true);
    }
    expect(count).toBe(9);
  });
});
