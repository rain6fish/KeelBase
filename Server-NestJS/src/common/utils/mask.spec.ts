// SPDX-License-Identifier: Apache-2.0

import { maskEmail, maskPhone, maskText, redactSensitive, registerSensitiveKeys } from './mask';

describe('mask utils', () => {
  describe('maskEmail', () => {
    it('masks only the local part, keeps the domain', () => {
      expect(maskEmail('alice@example.com')).toBe('a***@example.com');
    });

    it('keeps first char of local part', () => {
      expect(maskEmail('admin@example.com')).toBe('a***@example.com');
    });

    it('handles email without @', () => {
      expect(maskEmail('not-an-email')).toBe('***');
    });
  });

  describe('maskPhone', () => {
    it('keeps first 3 and last 4 digits', () => {
      expect(maskPhone('13800138000')).toBe('138****8000');
    });

    it('strips non-digit separators but keeps all leading digits', () => {
      expect(maskPhone('+86 138-0013-8000')).toBe('861****8000');
    });

    it('short numbers fully masked', () => {
      expect(maskPhone('12345')).toBe('***');
    });
  });

  describe('maskText', () => {
    it('masks short text', () => {
      expect(maskText('张')).toBe('*');
      expect(maskText('Alex')).toBe('Al**');
    });
  });

  describe('redactSensitive', () => {
    it('redacts password and token values', () => {
      const json = JSON.stringify({ username: 'alex', password: 'Secret123', token: 'abc' });
      const out = redactSensitive(json);
      expect(out).toContain('"password":"***"');
      expect(out).toContain('"token":"***"');
      expect(out).toContain('"username":"alex"');
    });

    it('returns original on invalid JSON', () => {
      expect(redactSensitive('not-json')).toBe('not-json');
    });
  });

  // 模块声明的额外键名（协议 pii → registerSensitiveKeys）。键名由模块提供，
  // 故这里专门盯住「元字符」与「$ 引用」两类会因键名不可信而出错的地方。
  describe('registerSensitiveKeys', () => {
    it('模块声明的键名参与打码（内建清单不认识这些名字）', () => {
      registerSensitiveKeys(['idCardNoPiiTest']);
      expect(redactSensitive('{"idCardNoPiiTest":"110101199001011234"}')).toBe(
        '{"idCardNoPiiTest":"***"}',
      );
    });

    it('含正则元字符的键名被转义 —— 不得放大匹配', () => {
      registerSensitiveKeys(['a.bPiiTest']);
      expect(redactSensitive('{"a.bPiiTest":"secret"}')).toBe('{"a.bPiiTest":"***"}');
      // 未转义时 `.` 会匹配任意字符，这一行会被误打码
      expect(redactSensitive('{"axbPiiTest":"keep"}')).toBe('{"axbPiiTest":"keep"}');
    });

    it('键名含 $ 时替换串不被当成引用（改用 replacer 函数）', () => {
      registerSensitiveKeys(['pr$icePiiTest']);
      expect(redactSensitive('{"pr$icePiiTest":"9.99"}')).toBe('{"pr$icePiiTest":"***"}');
    });

    it('忽略空串与非字符串，不抛错', () => {
      expect(() => registerSensitiveKeys(['', undefined as unknown as string])).not.toThrow();
    });
  });
});
