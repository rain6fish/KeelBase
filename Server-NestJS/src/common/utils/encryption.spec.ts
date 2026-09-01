// SPDX-License-Identifier: Apache-2.0

import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { EncryptionService } from './encryption';

const KEY = 'e640ea00aa5e1e0425b174fdbd2c56cd07c56b7f12daa57a6180bce226bcb1c4';
const HMAC_KEY = 'c6c1385a82395cafcfc856f775e1fb54efd985aa628869e2652d86f500b84bfd';

function makeService(overrides: Record<string, any> = {}): EncryptionService {
  const mockConfig = {
    get: jest.fn((key: string, def?: any) => {
      const map = {
        ENCRYPTION_KEY: KEY,
        ENCRYPTION_HMAC_KEY: HMAC_KEY,
        ...overrides,
      };
      return map[key] ?? def;
    }),
  };
  return new EncryptionService(mockConfig as unknown as ConfigService);
}

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    service = makeService();
  });

  describe('encrypt / decrypt', () => {
    it('round-trips plaintext', () => {
      const plain = '+8613800138000';
      const enc = service.encrypt(plain);
      expect(enc).not.toBe(plain);
      expect(service.decrypt(enc)).toBe(plain);
    });

    it('produces different ciphertext for same plaintext (random IV)', () => {
      const enc1 = service.encrypt('same-value');
      const enc2 = service.encrypt('same-value');
      expect(enc1).not.toBe(enc2);
      expect(service.decrypt(enc1)).toBe('same-value');
      expect(service.decrypt(enc2)).toBe('same-value');
    });

    it('throws on tampered payload', () => {
      const enc = service.encrypt('secret');
      const [iv, tag, data] = enc.split(':');
      const tampered = `${iv}:${tag}:${Buffer.from('AAAA').toString('base64')}`;
      expect(() => service.decrypt(tampered)).toThrow(BadRequestException);
    });
  });

  describe('hmac', () => {
    it('is deterministic', () => {
      expect(service.hmac('provider-abc')).toBe(service.hmac('provider-abc'));
    });

    it('differs for different inputs', () => {
      expect(service.hmac('a')).not.toBe(service.hmac('b'));
    });
  });

  describe('config validation', () => {
    it('throws if ENCRYPTION_KEY is invalid length', () => {
      expect(() => makeService({ ENCRYPTION_KEY: 'short' })).toThrow(/ENCRYPTION_KEY/);
    });
  });
});
