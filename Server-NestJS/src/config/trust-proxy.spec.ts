// SPDX-License-Identifier: Apache-2.0

/**
 * AU-1（§22.19 审计归因层）：`trust proxy` 取值解析单测。
 * 关键护栏：任何输入都**不得**返回 boolean `true`（= 盲信任意上游 XFF，IP 可伪造）。
 *
 * 2026-09-17 补「默认值实际效果」回归：原默认「1 跳」不校验来源地址，在应用可被绕过直连时
 * 与 `true` 的伪造效果一致（攻击者发一条 X-Forwarded-For 即可伪造审计 IP）。默认值改为子网后，
 * 这里把「公网来源不得被信任」与「自带反代仍取真实 IP」两侧都锁住，并用对照用例固化旧缺陷。
 */
import express from 'express';
import request from 'supertest';
import { DEFAULT_TRUST_PROXY, isBlindTrustValue, parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy（AU-1）', () => {
  it('默认（未设/空）→ 只信回环 + 链路本地 + 私有网段（非跳数）', () => {
    expect(parseTrustProxy()).toBe(DEFAULT_TRUST_PROXY);
    expect(parseTrustProxy('')).toBe(DEFAULT_TRUST_PROXY);
    expect(parseTrustProxy('   ')).toBe(DEFAULT_TRUST_PROXY);
    // 明确不是数字（跳数不校验来源，不能作默认）
    expect(typeof parseTrustProxy('')).toBe('string');
  });

  it('纯数字 → 跳数（显式选择，调用方已知其不校验来源）', () => {
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy(' 3 ')).toBe(3);
  });

  it('0 / false → 不信任（false）', () => {
    expect(parseTrustProxy('0')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('FALSE')).toBe(false);
  });

  it('CIDR / 子网列表 / 具名 → 原样交 Express', () => {
    expect(parseTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
    expect(parseTrustProxy('loopback, 172.17.0.0/16')).toBe('loopback, 172.17.0.0/16');
  });

  it('护栏：任何输入都不返回 boolean true（禁盲信 XFF；含 "true" 亦拒绝为不信任）', () => {
    for (const i of [undefined, '', '   ', '0', 'false', 'true', 'TRUE', '1', '2', 'loopback', '10.0.0.0/8']) {
      expect(parseTrustProxy(i)).not.toBe(true);
    }
    expect(parseTrustProxy('true')).toBe(false);
  });
});

describe('isBlindTrustValue（AU-1：被拒取值的单一判定源）', () => {
  it('仅 true（含大小写/空白）为真', () => {
    for (const t of ['true', 'TRUE', 'True', ' true ']) expect(isBlindTrustValue(t)).toBe(true);
  });

  it('其余取值均为假（不得误判为盲信任）', () => {
    for (const f of [undefined, '', '   ', '0', 'false', '1', '2', 'loopback', '10.0.0.0/8']) {
      expect(isBlindTrustValue(f)).toBe(false);
    }
  });
});

/**
 * 默认值的**实际效果**（经 Express 自己的信任编译结果判定，而非直接读实现）：
 * `app.get('trust proxy fn')` 即 `app.set('trust proxy', …)` 编译出的判定函数，
 * `fn(addr, i)` = 「来源地址 addr 是否被信任」。
 */
describe('默认信任集的实际效果（回归：伪造 XFF 不得被采信）', () => {
  const trustFnFor = (val: unknown): ((addr: string, i: number) => boolean) => {
    const app = express();
    app.set('trust proxy', val);
    return app.get('trust proxy fn') as (addr: string, i: number) => boolean;
  };

  it('公网来源不在默认信任集内 → 不被信任 → 其 X-Forwarded-For 被忽略', () => {
    const trust = trustFnFor(DEFAULT_TRUST_PROXY);
    for (const publicAddr of ['203.0.113.5', '8.8.8.8', '198.51.100.7']) {
      expect(trust(publicAddr, 0)).toBe(false);
    }
  });

  it('自带 nginx / 同机反代（回环、Docker 私网）→ 被信任 → 采信其 XFF（不牺牲原能力）', () => {
    const trust = trustFnFor(DEFAULT_TRUST_PROXY);
    for (const proxyAddr of ['127.0.0.1', '172.17.0.2', '172.18.0.3', '10.1.2.3', '192.168.1.9']) {
      expect(trust(proxyAddr, 0)).toBe(true);
    }
  });

  it('对照：旧的「默认 1 跳」不校验来源 —— 公网地址同样被信任（正是本次修掉的缺陷）', () => {
    const trust = trustFnFor(1);
    expect(trust('203.0.113.5', 0)).toBe(true); // ← 无来源校验：等同于盲信 XFF
  });

  it('端到端：默认配置下经反代（loopback 来源）仍取真实客户端 IP', async () => {
    const app = express();
    app.set('trust proxy', DEFAULT_TRUST_PROXY);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));

    const r = await request(app).get('/ip').set('X-Forwarded-For', '9.9.9.9');

    expect((r.body as { ip: string }).ip).toBe('9.9.9.9');
  });
});
