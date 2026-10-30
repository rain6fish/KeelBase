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
 *     Denominator per class = questions that apply to that class. Since 2026-10-30 there is a
 *     **seventh** question, `who-approved-second`, asked only of classes that require a second
 *     person: widening `who-approved` to the decider (operator or approver) made a missing
 *     `approver_id` invisible there, so the second-person credential now has its own count.
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
 *
 * 2026-10-30 起有**第七问** `who-approved-second`，只问那些**需要第二个人**的类：把 `who-approved`
 * 放宽到「裁决人」（操作人或审批人）之后，`approver_id` 掉了在那里已经看不出来，所以第二人凭据
 * 现在自己有了一格计数。
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

/**
 * The six questions, in the product's own words (P0-20 §六问), plus one the product's language does
 * not ask but governance does: `who-approved-second` — was there a **second person**, the credential
 * R4's two-person approval turns on. It is asked only of classes that require one, so it enters no
 * other class's denominator.
 *
 * 产品自己语言里的六问（P0-20 §六问），加一问产品语言不问、治理要问的：`who-approved-second` ——
 * 有没有**第二个人**，也就是 R4 双人审批赖以判定的那份凭据。只对需要双人审批的类提问，故不进别的类
 * 的分母。
 */
const AR_QUESTIONS = [
  'who',
  'what',
  'why-allowed',
  'who-approved',
  'who-approved-second',
  'result',
  'how-proved',
] as const;
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

/**
 * Which classes must have a **second person** approve. Only R4 does: the other classes ask the
 * operator to confirm their own action, which is a decision but not a second approval. Anything not
 * listed here answers `null` to `who-approved-second` and drops out of that class's denominator.
 *
 * 哪些类必须有**第二个人**批准。只有 R4：其余各类是操作人确认自己的动作，那是裁决，但不是第二人
 * 批准。没列在这里的类对 `who-approved-second` 答 `null`，不进该类分母。
 */
const SECOND_APPROVER_REQUIRED: Record<ClassKind, boolean> = {
  success: false,
  blocked: false,
  timeout: false,
  'mcp-blocked': false,
  'mcp-held': false,
  'mcp-read': false,
  'r4-approved': true,
};

