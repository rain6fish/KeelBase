// SPDX-License-Identifier: Apache-2.0

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

  describe('normalizeForStorage（CR-21 stage C 入库归一化）', () => {
    it('剥掉相对路径上的 query（含上传时冻结的 e/s 签名）', () => {
      expect(service.normalizeForStorage('/uploads/a.jpg?e=100&s=abc')).toBe('/uploads/a.jpg');
    });

    it('无 query 的裸引用原样返回（幂等）', () => {
      expect(service.normalizeForStorage('/uploads/a.jpg')).toBe('/uploads/a.jpg');
    });

    it('绝对 URL 原样返回，不剥 query（S3 公网 / 预签名）', () => {
      expect(service.normalizeForStorage('https://cdn.example.com/x.jpg?X-Amz-Signature=deadbeef')).toBe(
        'https://cdn.example.com/x.jpg?X-Amz-Signature=deadbeef',
      );
      expect(service.normalizeForStorage('https://cdn.example.com/x.jpg')).toBe('https://cdn.example.com/x.jpg');
    });

    it('空值与相对非 /uploads 路径原样返回', () => {
      expect(service.normalizeForStorage('')).toBe('');
      expect(service.normalizeForStorage('a.jpg?e=1')).toBe('a.jpg?e=1'); // 非以 / 开头 → 原样
    });
  });

  // Stage C 的可证伪读法：旧行为（签名串随行入库）过期即坏；新行为（入库剥裸引用、读侧重签）恒新鲜。
  // Falsifiable reading for stage C: the old behaviour (signed string persisted with the row) breaks on
  // expiry; the new behaviour (bare ref persisted, re-signed on read) is always fresh.
  describe('CR-21 stage C 回归：冻结签名 vs 入库归一化后重签', () => {
    it('旧行为：读侧对「已带签名的串」原样返回 ⇒ 过期后 verify=false（坏的，可证伪）', () => {
      const atUpload = service.signUrl('/uploads/avatar.jpg', -1); // 上传时签的、TTL 已过
      expect(atUpload).toContain('?e=');
      // 读侧（旧）：signUrl 见到 '?' 就原样返回 —— 仍是那串过期签名，重取记录也没用
      expect(service.signUrl(atUpload)).toBe(atUpload);
      const [, q] = atUpload.split('?');
      const params = new URLSearchParams(q);
      expect(service.verify('/uploads/avatar.jpg', params.get('e')!, params.get('s')!)).toBe(false);
    });

    it('新行为：入库剥成裸引用、读侧重签 ⇒ verify=true（且签名不是上传时那串）', () => {
      const atUpload = service.signUrl('/uploads/avatar.jpg', -1); // 上传时签的、已过期
      const stored = service.normalizeForStorage(atUpload); // 入库：剥成裸引用
      expect(stored).toBe('/uploads/avatar.jpg');
      const onRead = service.signUrl(stored); // 读侧：此时才重签
      expect(onRead).not.toBe(atUpload); // 不是上传时冻结的那串
      const [, q] = onRead.split('?');
      const params = new URLSearchParams(q);
      expect(service.verify('/uploads/avatar.jpg', params.get('e')!, params.get('s')!)).toBe(true);
    });
  });
});
