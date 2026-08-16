import { createLoggerOptions } from './logging';

describe('createLoggerOptions', () => {
  const values: Record<string, string> = {};
  const config = { get: jest.fn((key: string, def?: string) => values[key] ?? def) };

  afterEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(values)) delete values[k];
  });

  it('test 环境静默', () => {
    values['NODE_ENV'] = 'test';
    expect(createLoggerOptions(config as any)).toEqual({ pinoHttp: { level: 'silent' } });
  });

  it('development 且无 Loki：pino-pretty transport', () => {
    values['NODE_ENV'] = 'development';
    values['LOG_LEVEL'] = 'debug';
    const opts = createLoggerOptions(config as any) as any;
    expect(opts.pinoHttp.level).toBe('debug');
    expect(opts.pinoHttp.transport.target).toBe('pino-pretty');
  });

  it('生产且无 Loki：JSON 无 transport', () => {
    values['NODE_ENV'] = 'production';
    const opts = createLoggerOptions(config as any) as any;
    expect(opts.pinoHttp.level).toBe('info');
    expect(opts.pinoHttp.transport).toBeUndefined();
  });

  it('development 且 Loki 开启：pino-pretty + pino-loki 双 target', () => {
    values['NODE_ENV'] = 'development';
    values['LOKI_ENABLED'] = 'true';
    values['LOKI_URL'] = 'http://loki:3100';
    const opts = createLoggerOptions(config as any) as any;
    expect(opts.pinoHttp.transport.targets).toHaveLength(2);
    expect(opts.pinoHttp.transport.targets[0].target).toBe('pino-pretty');
    expect(opts.pinoHttp.transport.targets[1].target).toBe('pino-loki');
    expect(opts.pinoHttp.transport.targets[1].options.host).toBe('http://loki:3100');
    expect(opts.pinoHttp.transport.targets[1].options.labels.env).toBe('development');
  });

  it('生产且 Loki 开启：仅 pino-loki target', () => {
    values['NODE_ENV'] = 'production';
    values['LOKI_ENABLED'] = 'true';
    const opts = createLoggerOptions(config as any) as any;
    expect(opts.pinoHttp.transport.targets).toHaveLength(1);
    expect(opts.pinoHttp.transport.targets[0].target).toBe('pino-loki');
  });
});
