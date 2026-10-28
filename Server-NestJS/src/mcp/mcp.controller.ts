// SPDX-License-Identifier: Apache-2.0

import { Controller, Post, Body, Logger, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CallToolRequestSchema,
  InitializeResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolExposureService } from '../ai/tools/tool-exposure.service';
import { AuditService } from '../governance-shared/services/audit.service';
import { toolCallOutcome } from '../ai/audit/tool-call-audit';
import { ConfirmationStore } from '../ai/confirmation/confirmation.store';
import { R4ApprovalService } from '../ai/approvals/r4-approval.service';
import { ToolGateService } from '../ai/tools/tool-gate.service';
import {
  AuthorizationExplainerService,
  buildAllowSnapshot,
} from '../ai/authorization-explainer.service';
import { AuthorizationDeniedError, READ_ONLY_RISK_LEVELS } from '../ai/interfaces/tool.interface';
import {
  buildDenialExplanation,
  pickLanguageFromHeader,
  type DenialLanguage,
} from '../common/errors/denial-guidance';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Raw } from '../common/decorators/raw.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

interface McpJsonRpc {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

/** listMcpTools() 返回的治理契约字段（A2 风险分级 + 确认策略） */
interface McpToolGovernance {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  riskLevel: string;
  riskStrategy: string;
  requiresConfirmation: boolean;
}

/**
 * The credential a held call leaves behind: the token, and who may redeem it (`approver` = a second
 * person, `operator` = the requester).
 *
 * 被扣下的调用留下的凭据：token，以及谁有权兑它（`approver` = 第二个人，`operator` = 请求人本人）。
 */
interface HeldConfirmation {
  token: string;
  decidedBy: 'operator' | 'approver';
}

/** MCP serverInfo：版本单一真源 = package.json（此前硬编码 '0.9.1'，与产品版本漂移）。 */
const MCP_SERVER_INFO = {
  name: 'keelbase',
  version: ((): string => {
    try {
      const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as {
        version?: string;
      };
      return pkg.version ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  })(),
};
const MCP_PROTOCOL_VERSION = '2025-03-26';

/**
 * 治理能力 2.1「MCP 工具声明治理扩展」（ai-governance-protocol §4.4）：
 * MCP SDK 的 ToolSchema 无 passthrough，顶层 riskLevel 等自定义字段会被 Zod 剥掉；
 * 治理契约经 MCP 标准字段透出——
 *   - `annotations.readOnlyHint / destructiveHint`：MCP 标准提示（粗粒度）
 *   - `_meta.keelbase`：规范扩展槽（z.record 保留），携带权威的 R0-R5 契约
 */
function toMcpTool(tool: McpToolGovernance) {
  const readOnly = READ_ONLY_RISK_LEVELS.includes(tool.riskLevel);
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      readOnlyHint: readOnly,
      destructiveHint: tool.riskLevel === 'R5',
    },
    _meta: {
      keelbase: {
        riskLevel: tool.riskLevel,
        riskStrategy: tool.riskStrategy,
        requiresConfirmation: tool.requiresConfirmation,
      },
    },
  };
}

/**
 * HS-10 MCP 出口（HTTP JSON-RPC 子集）：
 * - POST /api/v1/mcp，JWT 认证（JwtAuthGuard 全局默认）
 * - initialize / ping / tools/list / tools/call
 * - 工具执行走 ToolExposureService.executeToolForExternal（权限门控 → 确认规则 → 执行）
 * - 每次调用落 AI 审计（provider=mcp），写工具返回需确认不自动执行
 */
@ApiTags('MCP')
@ApiBearerAuth()
@Controller({ path: 'mcp', version: '1' })
export class McpExportController {
  private readonly logger = new Logger(McpExportController.name);

  constructor(
    private readonly toolExposure: ToolExposureService,
    private readonly auditService: AuditService,
    private readonly authorizationExplainer: AuthorizationExplainerService,
    private readonly confirmationStore: ConfirmationStore,
    private readonly r4Approval: R4ApprovalService,
    private readonly toolGate: ToolGateService,
  ) {}

