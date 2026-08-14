import { ConfigService } from '@nestjs/config';
import { Params } from 'nestjs-pino';
import pino from 'pino';

/**
 * 生成 pino 配置，供 AppModule 与 TestAppModule 复用。
 *
 * - test: 静默（e2e 测试不刷日志）
 * - development: pino-pretty 彩色可读输出
 * - 其他环境: 原生 JSON 到 stdout（12-factor，由 Docker/日志收集器处理）
 *
 * LOKI_ENABLED=true 时追加 pino-loki transport，把 JSON 日志直推 Loki
 * （本地宿主机与 Docker 容器均覆盖）。dev 环境保留 pino-pretty + Loki 并存。
 */
export function createLoggerOptions(configService: ConfigService): Params {
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  if (nodeEnv === 'test') {
    return { pinoHttp: { level: 'silent' } };
  }

  const isDev = nodeEnv === 'development';
  const level = configService.get<string>('LOG_LEVEL', 'info');
  const lokiEnabled = configService.get<string>('LOKI_ENABLED', 'false') === 'true';
  const lokiUrl = configService.get<string>('LOKI_URL', 'http://localhost:3100');

  if (!lokiEnabled) {
    return {
      pinoHttp: {
        level,
        transport: isDev
          ? {
              target: 'pino-pretty',
              options: { singleLine: true, colorize: true },
            }
          : undefined,
      },
    };
  }

  const targets: pino.TransportTargetOptions[] = isDev
    ? [
        {
          target: 'pino-pretty',
          options: { singleLine: true, colorize: true },
          level,
        },
      ]
    : [];

  targets.push({
    target: 'pino-loki',
    options: {
      host: lokiUrl,
      labels: { app: 'keelbase-server', env: nodeEnv },
      batching: true,
      interval: 5,
      timeout: 30000,
      sync: false,
    },
    level,
  });

  return {
    pinoHttp: {
      level,
      transport: {
        targets,
        dedupe: true,
      },
    },
  };
}
