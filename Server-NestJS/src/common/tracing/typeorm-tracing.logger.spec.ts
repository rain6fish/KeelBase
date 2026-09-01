// SPDX-License-Identifier: Apache-2.0

jest.mock('@opentelemetry/api', () => {
  const spans: any[] = [];
  const startSpan = jest.fn((name: string, options: any) => {
    const span = {
      options,
      recordException: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
    };
    spans.push(span);
    return span;
  });
  return {
    trace: { getTracer: () => ({ startSpan }) },
    SpanStatusCode: { ERROR: 2 },
    __spans: spans,
  };
});

import * as otelApi from '@opentelemetry/api';
import { TracingTypeOrmLogger, createTypeOrmLogger } from './typeorm-tracing.logger';

const spans = (otelApi as any).__spans as any[];

describe('TracingTypeOrmLogger', () => {
  let logger: TracingTypeOrmLogger;

  beforeEach(() => {
    spans.length = 0;
    logger = new TracingTypeOrmLogger();
  });

  function lastSpan() {
    return spans[spans.length - 1];
  }

  it('logQuery 生成 db.query span（无参数不写 params_count，SQL 压平）', () => {
    logger.logQuery('  SELECT *\n FROM users  ');
    expect(spans).toHaveLength(1);
    expect(spans[0].options.attributes['db.statement']).toBe('SELECT * FROM users');
    expect(spans[0].options.attributes['db.params_count']).toBeUndefined();
  });

  it('logQuery 带参数时记录 params_count', () => {
    logger.logQuery('SELECT * FROM users WHERE id = ?', [1, 2]);
    expect(lastSpan().options.attributes['db.params_count']).toBe(2);
  });

  it('logQueryError 记录异常并置 ERROR 状态（Error 实例）', () => {
    logger.logQueryError(new Error('boom'), 'SELECT 1');
    const span = lastSpan();
    expect(span.recordException).toHaveBeenCalledWith(expect.any(Error));
    expect(span.setStatus).toHaveBeenCalledWith({ code: 2 });
  });

  it('logQueryError 字符串错误也记录', () => {
    expect(() => logger.logQueryError('sql error', 'SELECT 1')).not.toThrow();
    const span = lastSpan();
    expect(span.recordException).toHaveBeenCalledWith(expect.any(Error));
    expect(span.setStatus).toHaveBeenCalled();
  });

  it('logQuerySlow 记录耗时属性', () => {
    logger.logQuerySlow(2500, 'SELECT 1');
    expect(lastSpan().options.attributes['db.slow_ms']).toBe(2500);
  });

  it('logSchemaBuild / logMigration 记录标记属性', () => {
    logger.logSchemaBuild('building');
    expect(lastSpan().options.attributes['db.schema']).toBe(true);
    logger.logMigration('running');
    expect(lastSpan().options.attributes['db.migration']).toBe(true);
  });

  it('log 普通日志不生成 span（no-op）', () => {
    expect(() => logger.log('warn', 'message')).not.toThrow();
    expect(spans).toHaveLength(0);
  });

  it('_sanitize 截断超长 SQL', () => {
    logger.logQuery('a'.repeat(1000));
    expect(lastSpan().options.attributes['db.statement']).toHaveLength(500);
  });

  it('createTypeOrmLogger：otelEnabled 决定是否返回实例', () => {
    expect(createTypeOrmLogger(false)).toBeUndefined();
    expect(createTypeOrmLogger(true)).toBeInstanceOf(TracingTypeOrmLogger);
  });
});
