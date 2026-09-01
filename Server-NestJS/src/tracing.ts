// SPDX-License-Identifier: Apache-2.0

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { IncomingMessage } from 'http';

/**
 * OpenTelemetry 初始化。必须在 NestFactory.create 之前调用。
 *
 * 通过 OTEL_ENABLED=true 开启；endpoint 走标准环境变量
 * OTEL_EXPORTER_OTLP_ENDPOINT（默认 http://localhost:4318）。
 * 自动插桩覆盖 HTTP/Express 请求层。
 *
 * 注意：OTel 故障不应拖垮应用，初始化失败仅告警。
 */
export function initTracing(): void {
  if (process.env.OTEL_ENABLED !== 'true') {
    return;
  }

  try {
    const sdk = new NodeSDK({
      spanProcessors: [
        new BatchSpanProcessor(new OTLPTraceExporter()),
      ],
      instrumentations: [
        getNodeAutoInstrumentations({
          // 默认已含 http/express/pg/ioredis/pino/nestjs-core 等
          '@opentelemetry/instrumentation-http': {
            ignoreIncomingRequestHook: (req: IncomingMessage) => {
              const url = req.url ?? '';
              return (
                url.startsWith('/api/v1/metrics') ||
                url.startsWith('/api/v1/health')
              );
            },
          },
        }),
      ],
    });

    sdk.start();
    console.warn(
      '[tracing] OpenTelemetry initialized, exporting to',
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
    );

    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => {
        sdk
          .shutdown()
          .catch(() => {})
          .finally(() => process.exit(0));
      });
    }
  } catch (err) {
    console.warn(
      '[tracing] OpenTelemetry init failed:',
      (err as Error).message,
    );
  }
}
