import { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import { trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * TypeORM 查询追踪 logger（O.1 数据库层 span）。
 *
 * better-sqlite3 无官方 instrumentation，通过替换 TypeORM logger 为每次
 * 查询生成 span（query → 当前请求上下文中），异常置 ERROR。OTEL_ENABLED=false
 * 时 trace API 为 no-op，无开销。仅记录 SQL 摘要与耗时，不落参数值。
 */
const TRACER = trace.getTracer('front-server-db');

export class TracingTypeOrmLogger implements TypeOrmLogger {
  logQuery(query: string, parameters?: unknown[]): void {
    this._span(query, parameters, undefined);
  }

  logQueryError(error: string | Error, query: string, parameters?: unknown[]): void {
    this._span(query, parameters, error);
  }

  logQuerySlow(time: number, query: string, parameters?: unknown[]): void {
    this._span(query, parameters, undefined, { 'db.slow_ms': time });
  }

  logSchemaBuild(message: string): void {
    this._span(message, undefined, undefined, { 'db.schema': true });
  }

  logMigration(message: string): void {
    this._span(message, undefined, undefined, { 'db.migration': true });
  }

  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    // 普通日志不生成 span，避免噪音
    void level;
    void message;
  }

  private _span(
    query: string,
    parameters?: unknown[],
    error?: string | Error,
    extra: Record<string, string | number | boolean> = {},
  ): void {
    const span = TRACER.startSpan('db.query', {
      attributes: {
        'db.system': 'sql',
        'db.statement': this._sanitize(query),
        ...(parameters && parameters.length > 0 ? { 'db.params_count': parameters.length } : {}),
        ...extra,
      },
    });
    if (error) {
      span.recordException(error instanceof Error ? error : new Error(error));
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    span.end();
  }

  /** 截断 + 压平多行 SQL，便于展示 */
  private _sanitize(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim().slice(0, 500);
  }
}

/** 供 app.module 按需注入：仅 OTEL 启用时才用追踪 logger，否则交给 TypeORM 默认 */
export function createTypeOrmLogger(otelEnabled: boolean): TypeOrmLogger | undefined {
  return otelEnabled ? new TracingTypeOrmLogger() : undefined;
}
