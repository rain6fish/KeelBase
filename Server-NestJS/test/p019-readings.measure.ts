// SPDX-License-Identifier: Apache-2.0

/**
 * P0-19 ② — the two readings, taken on three event classes.
 *
 * This file is a **measurement instrument**, not a test: it asserts almost nothing and its exit code
 * says "the instrument ran", not "the product is good". It drives three events on an isolated app
 * (per-process temporary sqlite, see `test/helpers.ts`) and then counts, from the durable record,
 * what a reader could restore.
 *
 * It is deliberately NOT named `*.e2e-spec.ts`: the suite's `testRegex` is `.e2e-spec.ts$`, so `jest`
 * in CI never picks it up. Adding a 60-second-class wait to every CI run to answer a one-off
 * measurement question would be a cost with no gate behind it. Run it by hand:
 *
 *     npx jest --config test/jest-e2e.json --testRegex 'p019-readings\\.measure\\.ts$'
 *
 * The two dimensions are the ones the architecture plan named (P0-19 ②). Each is turned into a
 * **count over a fixed list**, so the answer is a number and two people running the same command get
 * the same number:
 *
 *   - Action Recoverability (AR) — of the six questions the product's own language asks
 *     (who did it / what was done / why it was allowed / who approved / what came of it / how it is
 *     proved), how many are answerable from **structured columns alone**, without parsing free text.
 *     Denominator per class = questions that apply to that class.
 *   - Lifecycle Coverage (LC) — of the stages the class **should** leave a durable trace of, how many
 *     actually have one. Denominator per class = stages required for that class.
 *
 * P0-19 ② —— 两维读数，对三类事件各取一次。
 *
 * 本文件是**测量仪器**，不是测试：几乎不做断言，退出码的含义是「仪器跑完了」，不是「产品好」。
 * 它在一个隔离的 app 上驱动三类事件（每进程独立临时 sqlite，见 `test/helpers.ts`），再从**持久记录**
 * 里数出「一个读者能还原什么」。
 *
 * 它**故意不叫** `*.e2e-spec.ts`：套件的 `testRegex` 是 `.e2e-spec.ts$`，故 CI 里的 `jest` 不会收它。
 * 为一次性的测量问题给每一轮 CI 加一段分钟级的等待，是只有成本、背后没有闸。
 *
 * 两维取自架构计划点名的 P0-19 ②。每一维都化成**固定清单上的计数**，所以答案是**数字**，
 * 两个人跑同一条命令得到同一个数。
 *
 * 「可还原」的口径是**只读结构化列、不解析自由文本** —— 这正是 C-3 要消掉的那件事：
 * 若一个事实只能从 `detail` / `error_message` 这类散文里读出来，它**不算**可还原。
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, registerUser, loginAs, authHeader } from './helpers';
import { SettingsService, SETTING_KEYS } from '../src/settings/settings.service';
import { AiAuditLog } from '../src/governance-shared/entities/ai-audit-log.entity';
import { AiConfirmationRequest } from '../src/governance-shared/entities/ai-confirmation-request.entity';
import { AiToolSideEffect } from '../src/governance-shared/entities/ai-tool-side-effect.entity';

/** The in-stream wait used for the timeout class. The class does not depend on its length. */
const TIMEOUT_TTL_SECONDS = 3;

/** A parsed SSE frame: `{ type: 'confirmation_request', confirmation: {...} }` and friends. */
interface SseEvent {
  type?: string;
  [k: string]: unknown;
}

/**
 * Drive one chat turn over the SSE endpoint and collect its frames.
 *
 * `onConfirmation` is called the moment the stream asks for one, and its promise is awaited **inside
 * the read loop** — the server is parked on that confirmation, so the stream cannot advance until the
 * decision is posted. Returning without a decision from this hook is how the timeout class is made.
 *
 * 驱动一轮对话并收集它的事件帧。`onConfirmation` 在流请求确认的那一刻被调用，且其 promise 在
 * **读循环内**被 await —— 服务端正停在那次确认上，裁决不投递，流就不会前进。钩子直接返回、
 * 不做裁决，就是「超时」那一类的造法。
 */
