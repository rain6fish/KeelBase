import { trace, SpanStatusCode, Span } from '@opentelemetry/api';

/**
 * 业务自定义 span 工具（O.1 OTel 深度插桩）。
 *
 * 用 withSpan 包住关键业务操作（AI 对话、通知、知识检索、图片处理等），
 * 生成的 span 自动挂在当前请求上下文中（HTTP 请求 span → 业务 span → DB span）。
 * OTEL_ENABLED=false 时 trace 为 no-op，零开销。
 */
export const tracer = trace.getTracer('front-server');

export type SpanAttrs = Record<string, string | number | boolean | undefined>;

/**
 * 异步 span 包装。attrs 在 span 创建时写入；异常记录并置 ERROR 状态后重新抛出。
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attrs?: SpanAttrs,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span: Span) => {
    try {
      if (attrs) setAttrs(span, attrs);
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}

/** 同步 span 包装。 */
export function withSpanSync<T>(name: string, fn: () => T, attrs?: SpanAttrs): T {
  return tracer.startActiveSpan(name, (span: Span) => {
    try {
      if (attrs) setAttrs(span, attrs);
      return fn();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}

function setAttrs(span: Span, attrs: SpanAttrs): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) span.setAttribute(k, v);
  }
}
