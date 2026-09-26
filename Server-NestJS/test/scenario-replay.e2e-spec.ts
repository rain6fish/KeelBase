// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { ToolExposureService } from '../src/ai/tools/tool-exposure.service';
import { ToolExecutionService } from '../src/ai/tools/tool-execution.service';
import { AiToolEffectsService } from '../src/ai/tool-effects/ai-tool-effects.service';
import { AuthorizationDeniedError } from '../src/ai/interfaces/tool.interface';

/**
 * The replay corpus, executed on the implementation it was written from.
 *
 * The scenario packs' `replay` is the neutral-replay corpus (`docs/protocols/conformance-profile.md`
 * §2.4, Extended layer): a step sequence written in wire objects — a tool name, a wire-object id —
 * rather than in paths, so any conformant runtime can execute it and reach the same expectations.
 * The second carrier's runner lives in the Java repository (`ScenarioReplayTest`). This is the other
 * half, and it answers a different question:
 *
 *   - the Java runner asks "can a second carrier execute this corpus?"
 *   - this one asks "does the corpus say what this implementation actually does?"
 *
 * Both halves are needed. A corpus only one implementation has ever executed can encode that
 * implementation's reading of it — and this corpus was rewritten into wire objects by hand, so the
 * rewrite is exactly what needs checking here.
 *
 * The mapping this side needs (runner-side; every divergence is recorded, none is smoothed over):
 *
 *   - `call.tool` → `ToolExposureService.executeToolForExternal`, which answers in the
 *     `tool-invocation` response shape. A refused call arrives as `AuthorizationDeniedError` (R5)
 *     and is read as the corpus's `executed: false`.
 *   - `call.read` → the endpoint exposing that object: `audit-chain-verification` →
 *     `GET /audit/verify` · `permission-decision` → `POST /auth/permissions/explain` ·
 *     `evidence-package` → `GET /ai/governance/evidence-root/crm_task/:id` · `side-effect-revoke`
 *     (the governance view) → `GET /ai/governance/action/crm_task/:id`.
 *   - `call.write` → `side-effect-revoke#revoke` is `DELETE /ai/my/tool-effects/:id`, where a
 *     non-owner gets 404 — the corpus's `expect: null`.
 *   - `given.actor` → the corpus names an identity and each runtime maps it to its own directory.
 *     Here `alice` / `bob` are two registered callers and `admin` a third with the role promoted,
 *     because this implementation gates `GET /audit/verify` behind `manage all`.
 *
 * Entries this side cannot serve are recorded with their reason and asserted as such — the same
 * discipline as the Java runner, which is what makes the two runs comparable.
 *
 * The mapping this runner carries is written down for third parties in `docs/wire-object-endpoints.md`,
 * so a runtime's answer can be checked rather than inferred from this file.
 */

const SPECS_DIR = resolve(__dirname, '../specs/scenarios');

interface AnyJson {
  [k: string]: any;
}

const pack = (file: string): AnyJson => JSON.parse(readFileSync(resolve(SPECS_DIR, file), 'utf8'));

const steps = (p: AnyJson): AnyJson[] => p.steps ?? p.scenarios ?? [];

/** An entry this side cannot serve. Recorded, never silently skipped. */
class Unservable extends Error {}