async function runStream(opts: {
  port: number;
  token: string;
  message: string;
  onConfirmation?: (confirmation: Record<string, unknown>) => Promise<void>;
}): Promise<SseEvent[]> {
  const res = await fetch(`http://localhost:${opts.port}/api/v1/ai/chat/stream`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: opts.message }),
  });
  if (!res.ok) {
    throw new Error(`stream ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const events: SseEvent[] = [];

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      let evt: SseEvent;
      try {
        evt = JSON.parse(dataLine.slice('data: '.length)) as SseEvent;
      } catch {
        continue;
      }
      events.push(evt);
      if (evt.type === 'confirmation_request' && opts.onConfirmation) {
        await opts.onConfirmation(evt.confirmation as Record<string, unknown>);
      }
    }
  }
  return events;
}

/** Everything a class left behind, selected by id range so runs cannot bleed into each other. */
interface Slice {
  audits: AiAuditLog[];
  confirmations: AiConfirmationRequest[];
  effects: AiToolSideEffect[];
}

/** Poll until the slice is quiescent: awaited rows land before the stream ends, the chat row may not. */
async function settle(
  ds: DataSource,
  floors: { audit: number; conf: number; effect: number },
  expect: (s: Slice) => boolean,
): Promise<Slice> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const slice = await readSlice(ds, floors.audit, floors.conf, floors.effect);
    if (expect(slice) || Date.now() > deadline) return slice;
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function readSlice(ds: DataSource, auditFloorId: number, confFloorId = 0, effectFloorId = 0): Promise<Slice> {
  const audits = await ds
    .getRepository(AiAuditLog)
    .createQueryBuilder('a')
    .where('a.id > :floor', { floor: auditFloorId })
    .orderBy('a.id', 'ASC')
    .getMany();
  const confirmations = await ds
    .getRepository(AiConfirmationRequest)
    .createQueryBuilder('c')
    .where('c.id > :floor', { floor: confFloorId })
    .orderBy('c.id', 'ASC')
    .getMany();
  const effects = await ds
    .getRepository(AiToolSideEffect)
    .createQueryBuilder('e')
    .where('e.id > :floor', { floor: effectFloorId })
    .orderBy('e.id', 'ASC')
    .getMany();
  return { audits, confirmations, effects };
}

/** The six questions, in the product's own words (P0-20 §六问). */
const AR_QUESTIONS = ['who', 'what', 'why-allowed', 'who-approved', 'result', 'how-proved'] as const;
type ArQuestion = (typeof AR_QUESTIONS)[number];

/**
 * Answer each question from structured columns only.
 *
 * A question is a fact of the **event's whole record set** (audit rows + confirmation row + effect
 * row), not of one row: a reader restoring the event may join. `detail` / `error_message` are never
 * consulted — reading them is exactly the parsing C-3 exists to remove.
 *
 * `who-approved` is **not applicable** to a class that never had a confirmation asked: there is no
 * person whose approval could be recorded, and counting it as missing would charge the record for a
 * stage the event never had. It is dropped from that class's denominator instead.
 */
/**
 * The row that says how the event ended.
 *
 * One event can leave more than one `tool_call` row: the R4 door writes one when the proposal is
 * parked for approval (`pending`) and a *second* one when the approver's execution lands
 * (`executed`). Taking the first would report the parked state as the ending, which is exactly the
 * reading error this instrument exists to avoid. Later id = later fact.
 *
 * 一次事件可能留下**不止一行** `tool_call`：R4 那扇门在「挂起等审批」时写一行（`pending`），
 * 审批人执行时**再写一行**（`executed`）。取第一行就会把「挂起」当成结局 —— 正是本仪器要避免的
 * 读数错误。id 更大 = 更晚的事实。
 */
function finalToolRow(slice: Slice) {
  const toolRows = slice.audits.filter((a) => a.action === 'tool_call');
  return toolRows[toolRows.length - 1];
}

interface ArAnswer {
  value: boolean | null;
  /** Which column answered it — so a reader can re-run the predicate instead of trusting this file. */
  from: string;
}

function answerAr(slice: Slice): { asked: boolean; answers: Record<ArQuestion, ArAnswer> } {
  const toolRow = finalToolRow(slice);
  const conf = slice.confirmations[0];
  const eff = slice.effects[0];
  const asked = Boolean(conf);

  // Arguments count as structured only when they are a machine-shaped column: the confirmation row's
  // JSON args, or the effect row's args hash. `ai_audit_logs.detail` spells them inside prose —
  // `tool({...})` — and reading that is the parsing this measurement exists to price.
  //
  // 参数只有在**机器形状的列**里才算结构化：确认行的 JSON args，或副作用行的 args 哈希。
  // `ai_audit_logs.detail` 把参数拼在散文里 —— `tool({...})` —— 去读它正是本次测量要计价的解析。
  const structuredArgs = conf && safeJson(conf.args) ? 'ai_confirmation_requests.args' : eff?.argsHash ? 'ai_tool_side_effects.args_hash' : null;

  return {
    asked,
    answers: {
      who: {
        value: Boolean(toolRow?.userId && toolRow?.username),
        from: 'ai_audit_logs.user_id + username',
      },
      what: {
        value: Boolean(toolRow?.tool) && Boolean(structuredArgs),
        from: `ai_audit_logs.tool${structuredArgs ? ` + ${structuredArgs}` : ' (no structured args column)'}`,
      },
      'why-allowed': {
        value: Boolean(toolRow?.authorization),
        from: 'ai_audit_logs.authorization',
      },
      'who-approved': {
        // Not applicable when no confirmation was ever asked: there is no person whose approval
        // could be recorded, so charging the record for it would be measuring a stage the event
        // never had. A pending row (timeout) IS applicable, and answers "no one decided".
        //
        // 没有问过确认就没有「谁批准」可言（把不存在的阶段算进分母是在罚记录）。但**待批行**
        // （超时）是适用的，它答「无人裁决」。
        value: asked ? Boolean(conf?.approverId && conf?.decidedAt) : null,
        from: 'ai_confirmation_requests.approver_id + decided_at',
      },
      result: {
        value: Boolean(toolRow?.outcome),
        from: 'ai_audit_logs.outcome',
      },
      'how-proved': {
        value: Boolean(toolRow?.hash),
        from: 'ai_audit_logs.hash (+ prev_hash chain)',
      },
    },
  };
}

function safeJson(s: string | undefined): unknown {
  if (!s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** Lifecycle stages, in the order an event traverses them. */
const LC_STAGES = [
  'turn', // the request/turn itself is recorded
  'proposal', // a structured row names the tool
  'policy-decision', // a structured allow/deny basis
  'confirmation-asked', // a durable confirmation row
  'human-decision', // that row reached a terminal decision, with approver + instant
  'execution', // an execution was attempted and recorded
  'side-effect', // the change it made, with before/after
  'outcome', // the structured outcome of the turn's tool call
  'revocability', // whether that change can be undone, as a column
] as const;
type LcStage = (typeof LC_STAGES)[number];

/**
 * Which entry the event came through.
 *
 * The six core numbers were taken on one door — the chat stream. The same event kind reached
 * through another door is a *different record*: the MCP door writes its audit row by hand and
 * refuses to execute anything that needs confirmation; the R4 door executes in a *later request*,
 * by a *different person*. Measuring one door describes the door, not the product.
 *
 * 事件是从哪扇门进来的。六个核心数只在一扇门（对话流）上取过。同一个事件类换一扇门进来，
 * 留下的记录就不同：MCP 那扇自己手拼审计行、且需确认的工具一律不执行；R4 那扇是在**另一个请求、
 * 另一个人**手里执行的。只测一扇门，描述的是门，不是产品。
 */
type Entry = 'chat' | 'mcp' | 'r4';

type ClassKind =
  | 'success'
  | 'blocked'
  | 'timeout'
  | 'mcp-blocked'
  | 'mcp-held'
  | 'mcp-read'
  | 'r4-approved';

const ENTRY_OF: Record<ClassKind, Entry> = {
  success: 'chat',
  blocked: 'chat',
  timeout: 'chat',
  'mcp-blocked': 'mcp',
  'mcp-held': 'mcp',
  'mcp-read': 'mcp',
  'r4-approved': 'r4',
};

/**
 * Which stages each class **should** leave a durable trace of.
 *
 * The denominators follow what the event is, not a wish: a read has no side effect to record, and
 * an event the door refused to run has no execution stage. But where the door *claims* to have
 * asked for a confirmation — `mcp-held` tells the caller "requires confirmation" — that stage is
 * required: an artifact you cannot point at is not an artifact.
 *
 * 分母跟着事件本身走，不跟着愿望走：读没有副作用可记，被扣下的事件也没有执行阶段。但凡入口
 * **声称**问过确认（`mcp-held` 就告诉调用方「requires confirmation」），那一阶段就算必填 ——
 * 指不出来的东西不算留痕。
 */
const LC_REQUIRED: Record<ClassKind, LcStage[]> = {
  success: [...LC_STAGES],
  blocked: ['turn', 'proposal', 'policy-decision', 'outcome'],
  timeout: ['turn', 'proposal', 'policy-decision', 'confirmation-asked', 'outcome'],
  'mcp-blocked': ['turn', 'proposal', 'policy-decision', 'outcome'],
  'mcp-held': ['turn', 'proposal', 'policy-decision', 'confirmation-asked', 'outcome'],
  'mcp-read': ['turn', 'proposal', 'execution', 'outcome'],
  'r4-approved': [...LC_STAGES],
};

function answerLc(slice: Slice): Record<LcStage, boolean> {
  const toolRow = finalToolRow(slice);
  const conf = slice.confirmations[0];
  const eff = slice.effects[0];
  return {
    turn: slice.audits.some((a) => a.action === 'chat' || a.action === 'delegate' || a.action === 'tool_call'),
    proposal: Boolean(toolRow?.tool) || Boolean(conf?.toolName),
    // A structured **basis**, not merely an outcome: an `outcome` says how it ended, never why it
    // was allowed or refused. Keeping the two apart is what makes the timeout gap visible.
    //
    // 要的是结构化的**依据**，不是结局：`outcome` 说的是怎么结束的，从不说为何放行或拒绝。
    // 把两者分开，超时那一类的缺口才看得出来。
    'policy-decision': Boolean(toolRow?.authorization),
    'confirmation-asked': Boolean(conf),
    'human-decision': Boolean(conf && conf.status !== 'pending' && conf.decidedAt),
    execution: Boolean(conf?.executedAt) || toolRow?.outcome === 'executed' || toolRow?.outcome === 'failed',
    'side-effect': Boolean(eff && (eff.beforeSnapshot || eff.afterSnapshot)),
    outcome: Boolean(toolRow?.outcome),
    revocability: Boolean(eff?.revokeClass),
  };
}

interface Reading {
  klass: ClassKind;
  /** Carried into the machine line so the pinned baseline can name a door, not only a class. */
  door: Entry;
  ar: {
    numerator: number;
    denominator: number;
    detail: Record<ArQuestion, boolean | null>;
    evidence: Record<ArQuestion, string>;
  };
  lc: { present: number; required: number; detail: Record<string, boolean>; missing: string[] };
}

function readingsFor(klass: ClassKind, slice: Slice): Reading {
  const ar = answerAr(slice);
  const applicable = AR_QUESTIONS.filter((q) => ar.answers[q].value !== null);
  const arNum = applicable.filter((q) => ar.answers[q].value === true).length;

  const lcDetail = answerLc(slice);
  const required = LC_REQUIRED[klass];
  const presentStages = required.filter((s) => lcDetail[s]);
  const missing = required.filter((s) => !lcDetail[s]);

  const detail = Object.fromEntries(AR_QUESTIONS.map((q) => [q, ar.answers[q].value])) as Record<
    ArQuestion,
    boolean | null
  >;
  const evidence = Object.fromEntries(AR_QUESTIONS.map((q) => [q, ar.answers[q].from])) as Record<
    ArQuestion,
    string
  >;

  return {
    klass,
    door: ENTRY_OF[klass],
    ar: { numerator: arNum, denominator: applicable.length, detail, evidence },
    lc: {
      present: presentStages.length,
      required: required.length,
      detail: lcDetail as unknown as Record<string, boolean>,
      missing: missing as unknown as string[],
    },
  };
}

describe('P0-19 ② readings — Action Recoverability × Lifecycle Coverage, three event classes', () => {
  let app: INestApplication;
  let ds: DataSource;
  let port: number;
  let token: string;
  let adminToken: string;
  const readings: Reading[] = [];
  const observed: Record<string, unknown> = {};
  const slices: Partial<Record<ClassKind, Slice>> = {};

  jest.setTimeout(180_000);

  beforeAll(async () => {
    app = await createTestApp();
    const reg = await registerUser(app, {
      username: 'p019owner',
      email: 'p019owner@test.com',
      password: 'P019abcd1',
      nickname: 'P019Owner',
    });
    token = reg.accessToken;
    ds = app.get(DataSource);
    // Bind a real socket: the SSE path streams over `fetch`, unlike the buffered supertest calls.
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;

    // The demo provider's write intent resolves the customer from the turn, defaulting to id 1.
    await request(app.getHttpServer())
      .post('/api/v1/crm/customers')
      .set(authHeader(token))
      .send({ name: '辰光建材', company: '辰光集团', status: 'active', riskLevel: 'high' })
      .expect(201);

    // The R4 door needs a second person: the approver. Same shape the other suites use.
    const adminReg = await registerUser(app, {
      username: 'p019approver',
      email: 'p019approver@test.com',
      password: 'P019abcd2',
      nickname: 'P019Approver',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(authHeader(adminReg.accessToken))
      .expect(200);
    await ds.getRepository('users').update(Number(me.body.data.id), { role: 'admin' });
    // Re-login so the token carries the promoted role — the registration token does not have it.
    adminToken = (await loginAs(app, 'p019approver', 'P019abcd2')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Highest id currently in each table — the floor for the next class's slice. */
  async function floors(): Promise<{ audit: number; conf: number; effect: number }> {
    const q = async (table: string) => {
      const r = await ds.query(`SELECT COALESCE(MAX(id), 0) AS m FROM ${table}`);
      return Number(r[0].m);
    };
    return { audit: await q('ai_audit_logs'), conf: await q('ai_confirmation_requests'), effect: await q('ai_tool_side_effects') };
  }

  it('① 成功 — approve a write in-stream, then read what the record keeps', async () => {
    const f = await floors();
    const events = await runStream({
      port,
      token,
      message: '帮我为这个客户创建跟进任务',
      onConfirmation: async (confirmation) => {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/ai/confirmations/${String(confirmation.token)}`)
          .set(authHeader(token))
          .send({ decision: 'approve' })
          .expect(200);
        observed['success.confirmResponse'] = res.body;
      },
    });
    const decision = events.find((e) => e.type === 'confirmation_decision');
    observed['success.confirmationDecision'] = decision?.confirmationDecision ?? null;

    const slice = await settle(ds, f, (s) =>
      s.audits.some((a) => a.action === 'tool_call' && a.outcome === 'executed'),
    );
    slices.success = slice;
    readings.push(readingsFor('success', slice));
    observed['success.slice'] = summarize(slice);
  });

  it('② 被拒 — R5 policy block, no confirmation asked', async () => {
    const f = await floors();
    const events = await runStream({ port, token, message: '删除客户' });
    observed['blocked.toolEnd'] = events.find((e) => e.type === 'tool_end') ?? null;

    const slice = await settle(ds, f, (s) => s.audits.some((a) => a.action === 'tool_call'));
    slices.blocked = slice;
    readings.push(readingsFor('blocked', slice));
    observed['blocked.slice'] = summarize(slice);
  });

  it('③ 超时失败 — confirmation asked, no decision inside the window', async () => {
    // Shorten the in-stream wait so the instrument stays cheap; the class does not depend on its length.
    const settings = app.get(SettingsService);
    await settings.set(SETTING_KEYS.CONFIRMATION_TTL, TIMEOUT_TTL_SECONDS, 'number');

    const f = await floors();
    const events = await runStream({ port, token, message: '帮我为这个客户创建跟进任务' });
    const decision = events.find((e) => e.type === 'confirmation_decision');
    observed['timeout.confirmationDecision'] = decision?.confirmationDecision ?? null;

    await settings.set(SETTING_KEYS.CONFIRMATION_TTL, 60, 'number');

    const slice = await settle(ds, f, (s) => s.audits.some((a) => a.action === 'tool_call'));
    slices.timeout = slice;
    readings.push(readingsFor('timeout', slice));
    observed['timeout.slice'] = summarize(slice);
  });

  /** One MCP `tools/call`, in the shape the export endpoint parses. */
  const mcpCall = (name: string, args: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/mcp')
      .set(authHeader(token))
      .send({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } });

  it('④ MCP · 被拒 — R5 through the other door', async () => {
    const f = await floors();
    const res = await mcpCall('delete_customer', { customerId: 1 }).expect(201);
    observed['mcp.blocked.response'] = res.body;

    const slice = await settle(ds, f, (s) => s.audits.some((a) => a.action === 'tool_call'));
    slices['mcp-blocked'] = slice;
    readings.push(readingsFor('mcp-blocked', slice));
    observed['mcp.blocked.slice'] = summarize(slice);
  });

  it('⑤ MCP · 被扣下 — the door says "requires confirmation" and stops', async () => {
    const f = await floors();
    const res = await mcpCall('create_event', { title: 'p019-held' }).expect(201);
    observed['mcp.held.response'] = res.body;

    const slice = await settle(ds, f, (s) => s.audits.some((a) => a.action === 'tool_call'));
    slices['mcp-held'] = slice;
    readings.push(readingsFor('mcp-held', slice));
    observed['mcp.held.slice'] = summarize(slice);
  });

  it('⑥ MCP · 只读成功 — a read really runs, so "success" means something else here', async () => {
    const f = await floors();
    const res = await mcpCall('query_events', {}).expect(201);
    observed['mcp.read.response'] = res.body;

    const slice = await settle(ds, f, (s) => s.audits.some((a) => a.action === 'tool_call'));
    slices['mcp-read'] = slice;
    readings.push(readingsFor('mcp-read', slice));
    observed['mcp.read.slice'] = summarize(slice);
  });

  it('⑦ R4 · 双人审批通过 — proposed by the operator, executed by another person', async () => {
    // The demo provider cannot emit an R4 tool, so the approval tier is reached the way the product
    // lets an administrator reach it: by policy. This makes a tool the demo provider *can* propose
    // (create_followup_task) require a second person — no product code changes, one product feature.
    //
    // Demo provider 造不出 R4 工具，故按产品**自己给的**入口进入审批档：用治理策略把 demo 能提议的
    // 工具（create_followup_task）升档为「需第二人审批」。不改产品码，用的是产品功能。
    await request(app.getHttpServer())
      .put('/api/v1/ai/governance/policy')
      .set(authHeader(adminToken))
      .send({ tools: { create_followup_task: { mode: 'approval' } }, audit: { granularity: 'all' } })
      .expect(200);

    const f = await floors();
    let approvalToken = '';
    const events = await runStream({
      port,
      token,
      message: '帮我为这个客户创建跟进任务',
      onConfirmation: async (confirmation) => {
        // R4 parks the request; the operator does not decide it. Nothing to post here on purpose.
        approvalToken = String(confirmation.token);
        observed['r4.mode'] = confirmation.mode ?? null;
      },
    });
    observed['r4.proposalEvents'] = events.map((e) => e.type);

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/ai/confirmations/${approvalToken}/approve-by`)
      .set(authHeader(adminToken))
      .send({ decision: 'approve' })
      .expect(200);
    observed['r4.approveResponse'] = approved.body;

    const slice = await settle(ds, f, (s) =>
      s.audits.some((a) => a.action === 'tool_call' && a.outcome === 'executed'),
    );
    slices['r4-approved'] = slice;
    readings.push(readingsFor('r4-approved', slice));
    observed['r4.slice'] = summarize(slice);

    // Put the policy back so nothing below (or a re-run) sees a raised tier.
    await request(app.getHttpServer())
      .put('/api/v1/ai/governance/policy')
      .set(authHeader(adminToken))
      .send({ tools: {}, audit: { granularity: 'all' } })
      .expect(200);
  });

  it('⑧ 读数 — the numbers, by door and by event class', () => {
    const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
    const lines = [
      '',
      '=== P0-19 ② readings — by door, by event class ===',
      `${pad('door', 6)} ${pad('class', 14)} ${pad('AR (structured-only)', 24)} ${pad('LC (present/required)', 24)} uncovered`,
      '-'.repeat(96),
      ...readings.map(
        (r) =>
          `${pad(ENTRY_OF[r.klass], 6)} ${pad(r.klass, 14)} ${pad(`${r.ar.numerator}/${r.ar.denominator}`, 24)} ${pad(`${r.lc.present}/${r.lc.required}`, 24)} ${r.lc.missing.join(',') || '-'}`,
      ),
      '',
      'per-question (AR): ' +
        JSON.stringify(readings.map((r) => ({ door: ENTRY_OF[r.klass], class: r.klass, ...r.ar.detail }))),
      'per-stage (LC): ' +
        JSON.stringify(readings.map((r) => ({ door: ENTRY_OF[r.klass], class: r.klass, ...r.lc.detail }))),
      '',
      `MACHINE ${JSON.stringify({ readings, observed })}`,
      '',
    ];
    console.log(lines.join('\n'));
    expect(readings).toHaveLength(7);
  });

  /**
   * Reverse proof: the counters must move when the column they claim to read goes away.
   *
   * A reading that cannot fall is not a reading — it is a constant that happens to look like one.
   * These two mutations are applied to in-memory copies of the slices just measured; nothing in the
   * database is touched.
   *
   * 反向可证：所读的那一列没了，计数必须跟着掉。**掉不下来的读数不是读数**，只是长得像数字的常数。
   * 两处改动都施加在刚测出来的切片的内存副本上，不碰数据库。
   */
  it('⑨ 反向可证 — 抹掉一列，读数必须掉；补上缺失的列，读数必须回来', () => {
    const success = slices.success!;

    // (a) Drop `outcome` from the tool row: "what came of it" and the `outcome` stage must both fall.
    const withoutOutcome: Slice = {
      ...success,
      audits: success.audits.map((a) => (a.action === 'tool_call' ? { ...a, outcome: null } : a)),
    };
    const afterDrop = readingsFor('success', withoutOutcome);
    expect(afterDrop.ar.numerator).toBe(4); // 5 → 4
    // Two stages fall, not one: `execution` is reachable only through `outcome` as well, because
    // `ai_confirmation_requests.executed_at` stays null on this path even though the tool did run.
    // That coupling is a finding of its own, and this assertion pins it.
    //
    // 掉的是**两个**阶段，不是一个：`execution` 也只能从 `outcome` 读到 —— 这条路上
    // `ai_confirmation_requests.executed_at` 一直是 null，尽管工具确实执行了。这一耦合本身是一条读数。
    expect(afterDrop.lc.present).toBe(7); // 9 → 7

    // (b) Record a decider on the confirmation row: "who approved" must come back.
    const withoutConfirmation = { ...slices.timeout!, confirmations: [] };
    const timeoutNoConfirmation = readingsFor('timeout', withoutConfirmation);
    expect(timeoutNoConfirmation.lc.present).toBe(3); // 4 → 3: `confirmation-asked` was real

    const withApprover: Slice = {
      ...success,
      confirmations: success.confirmations.map((c) => ({ ...c, approverId: '91001' })),
    };
    const afterApprove = readingsFor('success', withApprover);
    expect(afterApprove.ar.detail['who-approved']).toBe(true);
    expect(afterApprove.ar.numerator).toBe(6); // 5 → 6

    // (c) The R4 door is the one where "who approved" is genuinely answered. Blank the approver and
    // the reading must fall — otherwise the 5/6 measured there would mean nothing.
    //
    // (c) R4 那扇门才是「谁批准」真答得出的一扇。把审批人抹掉、读数必须跟着掉 —— 否则那边测出的
    // 5/6 什么也没说明。数值见下。
    const r4 = slices['r4-approved']!;
    const r4NoApprover: Slice = {
      ...r4,
      confirmations: r4.confirmations.map((c) => ({ ...c, approverId: null })),
    };
    expect(readingsFor('r4-approved', r4).ar.detail['who-approved']).toBe(true);
    expect(readingsFor('r4-approved', r4NoApprover).ar.detail['who-approved']).toBe(false);
  });
});

function summarize(slice: Slice) {
  return {
    auditRows: slice.audits.map((a) => ({
      id: a.id,
      action: a.action,
      userId: a.userId,
      username: a.username ?? null,
      tool: a.tool ?? null,
      outcome: a.outcome ?? null,
      isError: a.isError,
      hasAuthorization: Boolean(a.authorization),
      hasHash: Boolean(a.hash),
      hasUsername: Boolean(a.username),
    })),
    confirmations: slice.confirmations.map((c) => ({
      id: c.id,
      tool: c.toolName,
      status: c.status,
      riskLevel: c.riskLevel,
      approverId: c.approverId ?? null,
      decidedAt: c.decidedAt ?? null,
      executedAt: c.executedAt ?? null,
    })),
    effects: slice.effects.map((e) => ({
      id: e.id,
      tool: e.toolName,
      resultType: e.resultType,
      resultId: e.resultId,
      revokeClass: e.revokeClass ?? null,
      revokeStatus: e.revokeStatus ?? null,
      hasSnapshot: Boolean(e.beforeSnapshot || e.afterSnapshot),
    })),
  };
}
