// SPDX-License-Identifier: Apache-2.0

jest.mock('@opentelemetry/api', () => {
  const spans: any[] = [];
  const startActiveSpan = jest.fn((name: string, fn: (span: any) => unknown) => {
    const span = {
      setAttribute: jest.fn(),
      recordException: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
    };
    spans.push(span);
    return fn(span);
  });
  return {
    trace: { getTracer: () => ({ startActiveSpan }) },
    SpanStatusCode: { ERROR: 2 },
    __spans: spans,
  };
});

import * as otelApi from '@opentelemetry/api';
import { withSpan, withSpanSync } from './tracer';

const spans = (otelApi as any).__spans as any[];

describe('withSpan（OTel 业务 span 工具）', () => {
  beforeEach(() => { spans.length = 0; });

  it('异步成功：写入 attrs + 返回结果 + end', async () => {
    const result = await withSpan('ai.chat', async () => 'ok', { userId: '1', model: 'deepseek' });
    expect(result).toBe('ok');
    expect(spans).toHaveLength(1);
    const span = spans[0];
    expect(span.setAttribute).toHaveBeenCalledWith('userId', '1');
    expect(span.setAttribute).toHaveBeenCalledWith('model', 'deepseek');
    expect(span.end).toHaveBeenCalled();
  });

  it('异步抛错：记录异常置 ERROR 并重抛', async () => {
    await expect(
      withSpan('ai.chat', async () => { throw new Error('boom'); }, { userId: '1' }),
    ).rejects.toThrow('boom');
    const span = spans[0];
    expect(span.recordException).toHaveBeenCalledWith(expect.any(Error));
    expect(span.setStatus).toHaveBeenCalledWith({ code: 2 });
    expect(span.end).toHaveBeenCalled();
  });

  it('attrs 里 undefined 值不写入', async () => {
    await withSpan('x', async () => undefined, { a: '1', b: undefined });
    expect(spans[0].setAttribute).toHaveBeenCalledWith('a', '1');
    expect(spans[0].setAttribute).not.toHaveBeenCalledWith('b', undefined);
  });

  it('同步成功：返回结果 + end', () => {
    const result = withSpanSync('db.query', () => 42);
    expect(result).toBe(42);
    expect(spans[0].end).toHaveBeenCalled();
  });

  it('同步抛错：记录异常置 ERROR 并重抛', () => {
    expect(() => withSpanSync('x', () => { throw new Error('sync-boom'); })).toThrow('sync-boom');
    expect(spans[0].setStatus).toHaveBeenCalledWith({ code: 2 });
  });
});
