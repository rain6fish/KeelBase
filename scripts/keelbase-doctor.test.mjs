// SPDX-License-Identifier: Apache-2.0

/**
 * keelbase-doctor 单测（node:test，零依赖）——覆盖 --env 环境预检纯逻辑。
 * 运行：node --test scripts/keelbase-doctor.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseEnv,
  checkNodeVersion,
  checkDocker,
  checkPort,
  checkEnvSecrets,
  checkLlm,
  checkDbType,
  report,
} from './keelbase-doctor.mjs';

test('parseEnv: 解析 KEY=VALUE，忽略注释/空行，去引号，兼容 CRLF', () => {
  const env = parseEnv(`# comment\nJWT_SECRET="abc 123"\nJWT_REFRESH_SECRET=def\r\n\nAI_PROVIDER=deepseek\nOLLAMA_BASE_URL='http://localhost:11434'\n=bad\n`);
  assert.equal(env.JWT_SECRET, 'abc 123');
  assert.equal(env.JWT_REFRESH_SECRET, 'def');
  assert.equal(env.AI_PROVIDER, 'deepseek');
  assert.equal(env.OLLAMA_BASE_URL, 'http://localhost:11434');
  assert.equal(Object.keys(env).length, 4);
});

test('parseEnv: 空/纯注释输入 → 空对象', () => {
  assert.deepEqual(parseEnv(''), {});
  assert.deepEqual(parseEnv('# only comment'), {});
  assert.deepEqual(parseEnv(undefined), {});
});

test('checkNodeVersion: >=20 pass，18-19 warn，<18 fail', () => {
  assert.equal(checkNodeVersion('20.11.1').status, 'pass');
  assert.equal(checkNodeVersion('22.3.0').status, 'pass');
  assert.equal(checkNodeVersion('19.9.0').status, 'warn');
  assert.equal(checkNodeVersion('18.19.0').status, 'warn');
  assert.equal(checkNodeVersion('16.20.2').status, 'fail');
  assert.match(checkNodeVersion('16.20.2').fix, /升级 Node/);
});

test('checkDocker: 未安装/守护进程停 → fail；有版本 → pass', () => {
  assert.equal(checkDocker('NOT_INSTALLED').status, 'fail');
  assert.equal(checkDocker('DAEMON_DOWN').status, 'fail');
  assert.equal(checkDocker('29.7.2').status, 'pass');
  assert.match(checkDocker('NOT_INSTALLED').fix, /Docker Desktop/);
});

test('checkPort: 空闲 pass，占用 warn 且给修复', () => {
  assert.equal(checkPort(3000, true).status, 'pass');
  assert.equal(checkPort(3000, false).status, 'warn');
  assert.match(checkPort(3000, false).fix, /netstat/);
});

test('checkEnvSecrets: 缺文件 warn；缺 JWT 密钥 fail；齐全 pass', () => {
  assert.equal(checkEnvSecrets('').status, 'warn');
  assert.equal(checkEnvSecrets('  \n  ').status, 'warn');
  assert.match(checkEnvSecrets('').fix, /cp .env.example/);
  assert.equal(checkEnvSecrets('JWT_SECRET=a\nJWT_REFRESH_SECRET=').status, 'fail');
  assert.equal(checkEnvSecrets('JWT_SECRET=a\nJWT_REFRESH_SECRET=b').status, 'pass');
});

test('checkLlm: ollama / provider+key pass；未配置 warn', () => {
  assert.equal(checkLlm('OLLAMA_BASE_URL=http://localhost:11434').status, 'pass');
  assert.equal(checkLlm('AI_PROVIDER=ollama').status, 'pass');
  assert.equal(checkLlm('AI_PROVIDER=deepseek\nDEEPSEEK_API_KEY=sk-xxx').status, 'pass');
  // provider 配了但 key 空 → 视为未就绪（降级）
  assert.equal(checkLlm('AI_PROVIDER=deepseek').status, 'warn');
  assert.equal(checkLlm('').status, 'warn');
  assert.match(checkLlm('').fix, /OLLAMA_BASE_URL/);
});

test('checkDbType: sqlite pass，postgres warn', () => {
  assert.equal(checkDbType('').status, 'pass');
  assert.equal(checkDbType('DB_TYPE=sqlite').status, 'pass');
  assert.equal(checkDbType('DB_TYPE=postgres').status, 'warn');
  assert.match(checkDbType('DB_TYPE=postgres').fix, /docker compose up -d postgres/);
});

test('report: 计数 fail/warn，fix 与 info 不改变 verdict', () => {
  const checks = [
    { status: 'pass', name: 'a', detail: 'x' },
    { status: 'warn', name: 'b', detail: 'y', fix: 'how to fix' },
    { status: 'info', name: 'c', detail: 'z' },
    { status: 'fail', name: 'd', detail: 'w' },
  ];
  assert.equal(report(checks), 1); // 有 fail → 退出码 1
  const ok = [
    { status: 'pass', name: 'a', detail: 'x' },
    { status: 'warn', name: 'b', detail: 'y' },
    { status: 'info', name: 'c', detail: 'z' },
  ];
  assert.equal(report(ok), 0);
});