  @Post()
  // @Raw()：MCP 协议要求原始 JSON-RPC 响应，跳过全局 ResponseInterceptor 包装
  @Raw()
  @ApiOperation({ summary: 'HS-10 MCP 出口：现有 AI 工具暴露为 MCP server（JSON-RPC）' })
  async handle(
    @CurrentUser() user: JwtPayload,
    @Body() body: McpJsonRpc,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<unknown> {
    const method = body.method ?? '';
    const id = body.id ?? null;
    const lang = pickLanguageFromHeader(acceptLanguage);
    try {
      switch (method) {
        case 'initialize':
          return this._result(id, InitializeResultSchema.parse({
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: MCP_SERVER_INFO,
          }));
        case 'notifications/initialized':
        case 'notifications/cancelled':
          return {}; // 通知无需响应
        case 'ping':
          return this._result(id, {});
        case 'tools/list':
          return this._result(id, ListToolsResultSchema.parse({
            tools: (await this.toolExposure.listMcpTools()).map(toMcpTool),
          }));
        case 'tools/call':
          return await this._callTool(user, id, body.params, lang);
        default:
          return this._error(id, -32601, `Method not found: ${method}`);
      }
    } catch (e) {
      this.logger.warn(`[Mcp] ${method} failed: ${(e as Error).message}`);
      return this._error(id, -32603, (e as Error).message);
    }
  }

  private async _callTool(
    user: JwtPayload,
    id: number | string | null,
    params?: Record<string, unknown>,
    lang: DenialLanguage = 'en',
  ): Promise<unknown> {
    const parsed = CallToolRequestSchema.parse({
      method: 'tools/call',
      params,
    }) as { params?: { name?: string; arguments?: unknown } };
    const toolName = parsed.params?.name ?? '';
    const toolArgs = (parsed.params?.arguments ?? {}) as Record<string, unknown>;
    const userId = String(user.sub);

    let out;
    try {
      out = await this.toolExposure.executeToolForExternal(toolName, toolArgs, userId);
    } catch (e) {
      // T5 跨入口一致：MCP deny 也写审计 + 结构化 reasons（对齐 REST/SSE deny 分支 ai.service：authorization=JSON.stringify(reasons)）
      if (e instanceof AuthorizationDeniedError) {
        await this.auditService.log({
          userId,
          username: user.username,
          action: 'tool_call',
          detail: `${toolName}(${JSON.stringify(toolArgs).slice(0, 500)}) — authorization denied`,
          provider: 'mcp',
          source: 'mcp',
          isError: true,
          errorMessage: e.message,
          authorization: JSON.stringify(e.reasons),
          // C-4: a `tool_call` row owns the two off-chain attribution columns — without them the row
          // cannot say what happened, nor which tool it was about. The reasons name the gate:
          // `risk_policy` never reached a decision (`blocked`), every other refusal is `refused` —
          // the split `buildToolCallAudit` makes.
          // C-4：`tool_call` 行该答这两列链外归因列 —— 没有它们，这行说不出结局、也说不出是哪个工具。
          // reasons 点名是哪道闸：`risk_policy` 从没到过裁决（`blocked`），其余拒绝是 `refused`
          // —— 与 `buildToolCallAudit` 同一套分法。
          outcome: e.reasons.some((r) => r.name === 'risk_policy') ? 'blocked' : 'refused',
          tool: toolName,
        });
        // JSON-RPC `data` is free-form: carry the same `explanation` shape as the HTTP 403 / SSE
        // tool_end, so an MCP client can render why + the next step without parsing prose.
        //
        // JSON-RPC `data` 是自由字段：携带与 HTTP 403 / SSE tool_end 相同的 `explanation` 形状，
        // 使 MCP 客户端无需解析散文即可渲染「为什么 + 怎么解决」。
        const explanation = e.denial
          ? buildDenialExplanation(e.denial.kind, e.denial.params, lang)
          : undefined;
        return this._error(id, -32603, e.message, explanation ? { explanation } : undefined);
      }
      throw e;
    }

    // HS-10：MCP 调用落 AI 审计（provider=mcp 便于区分来源；username 快照 D2-1c——非 actor 路径，显式带出）
    // T5 跨入口一致：放行依据快照与 REST/SSE 同形（buildAllowSnapshot 单一构造）——仅实际放行且成功才写，
    // 否则 isError+authorization 非空会被 A-8 denied 视图与 blocked 聚合误判为越权/阻断。
    // executed ⇒ 未经确认门控 ⇒ 非写路径（写工具在 executeToolForExternal 里就返回 executed:false）→ isWrite=false。
    let allowSnapshot: string | undefined;
    if (out.executed && out.result?.success) {
      // 富化失败不得把「已执行成功」翻成调用方可见的错误（fail-after-execute：副作用已发生却报错，
      // 且审计不落）——降级为无快照，审计照写（Design for Recovery）。
      try {
        const reasons = await this.authorizationExplainer.getAuthorizationReasons(toolName, userId, false);
        allowSnapshot = buildAllowSnapshot(toolName, reasons);
      } catch {
        allowSnapshot = undefined;
      }
    }
    await this.auditService.log({
      userId,
      username: user.username,
      action: 'tool_call',
      // T5：确认门控（未执行）在 detail 标注，可被审计辨识（区别于普通读/成功写）
      detail: `${toolName}(${JSON.stringify(toolArgs).slice(0, 500)})${out.executed ? '' : ' — requiresConfirmation, not executed'}`,
      provider: 'mcp',
      source: 'mcp',
      isError: out.executed ? !out.result?.success : false,
      errorMessage: out.executed && !out.result?.success ? out.result?.error : undefined,
      // 工具内部自调 LLM 时的开销记在工具自己这行（与 REST/SSE 同形）
      promptTokens: out.result?.usage?.promptTokens,
      completionTokens: out.result?.usage?.completionTokens,
      authorization: allowSnapshot,
      // C-4: the row answers its own outcome. Held for confirmation (`!executed`) is `pending`; an
      // execution answers `toolCallOutcome` — the one spelling the chat path and the R4 executor
      // share, so the three ends cannot word one outcome three ways.
      // C-4：本行自己答结局。被扣下等确认（`!executed`）是 `pending`；执行过则由 `toolCallOutcome`
      // 答 —— 对话那条路与 R4 执行器共用的那一个词，三端才不会把一个结局写成三种说法。
      outcome: !out.executed ? 'pending' : toolCallOutcome(out.result ?? { success: false }),
      tool: toolName,
    });

    if (!out.executed) {
      // Holding a call is only half a promise unless the client gets something to hold. Park a
      // durable artifact now — after the audit row, so a crash here loses the credential rather than
      // losing the record — and return its token. Failure degrades to exactly the old behaviour
      // instead of a token nobody can redeem.
      //
      // 只说「需确认」是半句承诺，除非客户端拿得到可裁决的东西。这里落一个持久 artifact 并把 token
      // 返给客户端；**放在审计行之后**——此处崩溃丢的是凭据，而不是记录。建不出来时退回旧行为，
      // 而不是给出一个谁也兑不了的 token。
      let held: HeldConfirmation | undefined;
      try {
        held = await this._parkForConfirmation(userId, toolName, toolArgs);
      } catch (e) {
        this.logger.warn(`[Mcp] could not park a confirmation for ${toolName}: ${(e as Error).message}`);
      }
      return this._heldResult(id, toolName, held);
    }
    const text = JSON.stringify(out.result?.data ?? out.result?.error ?? {});
    return this._result(id, {
      content: [{ type: 'text', text }],
      isError: !out.result?.success,
    });
  }

  private _result(id: number | string | null, result: unknown): unknown {
    return { jsonrpc: '2.0', id, result };
  }

  /**
   * Park the artifact the hold promises, and say **who** may redeem it.
   *
   * Two tiers, and the split is the point: an approval-tier tool parks an *approval request* that
   * only a second person can decide (`POST /ai/confirmations/:token/approve-by`); a confirmation-tier
   * tool parks the operator's own confirmation, decidable out of band
   * (`POST /ai/my/confirmations/:token/decide`). Parking the wrong one is not a cosmetic mistake —
   * it lets the requester self-approve a dual-control action.
   *
   * 落「被扣下」这句承诺对应的 artifact，并说清**谁**能兑。两档的分法就是重点：审批档留的是**他人**
   * 才能裁决的审批请求；确认档留的是操作者本人的确认（可离线裁）。留错档不是措辞问题 —— 那是让请求人
   * 自己批掉一个双人控制动作。
   */
  private async _parkForConfirmation(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<HeldConfirmation> {
    // AUTHZ-1：目的地绑定随之落行 —— 等待窗口内目的地可被改指，执行点要拿它比对。
    const audience = this.toolGate.destinationOf(toolName);
    // Ask the same gate the hold came from. `executeToolForExternal`'s return shape is bound to the
    // frozen `tool-invocation` contract (`executed / requiresConfirmation / result`), so the tier
    // cannot ride along on it — and re-deriving it here is not a second rule, it is the same one.
    //
    // 问的是发出这次扣留的同一道门。`executeToolForExternal` 的返回形状受 `tool-invocation` 冻结契约
    // 约束（只有 executed / requiresConfirmation / result），档位搭不了它的便车；在这里再问一次不是
    // 第二套规则，是同一条。
    if (await this.toolGate.requiresApproval(toolName)) {
      const { token } = await this.r4Approval.createR4ApprovalRequest(
        userId,
        toolName,
        args,
        undefined,
        audience,
      );
      return { token, decidedBy: 'approver' };
    }
    // `decision` is deliberately dropped: there is no in-stream wait on this door. The row is the
    // artifact; the promise the store keeps on our behalf expires on its own.
    //
    // 有意丢掉 `decision`：这扇门没有「流内等待」。行才是 artifact；store 替我们留的那份 promise 到点自解。
    const { token } = await this.confirmationStore.create(
      userId,
      toolName,
      args,
      undefined,
      undefined,
      audience,
    );
    return { token, decidedBy: 'operator' };
  }

  /** The `CallToolResult` for a held call — with the token in `_meta` (the spec's extension slot). */
  private _heldResult(
    id: number | string | null,
    toolName: string,
    held?: HeldConfirmation,
  ): unknown {
    const base = `Tool "${toolName}" requires confirmation and was not executed.`;
    if (!held) {
      return this._result(id, { content: [{ type: 'text', text: base }], isError: false });
    }
    const who =
      held.decidedBy === 'approver'
        ? 'A second person (an approver) has to decide it; the requester cannot approve it themselves.'
        : 'Approve or decline it out of band; until then nothing has run.';
    return this._result(id, {
      content: [
        {
          type: 'text',
          text: `${base} Confirmation token: ${held.token}. ${who} Confirming it runs the tool through the same write pipeline.`,
        },
      ],
      isError: false,
      _meta: {
        keelbase: {
          requiresConfirmation: true,
          status: 'pending',
          confirmationToken: held.token,
          decidedBy: held.decidedBy,
        },
      },
    });
  }

  private _error(
    id: number | string | null,
    code: number,
    message: string,
    data?: Record<string, unknown>,
  ): unknown {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message, ...(data ? { data } : {}) },
    };
  }
}
