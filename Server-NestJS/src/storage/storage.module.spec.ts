// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageModule } from './storage.module';
import { STORAGE_SERVICE } from './storage.service';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';

describe('StorageModule', () => {
  function mockConfig(driver: string) {
    return {
      get: jest.fn((key: string, def?: any) => (key === 'STORAGE_DRIVER' ? driver : def)),
      getOrThrow: jest.fn((key: string) => {
        const secrets: Record<string, string> = {
          S3_BUCKET: 'b',
          S3_ACCESS_KEY: 'a',
          S3_SECRET_KEY: 's',
        };
        if (!secrets[key]) throw new Error(`Missing ${key}`);
        return secrets[key];
      }),
    } as unknown as ConfigService;
  }

  async function buildModule(driver: string) {
    const testingModule: TestingModule = await Test.createTestingModule({
      imports: [StorageModule],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfig(driver))
      .compile();
    return testingModule;
  }

  it('provides LocalStorageService when driver=local', async () => {
    const module = await buildModule('local');

    const svc = module.get(STORAGE_SERVICE);
    expect(svc).toBeInstanceOf(LocalStorageService);
  });

  it('provides S3StorageService when driver=s3', async () => {
    const module = await buildModule('s3');

    const svc = module.get(STORAGE_SERVICE);
    expect(svc).toBeInstanceOf(S3StorageService);
  });
});