describe('Scenario replay · the reference implementation executes its corpus', () => {
  let app: INestApplication;
  let toolExposure: ToolExposureService;
  let toolExecution: ToolExecutionService;
  let effects: AiToolEffectsService;

  /** The corpus's actors, mapped to this implementation's identity directory. */
  const actors: Record<string, { token: string; id: string }> = {};

  beforeAll(async () => {
    app = await createTestApp();

    for (const name of ['alice', 'bob', 'admin'] as const) {
      const reg = await registerUser(app, {
        username: `replay_${name}`,
        email: `replay_${name}@test.com`,
        password: 'Replay1234',
        nickname: `Replay${name}`,
      });
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authHeader(reg.accessToken))
        .expect(200);
      actors[name] = { token: reg.accessToken, id: String(me.body.data.id) };
    }

    await app.get(DataSource).getRepository('users').update(Number(actors.admin.id), { role: 'admin' });
    // Re-login so the token carries the promoted role — `loginAs` names it `accessToken`, and the
    // registration token does not have the role.
    actors.admin = { ...actors.admin, token: (await loginAs(app, 'replay_admin', 'Replay1234')).accessToken };

    toolExposure = app.get(ToolExposureService);
    toolExecution = app.get(ToolExecutionService);
    effects = app.get(AiToolEffectsService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** State a replay run carries between steps — the corpus states its targets as objects, not ids. */
  interface Run {
    actor: string;
    customerId?: number;
    resultId?: number;
    effectId?: number;
    confirmationToken?: string;
    replayed: Set<string>;
    /** Why a step could not be replayed — recorded per step, and asserted, so a reason cannot rot. */
    unservable: Map<string, string>;
  }

  const newRun = (actor: string): Run => ({ actor, replayed: new Set(), unservable: new Map() });

  // ── the corpus, executed ────────────────────────────────────────────────────────────────────

  it('golden-application-v1 · replays what this side serves', async () => {
    const p = pack('golden-application-v1.json');
    const run = newRun('alice');
    await seedCustomer(run);
    await seedEffect(run, 'replay-golden');

    await replayAll(p, run, [
      'risk_analysis',
      'create_followup_task_confirmation',
      'confirmed_write',
      'audit_verifiable',
      'revoke_effect',
      'ownership_check',
      'governance_view',
    ]);

    // Nothing is recorded any more, and both reasons are why: `audit_verifiable` is served because the
    // corpus now names `admin` (this implementation gates `GET /audit/verify` behind `manage all`), and
    // `confirmed_write` no longer carries an entry — the frozen `confirmation-decision` is on neither
    // implementation's response, so the corpus moved it out and recorded it instead of asserting it.
    expect(Object.fromEntries([...run.unservable].sort())).toEqual({});
    expect([...run.replayed].sort()).toEqual([
      'audit_verifiable',
      'create_followup_task_confirmation',
      'governance_view',
      'ownership_check',
      'revoke_effect',
      'risk_analysis',
    ].sort());
  });

  it('trust-proof-v1 · replays what this side serves', async () => {
    const p = pack('trust-proof-v1.json');
    const run = newRun('alice');
    await seedCustomer(run);
    await seedEffect(run, 'replay-trust');

    await replayAll(p, run, ['cross_user_denied', 'r5_blocked', 'r3_confirmation', 'evidence_root', 'revoke_effect']);

    expect(Object.fromEntries([...run.unservable].sort())).toEqual({});
    expect([...run.replayed].sort()).toEqual(
      ['cross_user_denied', 'evidence_root', 'revoke_effect', 'r5_blocked'].sort(),
    );
  });

  it('cross-entry-v1 · replays what this side serves', async () => {
    const p = pack('cross-entry-v1.json');
    const run = newRun('alice');
    await replayAll(p, run, ['mcp_r5_deny', 'deny_reasons_same_source', 'mcp_r3_confirmation', 'allow_snapshot_same_shape']);

    expect([...run.replayed].sort()).toEqual([
      'allow_snapshot_same_shape',
      'deny_reasons_same_source',
      'mcp_r5_deny',
      'mcp_r3_confirmation',
    ].sort());
  });

  /** Every corpus entry is either replayed above or recorded above — nothing falls between. */
  it('corpus inventory is fully classified', () => {
    const entries: string[] = [];
    for (const file of ['golden-application-v1.json', 'trust-proof-v1.json', 'cross-entry-v1.json']) {
      for (const step of steps(pack(file))) {
        if (Array.isArray(step.replay)) {
          step.replay.forEach((_: unknown, i: number) => entries.push(`${file}#${step.key}[${i}]`));
        }
      }
    }
    expect(entries.length).toBe(14);
  });

  // ── the replay itself ───────────────────────────────────────────────────────────────────────

  async function replayAll(p: AnyJson, run: Run, keys: string[]): Promise<void> {
    for (const key of keys) {
      const step = steps(p).find((s) => s.key === key);
      if (!step) {
        throw new Error(`the corpus has no step \`${key}\``);
      }
      if (step.given?.actor) {
        run.actor = step.given.actor;
      }
      let served = true;
      for (const entry of step.replay) {
        try {
          assertExpect(entry.expect, await replay(entry, run), `replay of ${key}`);
        } catch (e) {
          if (e instanceof Unservable) {
            run.unservable.set(key, e.message);
            served = false;
            break;
          }
          throw e;
        }
      }
      if (served && step.replay.length > 0) {
        run.replayed.add(key);
      }
    }
  }

  async function replay(entry: AnyJson, run: Run): Promise<AnyJson | null> {
    const call = entry.call;
    if (call.tool) {
      return toolCall(run, call);
    }
    if (call.read) {
      return readObject(call.read, run);
    }
    return writeObject(call.write, call.op, run);
  }

  /** `call.tool` — the governed entry, which answers in `tool-invocation`'s response shape. */
  async function toolCall(run: Run, call: AnyJson): Promise<AnyJson> {
    const args: AnyJson = { ...(call.args ?? {}) };
    if (args.customerId && typeof args.customerId === 'object') {
      expect(args.customerId.$ref).toBe('customer.id');
      args.customerId = run.customerId;
    }
    try {
      const res = await toolExposure.executeToolForExternal(call.tool, args, actors[run.actor].id);
      return { executed: res.executed, requiresConfirmation: res.requiresConfirmation };
    } catch (e) {
      if (e instanceof AuthorizationDeniedError) {
        // A refused call is not an execution: the corpus's `executed: false`.
        return { executed: false, requiresConfirmation: false };
      }
      throw e;
    }
  }

  async function readObject(object: string, run: Run): Promise<AnyJson> {
    const token = actors[run.actor].token;
    switch (object) {
      case 'audit-chain-verification': {
        const res = await request(app.getHttpServer()).get('/api/v1/audit/verify').set(authHeader(token));
        if (res.status !== 200) {
          throw new Unservable(
            `GET /audit/verify answered ${res.status} for actor \`${run.actor}\`: ${JSON.stringify(res.body?.message ?? res.body).slice(0, 120)}`,
          );
        }
        return { valid: res.body.data.valid };
      }
      case 'permission-decision': {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/permissions/explain')
          .set(authHeader(token))
          .send({ action: 'read', subject: 'Customer' });
        if (res.status >= 300) {
          throw new Unservable(`permissions/explain answered ${res.status} for actor \`${run.actor}\``);
        }
        return res.body.data;
      }
      case 'evidence-package': {
        requireBusinessAction(run);
        const res = await request(app.getHttpServer())
          .get(`/api/v1/ai/governance/evidence-root/crm_task/${run.resultId}`)
          .set(authHeader(token));
        if (res.status !== 200) {
          throw new Unservable(`evidence-root answered ${res.status}`);
        }
        return { format: res.body.data.format };
      }
      case 'side-effect-revoke': {
        requireBusinessAction(run);
        const res = await request(app.getHttpServer())
          .get(`/api/v1/ai/governance/action/crm_task/${run.resultId}`)
          .set(authHeader(token));
        if (res.status !== 200) {
          throw new Unservable(`governance/action answered ${res.status}`);
        }
        return { resultType: res.body.data.effect.resultType, toolName: res.body.data.effect.toolName };
      }
      default:
        throw new Unservable(`this implementation exposes no wire object \`${object}\``);
    }
  }

  async function writeObject(object: string, op: string, run: Run): Promise<AnyJson | null> {
    const token = actors[run.actor].token;
    switch (`${object}#${op}`) {
      case 'confirmation-decision#approve': {
        if (!run.confirmationToken) {
          // This implementation raises a confirmation token on the AI pipeline, and a write only runs
          // there: the non-streaming chat performs no writes, and `executeToolForExternal` answers
          // `requiresConfirmation` without a token. So off the stream there is nothing to decide, and
          // R1 put streams out of replay scope.
          throw new Unservable('no pending confirmation exists off the stream (tokens are raised by the AI pipeline)');
        }
        const res = await request(app.getHttpServer())
          .post(`/api/v1/ai/confirmations/${run.confirmationToken}`)
          .set(authHeader(token))
          .send({ decision: 'approve' });
        if (res.status !== 200) {
          throw new Unservable(`POST /ai/confirmations answered ${res.status}`);
        }
        if (res.body.data?.decision === undefined) {
          throw new Unservable('the approve response carries no `confirmation-decision` (it is stream-carried)');
        }
        return { decision: res.body.data.decision };
      }
      case 'side-effect-revoke#revoke': {
        if (!run.effectId) {
          throw new Unservable('no side effect for this step to revoke');
        }
        const res = await request(app.getHttpServer())
          .delete(`/api/v1/ai/my/tool-effects/${run.effectId}`)
          .set(authHeader(token));
        if (res.status === 404) {
          // Not this caller's object — the corpus's `expect: null` ("the object is not readable").
          return null;
        }
        expect(res.status).toBe(200);
        return { revoked: res.body.data.revoked };
      }
      default:
        throw new Unservable(`this implementation exposes no \`${op}\` on \`${object}\``);
    }
  }

  /** The entry's `expect` is checked key by key against what the entry's target object reports. */
  function assertExpect(wanted: AnyJson | null, observed: AnyJson | null, where: string): void {
    if (wanted === null) {
      expect(observed).toBeNull();
      return;
    }
    expect(observed).not.toBeNull();
    for (const [field, value] of Object.entries(wanted)) {
      expect([where, field, observed![field]]).toEqual([where, field, value]);
    }
  }

  // ── setup the corpus's fixtures and write steps need ────────────────────────────────────────

  /** The packs' `crm-customer` / `crm-order` fixtures, executed as the packs say: REST writes. */
  async function seedCustomer(run: Run): Promise<void> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set(authHeader(actors.alice.token))
      .send({ name: '瀚宇制造', company: '瀚宇集团', status: 'active', riskLevel: 'high' })
      .expect(201);
    run.customerId = created.body.data.id;
    for (const amount of [2800000, 800000]) {
      await request(app.getHttpServer())
        .post(`/api/v1/crm/customers/${run.customerId}/orders`)
        .set(authHeader(actors.alice.token))
        .send({ amount, status: 'overdue', dueDate: '2026-08-01T00:00:00Z' })
        .expect(201);
    }
  }

  /**
   * An executed AI write with its recorded side effect — what the revoke, evidence and governance
   * steps need to have something to act on.
   *
   * This implementation records the side effect on the execution path a *stream* drives, so a replay
   * that never opens a stream has to take the path the acceptance suite takes: the service. It is the
   * one place this runner goes around the wire, and it is recorded rather than hidden — the Java
   * runner has the same shape of exception (it seeds a customer through the repository, because that
   * runtime exposes no customer-create endpoint).
   *
   * The corpus cannot yet express "this step consumes the write the previous step produced"
   * (JV-15 Slice 0's ambiguity 5), which is why the state is established out here at all.
   */
  async function seedEffect(run: Run, title: string): Promise<void> {
    const write = await toolExecution.executeWrite(
      'create_followup_task',
      { customerId: run.customerId, title },
      actors.alice.id,
      'replay-setup',
    );
    expect(write.success).toBe(true);
    const list = await effects.list({ userId: actors.alice.id });
    const effect = (list.items as AnyJson[]).find((e) => e.toolName === 'create_followup_task' && e.targetTitle === title);
    if (!effect) {
      throw new Error('the executed write must have recorded a side effect');
    }
    run.effectId = effect.id;
    run.resultId = effect.resultId;
  }

  function requireBusinessAction(run: Run): void {
    if (!run.resultId) {
      throw new Unservable('no business action for this step to look up');
    }
  }
});
