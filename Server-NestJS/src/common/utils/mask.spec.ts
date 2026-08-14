import { maskEmail, maskPhone, maskText, redactSensitive } from './mask';

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
});
