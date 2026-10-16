// SPDX-License-Identifier: Apache-2.0

// CR-21 integration proof: a private bucket, reached only through a time-limited
// presigned GET URL produced by the real S3StorageService.
//
// MinIO could not be started on this machine (the image mirror is unavailable and
// the MinIO binary host returns 410), so this test stands in a minimal S3-compatible
// bucket over a real HTTP socket. The bucket enforces the two properties that make a
// presigned URL safe — (1) the SigV4 signature matches the secret, (2) the link has
// not expired — and otherwise streams the stored object. It is an independent
// implementation of the AWS SigV4 rules, so a URL produced by the AWS SDK validating
// against it is meaningful evidence, not a self-referential echo.
//
// CR-21 集成取证：私有 bucket，只经真实 S3StorageService 产出的**有时效 presigned GET URL** 取用。
//
// 本机起不了 MinIO（镜像站不可用、MinIO 二进制站点返回 410），故此测试用一个最小 S3 兼容
// bucket（真实 HTTP socket）代替。该 bucket 强制 presigned URL 安全所依赖的两点——① SigV4
// 签名与密钥相符、② 链接未过期——其余情况原样送出对象。它是 AWS SigV4 规则的**独立实现**，
// 故「AWS SDK 产出的 URL 能在它上面通过」是有意义的证据，而非自证。

import { createServer, Server, IncomingMessage } from 'http';
import { createHash, createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { S3StorageService } from './s3-storage.service';

const ACCESS_KEY = 'test-access';
const SECRET_KEY = 'test-secret';
const BUCKET = 'test-bucket';
const REGION = 'us-east-1';

/** hex(sha256(x)) */
const sha256 = (x: string) => createHash('sha256').update(x).digest('hex');
const hmac = (key: Buffer | string, x: string) => createHmac('sha256', key).update(x).digest();

/** AWS SigV4 presigned-GET signature, recomputed from scratch. */
function expectedSignature(req: IncomingMessage, host: string): string {
  const raw = (req.url || '').split('?')[1] || '';
  const pairs = raw
    .split('&')
    .filter((p) => p && !p.startsWith('X-Amz-Signature='))
    .map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)] as [string, string];
    })
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  const canonicalQuery = pairs.map(([k, v]) => `${k}=${v}`).join('&');
  const path = (req.url || '').split('?')[0];
  const amzDate = pairs.find(([k]) => k === 'X-Amz-Date')?.[1] || '';
  const credential = pairs.find(([k]) => k === 'X-Amz-Credential')?.[1] || '';
  const scope = decodeURIComponent(credential).split('/').slice(1).join('/');

  const canonicalRequest = [
    'GET',
    path,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

  const date = amzDate.slice(0, 8);
  const kDate = hmac(`AWS4${SECRET_KEY}`, date);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  return createHmac('sha256', kSigning).update(stringToSign).digest('hex');
}

/** True when the presigned link is past X-Amz-Date + X-Amz-Expires. */
function isExpired(req: IncomingMessage): boolean {
  const raw = (req.url || '').split('?')[1] || '';
  const get = (name: string) => new URLSearchParams(raw).get(name);
  const amzDate = get('X-Amz-Date');
  const expires = Number(get('X-Amz-Expires'));
  if (!amzDate || !Number.isFinite(expires)) return true;
  const m = amzDate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return true;
  const signedAt = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000;
  return Date.now() / 1000 > signedAt + expires;
}

describe('S3StorageService presigned GET (MinIO-stand-in bucket)', () => {
  const objects = new Map<string, Buffer>();
  let server: Server;
  let base: string;

  const keyOf = (req: IncomingMessage) =>
    decodeURIComponent((req.url || '').split('?')[0].replace(`/${BUCKET}/`, ''));

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res) => {
      const host = req.headers.host || '';
      if (req.method === 'PUT') {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          objects.set(keyOf(req), Buffer.concat(chunks));
          res.writeHead(200);
          res.end();
        });
        return;
      }
      if (req.method === 'GET') {
        if (isExpired(req)) {
          res.writeHead(403);
          return res.end('AccessDenied: expired');
        }
        const provided = new URLSearchParams((req.url || '').split('?')[1] || '').get('X-Amz-Signature');
        if (provided !== expectedSignature(req, host)) {
          res.writeHead(403);
          return res.end('SignatureDoesNotMatch');
        }
        const body = objects.get(keyOf(req));
        if (!body) {
          res.writeHead(404);
          return res.end('NoSuchKey');
        }
        res.writeHead(200);
        return res.end(body);
      }
      res.writeHead(405);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });

  afterAll(async () => new Promise<void>((r) => server.close(() => r())));

  const service = (ttl: string) =>
    new S3StorageService({
      get: (k: string, d?: any) =>
        ({ S3_ENDPOINT: base, S3_REGION: REGION, S3_BUCKET: BUCKET, S3_PUBLIC_URL: '', S3_SIGNED_URL_TTL: ttl })[k] ?? d,
      getOrThrow: (k: string) => {
        const s: Record<string, string> = { S3_BUCKET: BUCKET, S3_ACCESS_KEY: ACCESS_KEY, S3_SECRET_KEY: SECRET_KEY };
        if (!s[k]) throw new Error(`Missing ${k}`);
        return s[k];
      },
    } as unknown as ConfigService);

  it('stored reference is /uploads/<key> and the presigned URL retrieves the object; a tampered signature is rejected', async () => {
    const svc = service('60');
    const ref = await svc.save(Buffer.from('hello-object'), 'photo.jpg', 'image/jpeg');
    expect(ref).toMatch(/^\/uploads\//);

    const url = (await svc.accessRedirectUrl(ref))!;
    expect(url).toContain('X-Amz-Signature');

    const ok = await fetch(url);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('hello-object');

    // forged signature ⇒ the same independent verifier refuses it
    const forged = url.replace(/X-Amz-Signature=[0-9a-f]+/, 'X-Amz-Signature=' + 'f'.repeat(64));
    expect((await fetch(forged)).status).toBe(403);
  });

  it('an expired presigned URL is refused (403) while the same object stays reachable via a fresh link', async () => {
    const ref = await service('60').save(Buffer.from('expiring'), 'doc.pdf', 'application/pdf');
    // 1-second TTL, then wait past it
    const shortLived = (await service('1').accessRedirectUrl(ref))!;
    const fresh = (await service('60').accessRedirectUrl(ref))!;

    expect((await fetch(fresh)).status).toBe(200); // still valid

    await new Promise((r) => setTimeout(r, 2500));
    expect((await fetch(shortLived)).status).toBe(403); // expired
    expect((await fetch(fresh)).status).toBe(200); // fresh link still valid
  });
});
