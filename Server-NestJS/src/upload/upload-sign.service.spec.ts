import { UploadSignService } from './upload-sign.service';
import { EncryptionService } from '../common/utils/encryption';

describe('UploadSignService（CR-21 签名访问控制）', () => {
  let service: UploadSignService;
  let encryption: { hmac: jest.Mock };

  beforeEach(() => {
    encryption = { hmac: jest.fn((v: string) => `hmac:${v}`) };
    service = new UploadSignService(encryption as unknown as EncryptionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('signUrl', () => {
    it('给 /uploads 相对路径附 e+s query', () => {
      const url = service.signUrl('/uploads/a.jpg');
      expect(url).toMatch(/^\/uploads\/a\.jpg\?e=\d+&s=hmac:\/uploads\/a\.jpg:\d+$/);
    });

    it('S3 绝对 URL 原样返回', () => {
      expect(service.signUrl('https://cdn.example.com/bucket/x.jpg')).toBe('https://cdn.example.com/bucket/x.jpg');
    });

    it('已带 query 的 URL 原样返回（避免重复签名）', () => {
      const url = service.signUrl('/uploads/a.jpg?e=100&s=abc');
      expect(url).toBe('/uploads/a.jpg?e=100&s=abc');
    });

    it('空/非相对路径原样返回', () => {
      expect(service.signUrl('')).toBe('');
      expect(service.signUrl('a.jpg')).toBe('a.jpg');
    });

    it('自定义 TTL 反映在 expires', () => {
      const before = Math.floor(Date.now() / 1000);
      const url = service.signUrl('/uploads/x.png', 60);
      const m = url.match(/e=(\d+)/);
      expect(Number(m![1])).toBeGreaterThanOrEqual(before + 60 - 2);
      expect(Number(m![1])).toBeLessThanOrEqual(before + 60 + 2);
    });
  });

  describe('verify', () => {
    it('有效签名 + 未过期 → true', () => {
      const url = service.signUrl('/uploads/a.jpg');
      const [, q] = url.split('?');
      const e = new URLSearchParams(q).get('e')!;
      const s = new URLSearchParams(q).get('s')!;
      expect(service.verify('/uploads/a.jpg', e, s)).toBe(true);
    });

    it('e/s 缺失 → false', () => {
      expect(service.verify('/uploads/a.jpg')).toBe(false);
      expect(service.verify('/uploads/a.jpg', '123', undefined)).toBe(false);
      expect(service.verify('/uploads/a.jpg', undefined, 'abc')).toBe(false);
    });

    it('篡改签名 → false', () => {
      const url = service.signUrl('/uploads/a.jpg');
      const [, q] = url.split('?');
      const e = new URLSearchParams(q).get('e')!;
      expect(service.verify('/uploads/a.jpg', e, 'forged-sig')).toBe(false);
    });

    it('篡改路径 → false（防路径替换）', () => {
      const url = service.signUrl('/uploads/a.jpg');
      const [, q] = url.split('?');
      const e = new URLSearchParams(q).get('e')!;
      const s = new URLSearchParams(q).get('s')!;
      expect(service.verify('/uploads/b.jpg', e, s)).toBe(false);
    });

    it('过期 → false', () => {
      const url = service.signUrl('/uploads/a.jpg', -10); // 已过期 TTL
      const [, q] = url.split('?');
      const e = new URLSearchParams(q).get('e')!;
      const s = new URLSearchParams(q).get('s')!;
      expect(service.verify('/uploads/a.jpg', e, s)).toBe(false);
    });

    it('非数字 e → false', () => {
      expect(service.verify('/uploads/a.jpg', 'not-a-number', 'x')).toBe(false);
    });
  });
});