function answerAr(klass: ClassKind, slice: Slice): { asked: boolean; answers: Record<ArQuestion, ArAnswer> } {
  const toolRow = finalToolRow(slice);
  const conf = slice.confirmations[0];
  const eff = slice.effects[0];
  const asked = Boolean(conf);

  // Arguments count as structured only when they are a machine-shaped column: the audit row's own
  // `tool_args`, the confirmation row's JSON args, or the effect row's args hash. `ai_audit_logs.detail`
  // spells them inside prose — `tool({...})` — and reading that is the parsing this measurement exists
  // to price.
  //
  // ⚠ **Predicate change, 2026-10-28**: `ai_audit_logs.tool_args` was added to this list when the
  // column was added. Before that the predicate named only the two places arguments could live, because
  // those were the only two; a row that had neither was unanswerable by construction. This is a change
  // to the **ruler**, not to the count it takes — re-pin any baseline taken before it.
  //
  // 参数只有在**机器形状的列**里才算结构化：审计行自己的 `tool_args`、确认行的 JSON args，或副作用行的
  // args 哈希。`ai_audit_logs.detail` 把参数拼在散文里 —— `tool({...})` —— 去读它正是本次测量要计价的解析。
  //
  // ⚠ **谓词变更（2026-10-28）**：加这一列时把 `ai_audit_logs.tool_args` 列进了这份清单。此前它只点名
  // 参数可能存在的两处，因为那时只有那两处；两处都没有的行是**构造上答不出**。这是改**尺子**、不是改
  // 它量出的数 —— 此前取的基线都要重钉。
  const auditArgs = toolRow && safeJson(toolRow.toolArgs) ? 'ai_audit_logs.tool_args' : null;
  const structuredArgs =
    auditArgs ??
    (conf && safeJson(conf.args) ? 'ai_confirmation_requests.args' : eff?.argsHash ? 'ai_tool_side_effects.args_hash' : null);

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
        //
        // ⚠ **Predicate change, 2026-10-30** — this used to read `approver_id` alone, and that
        // column does not mean "who decided". It is the **second person** credential R4's two-person
        // approval turns on (`ConfirmationStore.isSecondPersonApproval`, consulted at the execution
        // point by `ToolGate.assertApprovalRequirementHolds`), and the in-stream and out-of-band
        // decision paths deliberately leave it null: a person confirming their own R3 action lands
        // `approved` too, but is not a second approver. So the old predicate reported a **false
        // negative** — it said "who approved" was unanswerable for a self-confirmed action even
        // though the record names the decider exactly (`operator_id` + `decided_at`). Widening it
        // does not touch the writer, and must not: writing `approver_id` where a person confirms
        // their own action would satisfy the second-person gate for every self-approval, which is a
        // way around it.
        //
        // The status test is what keeps "nobody decided" answered as **nobody**: `expireStale` writes
        // `decided_at` on a row that timed out, so `decided_at` alone would call an expired hold
        // approved. A class that ended in `timeout` still answers false — that is its answer, not a
        // missing fact.
        //
        // ⚠ **谓词变更（2026-10-30）** —— 此前只读 `approver_id`，而那一列的意思不是「谁裁决」。
        // 它是 R4 双人审批赖以判定的**第二个人**凭据（`isSecondPersonApproval`，执行点
        // `assertApprovalRequirementHolds` 会查），而对话内与离线裁决两条路**有意留空**：本人确认
        // 自己的 R3 动作同样落 `approved`，但不是第二审批人。所以旧谓词报的是**假阴性** —— 自批的
        // 动作它答不出「谁批准」，尽管记录精确地点着裁决人（`operator_id` + `decided_at`）。放宽这一问
        // **不碰写入端**，而且不能碰：在本人自批处写 `approver_id`，会让每一次自批都满足第二人判定，
        // 那就是绕过它的一条路。
        //
        // 状态判断是为了让「无人裁决」仍然答成**没人**：`expireStale` 会给超时行也写 `decided_at`，
        // 只看它会把一个到期的等待当成已批准。收场为 `timeout` 的类照样答 false —— 那是它的答案，
        // 不是缺一个事实。
        value: asked
          ? Boolean(
              conf &&
                (conf.status === 'approved' || conf.status === 'declined') &&
                conf.decidedAt &&
                (conf.approverId ?? conf.operatorId),
            )
          : null,
        from: 'ai_confirmation_requests.status + decided_at + (approver_id ?? operator_id)',
      },
      'who-approved-second': {
        // The same predicate the execution point uses — `ConfirmationStore.isSecondPersonApproval`
        // answers `status === 'approved' && approverId != null`, and `ToolGate` refuses the run when
        // it answers false. Measuring the gate's own condition (rather than a near-miss) is the point:
        // if this reading goes to 0, a class that requires a second person is running without the
        // credential the gate wants.
        //
        // `null` for every class that does not require one, so the question enters no other
        // denominator — asking "was there a second person" of a self-confirmed R3 action would be
        // charging the record for a stage the event never had.
        //
        // 与执行点**同一个**谓词：`ConfirmationStore.isSecondPersonApproval` 答的是
        // `status === 'approved' && approverId != null`，`ToolGate` 在它为假时拒绝执行。量闸自己那条
        // 条件（而不是一个近似值）才是要害：这一读若掉到 0，就是某个要求双人的类正在没有闸要的那份凭据
        // 的情况下跑。
        //
        // 不需要第二人的类一律答 `null`，故这一问不进它们的分母 —— 对一个自批的 R3 动作问「有没有第二
        // 个人」，是在罚记录一个它从未有过的阶段。
        value: SECOND_APPROVER_REQUIRED[klass]
          ? Boolean(conf?.status === 'approved' && conf?.approverId)
          : null,
        from: 'ai_confirmation_requests.status + approver_id (second person only)',
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
  const ar = answerAr(klass, slice);
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
    expect(afterDrop.ar.numerator).toBe(5); // 6 → 5
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
    // Pinned as "one less than the real reading", not as a literal: the class's total moves whenever
    // a gap is closed (2026-10-28 closed `policy-decision`), and what this proof has to show is
    // **which** stage the mutation removes, not what today's total happens to be.
    //
    // 钉「比真实读数少一阶」，不钉字面总数：这一类的总数会随缺口被补上而变（2026-10-28 补上了
    // `policy-decision`），而这条证明要说明的是**掉的是哪一阶**，不是某个时刻的总数。
    expect(timeoutNoConfirmation.lc.present).toBe(readingsFor('timeout', slices.timeout!).lc.present - 1);
    expect(timeoutNoConfirmation.lc.detail['confirmation-asked']).toBe(false);

    // (c) Blank the decider: "who approved" must fall. Since 2026-10-30 the predicate reads
    // `approver_id ?? operator_id`, so removing **both** is what makes it unanswerable — setting
    // `approver_id` alone no longer moves this reading, because the operator already names the
    // decider. Asserting the fall keeps the widened predicate falsifiable instead of always-true.
    //
    // (c) 抹掉裁决人：「谁批准」必须掉。2026-10-30 起谓词读 `approver_id ?? operator_id`，所以要使它
    // 答不出，得把**两个都**抹掉 —— 只设 `approver_id` 已经不移动这一读了，因为操作人本就点着裁决人。
    // 断言它会掉，是为了让放宽后的谓词仍然可证伪，而不是恒真。
    expect(readingsFor('success', success).ar.detail['who-approved']).toBe(true);
    const withoutDecider: Slice = {
      ...success,
      confirmations: success.confirmations.map((c) => ({ ...c, approverId: undefined, operatorId: '' })),
    };
    expect(readingsFor('success', withoutDecider).ar.detail['who-approved']).toBe(false);

    // (d) The status test: a row that ended `timeout` is **not** an approval even when it carries a
    // decider — `expireStale` writes `decided_at` on it. Without this clause the reading would call
    // an expired hold "approved", which is the one way the widened predicate could lie.
    //
    // (d) 状态判断：收场为 `timeout` 的行**不是**批准，即使它带着裁决人 —— `expireStale` 会给它写
    // `decided_at`。没有这一条，读数会把一个到期的等待读成「已批准」，那正是放宽后的谓词唯一会撒谎
    // 的方式。
    const timeout = slices.timeout!;
    const timedOutWithDecider: Slice = {
      ...timeout,
      confirmations: timeout.confirmations.map((c) => ({ ...c, approverId: '91001' })),
    };
    expect(readingsFor('timeout', timeout).ar.detail['who-approved']).toBe(false);
    expect(readingsFor('timeout', timedOutWithDecider).ar.detail['who-approved']).toBe(false);

    // (e) The second-person question is the one that **must** fall when `approver_id` alone goes away,
    // and this is exactly the case widening `who-approved` made invisible: `who-approved` still
    // answers true through the operator, so only `who-approved-second` reports the missing credential.
    //
    // (e) 第二人那一问，正是在 `approver_id` 单独消失时**必须**掉的那一格 —— 而这恰恰是放宽
    // `who-approved` 之后看不见的那种情况：`who-approved` 由操作人顶着仍答 true，只有
    // `who-approved-second` 报出凭据没了。
    const r4 = slices['r4-approved']!;
    expect(readingsFor('r4-approved', r4).ar.detail['who-approved-second']).toBe(true);
    const r4NoApprover: Slice = {
      ...r4,
      confirmations: r4.confirmations.map((c) => ({ ...c, approverId: undefined })),
    };
    const r4NoApproverReading = readingsFor('r4-approved', r4NoApprover);
    expect(r4NoApproverReading.ar.detail['who-approved-second']).toBe(false);
    expect(r4NoApproverReading.ar.detail['who-approved']).toBe(true); // the operator still names a decider
    expect(r4NoApproverReading.ar.numerator).toBe(readingsFor('r4-approved', r4).ar.numerator - 1);
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
