// SPDX-License-Identifier: Apache-2.0

import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;
  let mockConfig: { get: jest.Mock };

  const setup = (values: Record<string, any>) => {
    mockConfig = {
      get: jest.fn((key: string, def?: any) => values[key] ?? def),
    };
    service = new EmbeddingsService(mockConfig as unknown as ConfigService);
  };

  const fullConfig = {
    VECTOR_SEARCH_ENABLED: true,
    EMBEDDING_BASE_URL: 'https://api.openai.com/v1',
    EMBEDDING_API_KEY: 'sk-test',
    EMBEDDING_MODEL: 'text-embedding-3-small',
  };

  describe('isAvailable', () => {
    it('returns true when all conditions met', () => {
      setup(fullConfig);
      expect(service.isAvailable('postgres')).toBe(true);
    });

    it('returns false when switch disabled', () => {
      setup({ ...fullConfig, VECTOR_SEARCH_ENABLED: false });
      expect(service.isAvailable('postgres')).toBe(false);
    });

    it('returns false when not postgres', () => {
      setup(fullConfig);
      expect(service.isAvailable('sqlite')).toBe(false);
      expect(service.isAvailable(undefined)).toBe(false);
    });

    it('returns false when API key missing', () => {
      setup({ ...fullConfig, EMBEDDING_API_KEY: '' });
      expect(service.isAvailable('postgres')).toBe(false);
    });

    it('returns false when base URL missing', () => {
      setup({ ...fullConfig, EMBEDDING_BASE_URL: '' });
      expect(service.isAvailable('postgres')).toBe(false);
    });
  });

  describe('embed', () => {
    it('calls embeddings API and returns vector', async () => {
      setup(fullConfig);
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
      });
      (global as any).fetch = mockFetch;

      const vector = await service.embed('休假政策');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
          body: expect.stringContaining('text-embedding-3-small'),
        }),
      );
      expect(vector).toEqual([0.1, 0.2, 0.3]);
    });

    it('strips trailing slash from base URL', async () => {
      setup({ ...fullConfig, EMBEDDING_BASE_URL: 'https://x.com/v1/' });
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1] }] }),
      });
      (global as any).fetch = mockFetch;

      await service.embed('test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://x.com/v1/embeddings',
        expect.anything(),
      );
    });

    it('throws on non-ok response', async () => {
      setup(fullConfig);
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'unauthorized',
      });

      await expect(service.embed('test')).rejects.toThrow('401');
    });

    it('throws when embedding missing from response', async () => {
      setup(fullConfig);
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await expect(service.embed('test')).rejects.toThrow('missing');
    });
  });

  describe('POV-1 私有化（Ollama 本地）', () => {
    it('isAvailable 仅需 OLLAMA_BASE_URL 即可用（数据不出域）', () => {
      setup({ ...fullConfig, OLLAMA_BASE_URL: 'http://localhost:11434' });
      expect(service.isAvailable('postgres')).toBe(true);
    });

    it('embed 走本地 /v1/embeddings 无真实 key', async () => {
      setup({ ...fullConfig, OLLAMA_BASE_URL: 'http://localhost:11434', OLLAMA_EMBED_MODEL: 'bge-m3' });
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.9] }] }),
      });
      (global as any).fetch = mockFetch;

      const vector = await service.embed('你好');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/embeddings',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer ollama' }),
          body: expect.stringContaining('bge-m3'),
        }),
      );
      expect(vector).toEqual([0.9]);
    });
  });
});
