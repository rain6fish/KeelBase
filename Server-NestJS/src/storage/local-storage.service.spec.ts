import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { LocalStorageService, LOCAL_UPLOAD_DIR } from './local-storage.service';

describe('LocalStorageService', () => {
  let service: LocalStorageService;

  beforeAll(async () => {
    service = new LocalStorageService();
    await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  });

  afterAll(async () => {
    // 清理测试写入的文件
    const files = await fs.readdir(LOCAL_UPLOAD_DIR);
    for (const f of files) {
      if (f.startsWith('test-local-')) {
        await fs.unlink(join(LOCAL_UPLOAD_DIR, f)).catch(() => undefined);
      }
    }
  });

  it('save writes file and returns /uploads/ URL', async () => {
    const url = await service.save(Buffer.from('hello'), 'test-local-x.jpg', 'image/jpeg');

    expect(url).toMatch(/^\/uploads\/\d+-\d+\.jpg$/);
    const filename = url.split('/').pop()!;
    const content = await fs.readFile(join(LOCAL_UPLOAD_DIR, filename));
    expect(content.toString()).toBe('hello');
  });

  it('delete removes the file', async () => {
    const url = await service.save(Buffer.from('bye'), 'test-local-y.png', 'image/png');
    const filename = url.split('/').pop()!;
    const path = join(LOCAL_UPLOAD_DIR, filename);

    expect(await fs.readFile(path)).toBeDefined();

    await service.delete(url);

    await expect(fs.readFile(path)).rejects.toThrow();
  });

  it('delete swallows missing file errors', async () => {
    await expect(service.delete('/uploads/nonexistent.png')).resolves.toBeUndefined();
  });

  it('checkHealth：目录可访问返回 up（A8）', async () => {
    await expect(service.checkHealth()).resolves.toBe('up');
  });
});
