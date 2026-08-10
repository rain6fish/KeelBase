import { OpenAICompatibleProvider } from './openai-compatible.provider';
import { LlmProviderConfig } from '../interfaces/provider-config.interface';
import { GenerateParams, StreamChunk } from '../interfaces/llm-provider.interface';
import { CircuitBreakerService } from '../../circuit-breaker/circuit-breaker.service';

describe('OpenAICompatibleProvider', () => {
  const config: LlmProviderConfig = {
    name: 'deepseek',
    displayName: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    apiKey: 'test-key',
    defaultModel: 'deepseek-v4-flash',
    availableModels: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    maxTokens: 4096,
    temperature: 0.7,
  };

  let provider: OpenAICompatibleProvider;
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    provider = new OpenAICompatibleProvider(config);
    mockFetch = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  describe('constructor', () => {
    it('should set name from config', () => {
      expect(provider.name).toBe('deepseek');
    });

    it('should set displayName from config', () => {
      expect(provider.displayName).toBe('DeepSeek');
    });

    it('should set availableModels from config', () => {
      expect(provider.availableModels).toEqual(config.availableModels);
    });

    it('should be OpenAI compatible', () => {
      expect(provider.isOpenAICompatible()).toBe(true);
    });
  });

  describe('generate()', () => {
    const params: GenerateParams = {
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ],
    };

    it('should make a POST request to the correct endpoint', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Hi there!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 20, completion_tokens: 10 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await provider.generate(params);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.deepseek.com/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
        }),
      );
    });

    it('should return content from the API response', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Hi there!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 20, completion_tokens: 10 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await provider.generate(params);
      expect(result.content).toBe('Hi there!');
      expect(result.usage?.promptTokens).toBe(20);
      expect(result.usage?.completionTokens).toBe(10);
    });

    it('should return tool calls when present in response', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: {
                        name: 'query_events',
                        arguments: '{"startDate":"2026-07-01"}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: { prompt_tokens: 30, completion_tokens: 15 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await provider.generate(params);
      expect(result.content).toBe('');
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('query_events');
      expect(result.toolCalls![0].arguments).toBe(
        '{"startDate":"2026-07-01"}',
      );
    });

    it('should include tools in request body when provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const paramsWithTools: GenerateParams = {
        ...params,
        tools: [
          {
            type: 'function',
            function: {
              name: 'query_events',
              description: '查询事件',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
      };

      await provider.generate(paramsWithTools);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.tools).toBeDefined();
      expect(requestBody.tools).toHaveLength(1);
      expect(requestBody.tools[0].function.name).toBe('query_events');
    });

    it('should include model, max_tokens and temperature in request body', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await provider.generate({
        ...params,
        model: 'deepseek-v4-flash',
        maxTokens: 2048,
        temperature: 0.5,
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.model).toBe('deepseek-v4-flash');
      expect(requestBody.max_tokens).toBe(2048);
      expect(requestBody.temperature).toBe(0.5);
    });

    it('should use default model from config when not specified', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await provider.generate(params);
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.model).toBe('deepseek-v4-flash');
    });

    it('should throw when API returns non-200 status', async () => {
      mockFetch.mockResolvedValue(
        new Response('Rate limit exceeded', {
          status: 429,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

      await expect(provider.generate(params)).rejects.toThrow(
        'LLM API error: 429 Rate limit exceeded',
      );
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(provider.generate(params)).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('stream()', () => {
    const params: GenerateParams = {
      messages: [{ role: 'user', content: 'Hello' }],
    };

    it('should yield text chunks from SSE stream', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"content":""},"finish_reason":"stop"}]}',
        'data: [DONE]',
      ].join('\n');

      mockFetch.mockResolvedValue(
        new Response(sseData, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.stream(params)) {
        chunks.push(chunk);
      }

      // Third event has empty content, which should be skipped
      expect(chunks).toHaveLength(3);
      expect(chunks[0].type).toBe('text');
      expect(chunks[0].content).toBe('Hello');
      expect(chunks[1].type).toBe('text');
      expect(chunks[1].content).toBe(' world');
      expect(chunks[2].type).toBe('done');
    });

    it('should yield tool_call chunk from SSE stream', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"query_events","arguments":"{\\"startDate\\""}}}]},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"":\\"2026-07-01\\"}"}}]},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
        'data: [DONE]',
      ].join('\n');

      mockFetch.mockResolvedValue(
        new Response(sseData, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.stream(params)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some((c) => c.type === 'done')).toBe(true);
    });

    it('should yield error when API returns non-200', async () => {
      mockFetch.mockResolvedValue(
        new Response('Unauthorized', {
          status: 401,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.stream(params)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].error).toBeDefined();
    });
  });

  describe('RG-1.1 熔断', () => {
    const params: GenerateParams = {
      messages: [{ role: 'user', content: 'hi' }],
    };

    function breakerMock(overrides: Record<string, jest.Mock> = {}) {
      return {
        fire: jest.fn(),
        isOpen: jest.fn().mockReturnValue(false),
        recordSuccess: jest.fn(),
        recordFailure: jest.fn(),
        ...overrides,
      } as unknown as CircuitBreakerService;
    }

    it('generate 成功时记录成功', async () => {
      const cb = breakerMock();
      cb.fire.mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn());
      const p = new OpenAICompatibleProvider(config, cb);

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await p.generate(params);
      expect(cb.fire).toHaveBeenCalledWith('llm:deepseek', expect.any(Function));
    });

    it('generate 抛错时经熔断传播', async () => {
      const cb = breakerMock();
      cb.fire.mockImplementation(async () => {
        throw new Error('upstream down');
      });
      const p = new OpenAICompatibleProvider(config, cb);

      await expect(p.generate(params)).rejects.toThrow('upstream down');
    });

    it('stream 熔断打开时直接返回 error chunk 不发请求', async () => {
      const cb = breakerMock();
      cb.isOpen.mockReturnValue(true);
      const p = new OpenAICompatibleProvider(config, cb);

      const chunks: StreamChunk[] = [];
      for await (const chunk of p.stream(params)) chunks.push(chunk);

      expect(chunks[0].type).toBe('error');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('stream 网络失败时记录熔断失败', async () => {
      const cb = breakerMock();
      const p = new OpenAICompatibleProvider(config, cb);
      mockFetch.mockRejectedValue(new Error('socket hang up'));

      const chunks: StreamChunk[] = [];
      for await (const chunk of p.stream(params)) chunks.push(chunk);

      expect(cb.recordFailure).toHaveBeenCalledWith('llm:deepseek');
      expect(chunks[0].type).toBe('error');
    });

    it('stream 成功时记录熔断成功', async () => {
      const cb = breakerMock();
      const p = new OpenAICompatibleProvider(config, cb);
      const encoder = new TextEncoder();
      mockFetch.mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );

      const chunks: StreamChunk[] = [];
      for await (const chunk of p.stream(params)) chunks.push(chunk);

      expect(cb.recordSuccess).toHaveBeenCalledWith('llm:deepseek');
      expect(chunks[chunks.length - 1].type).toBe('done');
    });
  });

  describe('AI-12 多模态', () => {
    it('带 images 的 user 消息转多模态 content 数组', async () => {
      const p = new OpenAICompatibleProvider(config);
      const sendParams = {
        messages: [
          { role: 'user', content: '这张图里是什么？', images: ['/uploads/a.png'] },
        ],
      };
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '一只猫' }, finish_reason: 'stop' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await p.generate(sendParams as any);

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      const content = body.messages[0].content;
      expect(Array.isArray(content)).toBe(true);
      expect(content[0]).toEqual({ type: 'text', text: '这张图里是什么？' });
      expect(content[1].type).toBe('image_url');
      // 相对路径被拼成完整 URL
      expect(content[1].image_url.url).toContain('/uploads/a.png');
    });

    it('无 images 的 user 消息保持纯文本 content', async () => {
      const p = new OpenAICompatibleProvider(config);
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await p.generate({ messages: [{ role: 'user', content: 'hi' }] } as any);

      const [, init] = mockFetch.mock.calls[0];
      expect(JSON.parse(init.body).messages[0].content).toBe('hi');
    });
  });
});
