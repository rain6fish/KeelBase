// SPDX-License-Identifier: Apache-2.0

/**
 * Cross-source consistency of an evidence root: the anchors a package says it stands on, against the
 * rows it actually carries. The fixtures are shaped the way `getEvidenceRoot` assembles a `/4`
 * package — nothing about the check itself is stubbed, so a green here means the rules ran.
 *
 * 证据根的跨来源一致性：包**声称**立在其上的锚，与它**实际携带**的行。夹具按
 * `getEvidenceRoot` 组装 `/4` 包的方式构造 —— 被测检查本身没有任何替身，故这里的绿意味着规则真的跑了。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crossCheckEvidenceRoot } from '../Server-NestJS/scripts/lib/evidence-crosscheck.mjs';

const h = (s) => createHash('sha256').update(s).digest('hex');

/** One `/4` package, assembled the way the exporter does it.
 *  一份 `/4` 包，按导出侧的方式组装。 */
function packageOf({ anchors, aiAudit = [], operationAudit = [], effect, action }) {
  return {
    format: 'keelbase-audit-evidence/4',
    action: {
      id: 'crm_task:7',
      resultType: 'crm_task',
      resultId: 7,
      effectId: effect.id,
      userId: '42',
      conversationId: 'c1',
      ...action,
    },
    effect,
    chains: { aiAudit, operationAudit },
    root: { algorithm: 'keelbase-evidence-root/1', anchors, digest: h('anchors') },
  };
}

const effect = { id: 9281, toolName: 'create_followup_task', before: null, after: { id: 7 } };
const trigger = { seq: 1, id: 38172, prevHash: null, hash: h('trigger'), payload: { action: 'tool_call' } };
/** A second conversation row: carried as context, deliberately not anchored.
 *  会话里的第二行：作为上下文携带，有意不入锚。 */
const contextRow = { seq: 2, id: 38180, prevHash: h('trigger'), hash: h('context'), payload: { action: 'chat' } };
const opRow = { seq: 1, id: 500, prevHash: null, hash: h('op'), payload: { method: 'PATCH', path: '/crm/tasks/7' } };

const sideAnchor = { kind: 'side-effect', rowId: effect.id, hash: h('side') };
const aiAnchor = { kind: 'ai-audit', rowId: trigger.id, hash: trigger.hash };
const opAnchor = { kind: 'op-audit', rowId: opRow.id, hash: opRow.hash };

test('一致：锚集合与包内携带的行互相对得上 ⇒ 两个差集都为空', () => {
  const pkg = packageOf({
    anchors: [aiAnchor, sideAnchor, opAnchor],
    aiAudit: [trigger, contextRow],
    operationAudit: [opRow],
    effect,
  });

  const out = crossCheckEvidenceRoot(pkg);

  assert.equal(out.consistent, true);
  assert.deepEqual(out.onlyDeclared, []);
  assert.deepEqual(out.onlyStored, []);
});

test('一致：会话里**未被锚定**的行不报 —— 导出侧只锚触发行，其余按设计只是上下文', () => {
  const pkg = packageOf({
    anchors: [aiAnchor, sideAnchor, opAnchor],
    aiAudit: [trigger, contextRow],
    operationAudit: [opRow],
    effect,
  });

  const out = crossCheckEvidenceRoot(pkg);

  // `contextRow` has a valid hash and no anchor: that is the normal `/4` shape, not a gap.
  // `contextRow` 有合法 hash、没有锚：这是 `/4` 的正常形态，不是缺口。
  assert.equal(out.onlyStored.some((f) => f.rowId === contextRow.id), false);
});

test('onlyDeclared：锚声明了一条包内没有携带的 AI 审计行 ⇒ 点名它', () => {
  // The reachable production shape: the effect has no conversation (`conversation_id` is nullable),
  // so `chains.aiAudit` is empty, while the claim still points at the trigger row by id — the package
  // anchors a row it does not carry.
  // 生产可达形态：副作用行没有会话（`conversation_id` 可空）⇒ `chains.aiAudit` 为空，
  // 而占位行仍按 id 指到那条触发行，于是包锚定了一条它没有携带的行。
  const pkg = packageOf({ anchors: [aiAnchor, sideAnchor, opAnchor], aiAudit: [], operationAudit: [opRow], effect });

  const out = crossCheckEvidenceRoot(pkg);

  assert.equal(out.consistent, false);
  assert.equal(out.onlyDeclared.length, 1);
  assert.deepEqual(
    { kind: out.onlyDeclared[0].kind, rowId: out.onlyDeclared[0].rowId, reason: out.onlyDeclared[0].reason },
    { kind: 'ai-audit', rowId: trigger.id, reason: 'anchor_row_not_carried' },
  );
  assert.match(out.onlyDeclared[0].detail, /chains\.aiAudit/);
});

test('onlyDeclared：同一行被携带但 hash 不同 ⇒ 点名 hash 不一致', () => {
  const pkg = packageOf({
    anchors: [aiAnchor, sideAnchor, opAnchor],
    aiAudit: [{ ...trigger, hash: h('something else') }, contextRow],
    operationAudit: [opRow],
    effect,
  });

  const out = crossCheckEvidenceRoot(pkg);

  assert.equal(out.consistent, false);
  assert.deepEqual(
    out.onlyDeclared.map((f) => [f.kind, f.rowId, f.reason]),
    [['ai-audit', trigger.id, 'anchor_hash_mismatch']],
  );
});

test('onlyStored：包携带了副作用行却没有副作用锚 ⇒ 点名它无锚可依', () => {
  const pkg = packageOf({
    anchors: [aiAnchor, opAnchor],
    aiAudit: [trigger, contextRow],
    operationAudit: [opRow],
    effect,
  });

  const out = crossCheckEvidenceRoot(pkg);

  assert.equal(out.consistent, false);
  assert.deepEqual(
    out.onlyStored.map((f) => [f.kind, f.rowId, f.reason]),
    [['side-effect', effect.id, 'side_effect_carried_not_anchored']],
  );
});

test('onlyStored：链段里携带了一行没有链 hash 的行 ⇒ 点名它不在任何链里', () => {
  const pkg = packageOf({
    anchors: [aiAnchor, sideAnchor],
    aiAudit: [trigger, { ...contextRow, hash: '' }],
    operationAudit: [opRow],
    effect,
  });

  const out = crossCheckEvidenceRoot(pkg);

  assert.equal(out.consistent, false);
  assert.deepEqual(
    out.onlyStored.map((f) => [f.kind, f.rowId, f.reason]),
    [['ai-audit', contextRow.id, 'carried_row_without_chain_hash']],
  );
  assert.match(out.onlyStored[0].detail, /64 hex/);
});

test('副作用锚指向的不是包里那条副作用行 ⇒ onlyDeclared 点名', () => {
  const pkg = packageOf({
    anchors: [aiAnchor, { ...sideAnchor, rowId: 1 }, opAnchor],
    aiAudit: [trigger, contextRow],
    operationAudit: [opRow],
    effect,
  });

  const out = crossCheckEvidenceRoot(pkg);

  assert.equal(out.consistent, false);
  assert.deepEqual(
    out.onlyDeclared.map((f) => [f.kind, f.rowId, f.reason]),
    [['side-effect', 1, 'side_effect_anchor_not_the_packaged_effect']],
  );
});
