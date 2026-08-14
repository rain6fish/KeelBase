import { Injectable, OnModuleInit } from '@nestjs/common';
import client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly httpRequestsTotal: client.Counter<'method' | 'route' | 'status'>;
  readonly httpRequestDurationSeconds: client.Histogram<
    'method' | 'route' | 'status'
  >;
  readonly httpRequestsInFlight: client.Gauge<'method' | 'route'>;

  constructor() {
    this.httpRequestsTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
    });

    this.httpRequestDurationSeconds = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    this.httpRequestsInFlight = new client.Gauge({
      name: 'http_requests_in_flight',
      help: 'Number of HTTP requests currently being handled',
      labelNames: ['method', 'route'],
    });
  }

  onModuleInit(): void {
    client.collectDefaultMetrics();
  }

  async getMetrics(): Promise<string> {
    return client.register.metrics();
  }
}
