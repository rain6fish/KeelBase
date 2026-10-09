// SPDX-License-Identifier: Apache-2.0

/**
 * keelbase-doctor 单测（node:test，零依赖）——覆盖 --env 环境预检纯逻辑。
 * 运行：node --test scripts/keelbase-doctor.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_RUNTIME,
  classifyProtocol,
  parseEnv,
  checkNodeVersion,
  checkDocker,
  checkPort,
  checkEnvSecrets,
  checkLlm,
  checkDbType,
  checkContractSubmodule,
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

test('classifyProtocol：同 major 的旧 minor 属向后兼容 —— 不得让下游假红', () => {
  assert.equal(classifyProtocol('1.0', '1.1'), 'compatible-older');
  assert.equal(classifyProtocol('1.1', '1.1'), 'equal');
  assert.equal(classifyProtocol('1.5', '1.1'), 'newer-manifest');
});

test('classifyProtocol：major 不同或版本号读不出 = CLI 无法背书', () => {
  assert.equal(classifyProtocol('1.1', '2.0'), 'incompatible');
  assert.equal(classifyProtocol('1.0', '2.0'), 'incompatible');
  assert.equal(classifyProtocol(undefined, '1.1'), 'unknown');
  assert.equal(classifyProtocol('v1', '1.1'), 'unknown');
});

test('兼容矩阵为 warn 时 doctor 退出码仍为 0（向后兼容旧协议不是错误）', () => {
  assert.equal(
    report([{ status: 'warn', name: '兼容矩阵', detail: 'protocol 1.0 ≤ 1.1 —— 无需动作' }]),
    0,
  );
});

// ── 契约 submodule（含 SHA 校验）────────────────────────────────────────────

test('checkContractSubmodule：目录为空 → fail，并给出 clone 修复命令', () => {
  const r = checkContractSubmodule(0, '-b1ef4cab96bdb2557abdb330a8986bad2791e6ae Server-NestJS/specs/protocol');
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /为空/);
  assert.match(r.fix, /git submodule update/);
});

test('checkContractSubmodule：就位且检出与 pin 一致 → pass', () => {
  const r = checkContractSubmodule(
    23,
    ' b1ef4cab96bdb2557abdb330a8986bad2791e6ae Server-NestJS/specs/protocol (v1.3.0-1-gb1ef4ca)',
  );
  assert.equal(r.status, 'pass');
  assert.match(r.detail, /23 项/);
});

// 这一条是本检查存在的理由：目录非空 ⇒ 旧的「按目录是否为空」判定会说 ✓，
// 而套件其实对着**旧契约**跑，可能全绿。
test('checkContractSubmodule：目录非空但检出 ≠ pin（行首 +）→ warn，不得判 pass', () => {
  const r = checkContractSubmodule(23, '+9f8e7d6c5b4a39281706f5e4d3c2b1a098765432 Server-NestJS/specs/protocol');
  assert.equal(r.status, 'warn');
  assert.match(r.detail, /旧契约|不一致/);
  assert.match(r.fix, /git submodule update/);
});

test('checkContractSubmodule：取不到 git 状态（null）→ 只按目录判定，不凭空报错', () => {
  assert.equal(checkContractSubmodule(23, null).status, 'pass');
  assert.equal(checkContractSubmodule(0, null).status, 'fail');
});

test('checkContractSubmodule：warn（陈旧）不改变 doctor 退出码', () => {
  assert.equal(report([checkContractSubmodule(23, '+deadbeef Server-NestJS/specs/protocol')]), 0);
});

// The paths are pinned rather than left to the end-to-end test, which now *derives* its fixture from
// this list: deriving makes that test immune to the list moving, and this is what keeps the move from
// being silent. Dropping a capability here means doctor stops checking it and nothing else would say so.
//
// 路径钉在这里，而不是交给端到端用例 —— 后者如今**派生**自本清单：派生让它对清单变动免疫，而这一条正是
// 让变动不再无声。删掉一项能力，doctor 就不再检查它，而别处不会有任何声音。
test('REQUIRED_RUNTIME：基座能力清单被钉住（少一条 = 悄悄不查一项）', () => {
  assert.deepEqual(
    REQUIRED_RUNTIME.map((r) => r.path),
    [
      'Server-NestJS/src/ai/tools',
      'Server-NestJS/src/common/casl',
      'Server-NestJS/src/ai/governance-bridge',
      'Server-NestJS/src/ai/audit',
      'Server-NestJS/src/operation-audit',
      'Server-NestJS/src/ai',
    ],
  );
});
