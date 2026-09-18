# AI 异常行为基线（规则型 MVP）— 功能规格 / AI Behavior Baseline (rule-based MVP) — Functional Specification

> 定位：**Authorization → Behavior 升维**。现有治理回答「这个动作**能不能**做」（CASL + 数据范围 + 治理策略）；
> 本能力回答「这个动作**像不像正常的它**」——**权限已允许，行为仍可疑时照样告警**。
> 只观测、不阻断：检出后走告警通道，不改门控语义、不进热路径。

## 1. 目标与非目标 / 1. Goals & Non-goals

**目标**：把 `ai_audit_logs`（已在积累）与 `ai_tool_side_effects` 里可观测的行为，按三条确定性规则扫出异常，
落库成**可追溯的告警事件**，并推给管理员（站内 + webhook）。

**非目标**（明确不做，防伪深化）：
- 不做统计/ML 基线（roadmap 明确「先规则后统计/ML」）；本版全部规则是**确定性阈值**，无学习、无概率。
- **不阻断**任何动作：检出与门控**完全分离**——告警不改 `_assertToolAllowed`、不写确认门控、不拦工具调用。
- 不做实时流式检测（定时扫描即可；不进 AI 调用热路径）。
- 不做告警的自动处置（只标记「已处理/忽略」，由人决定）。

## 2. 规则 / 2. Rules

三条规则都**只看既有数据**，不需要新的埋点。阈值全部经 Settings 可配（见 §4）。

| ID | 规则 | 数据来源 | 口径 | 默认阈值 |
|---|---|---|---|---|
| **R-1** | 单会话写操作密集 | `ai_audit_logs`（`action='tool_call'`，按 `conversationId` 分组） | 扫描窗口内，**同一会话**的工具调用数 > 阈值 | 20 |
| **R-2** | 高危工具被拒后反复尝试 | `ai_audit_logs`（`isError=true`，工具名由 `detail` 还原）+ 工具注册表判高危 | 扫描窗口内，**同一用户×同一高危工具**的失败调用数 > 阈值 | 3 |
| **R-3** | 短时写入规模异常 | `ai_tool_side_effects`（按 `conversationId` 分组） | 扫描窗口内，**同一会话**产生的副作用行数 > 阈值 | 30 |

**R-2 为什么不是 roadmap 写的「删除类动作频次」**：核实后发现那条规则按现有数据**很勉强**——
内置唯一的删除工具 `delete_customer` 是 **R5 恒定阻断**（永不执行，只留 `tool_call` 且 `isError=true`），
而代理工具的 HTTP DELETE 方法**根本不进审计**（`detail` 只记工具名 + args）。
**反复去试一个被拒绝的高危操作**，恰恰是比「删除了多少次」更准的异常信号——它不需要真的删成功。
故 R-2 改为「高危工具（riskLevel ∈ R4/R5）被拒后的反复尝试」，语义更强且数据现成。

**R-3 为什么不从审计算「写入量」**：审计行只有 args JSON，**没有归一化的写入量**；
真实行数在 `ai_tool_side_effects`（该表有 `conversationId` 索引），故直接从那里按会话计行数。

## 3. 诚实的边界 / 3. Honest Boundaries

这几条**必须随能力一起说**，否则「能力」会被读成「保证」：

1. **审计粒度 `off` 时本能力失明**：`_shouldAudit('tool')` 受治理档位控制，`granularity='off'` 时**根本没有 `tool_call` 行**→
   R-1/R-2 扫不到东西。此时**不是「没有异常」，而是「看不见」**——规格与 UI 都不宣称「无异常」。
2. **工具名靠文本还原**：`ai_audit_logs` 没有独立的 `toolName` 列，工具名从 `detail`（`` `${tool}(${args})` ``）正则解析，
   格式漂移会**静默漏检**（而非误报）。规则实现对此有单测钉住。
3. **R-3 是「会话级」不是「单动作级」**：副作用表没有「动作 id」，只有 `compensationGroup`（同组 = 一次补偿）。
   本版按 `conversationId` + 时间窗计数，故它衡量的是「这个会话短时写了很多行」，不是「某一次动作特别大」。
4. **告警≠结论**：规则型基线只能说明「行为模式偏离了设定阈值」，**不能**说明「这是恶意的」。
   文档与 UI 一律不用「攻击 / 入侵 / 违规」这类措辞。
5. **不覆盖**：人类 REST 写（那走 `operation_audit`，本能力只管 AI 侧）。R-1 计的是**全部**工具调用
   （读写都算，衡量的是「这个会话是不是失控地在调工具」），不区分读写。

## 4. 阈值与开关（Settings）/ 4. Thresholds & Switches

全部落在既有 `Settings`（`SETTING_KEYS`），无配置时用本规格的默认值：

| Setting key | 默认 | 说明 |
|---|---|---|
| `ai_behavior_scan_enabled` | `true` | 总开关（关掉则不扫描、不告警） |
| `ai_behavior_window_minutes` | `10` | 扫描窗口长度（三条规则共用） |
| `ai_behavior_max_tools_per_conversation` | `20` | R-1 阈值 |
| `ai_behavior_max_failed_highrisk` | `3` | R-2 阈值 |
| `ai_behavior_max_side_effects` | `30` | R-3 阈值 |
| `ai_behavior_cooldown_minutes` | `60` | **去重冷却**：同一 (规则 × 主体) 在冷却期内只落一条告警，避免刷屏 |

## 5. 检测时机与去重 / 5. Cadence & De-duplication

- **定时扫描**（`@Cron`，对齐既有维护任务惯例）：看**固定窗口** `[now - window, now]`。
  固定窗口的好处是幂等——重复扫描同一段数据不会改变判定结果。
- **去重**：落库前先查「同 `rule` + 同 `subject`（会话或用户）+ `createdAt` 在冷却期内」的告警；
  命中则跳过。冷却期保证一个持续异常不会每 15 分钟刷一条。
- 扫描**只读**审计与副作用表；唯一写入是告警表本身。

## 6. 告警形状（wire）/ 6. Alert Shape

见 wire 契约 `specs/protocol/schemas/v1/ai-behavior-alert.schema.json`（`ai-behavior-alert` v1）：
`{ rule, level, subject, conversationId?, title, detail, evidence, status, createdAt, decidedAt? }`。

- `rule`：`R-1 | R-2 | R-3`（与本文档同一 ID，便于对账）
- `level`：`warning | critical` —— 由**超出阈值的倍数**决定：超出 < 2× 为 `warning`，≥ 2× 为 `critical`
- `evidence`：规则判定的**可核对依据**（如 `{count, threshold, windowMinutes, sampleRowIds[]}`）——
  告警必须能被人自己复算，否则不可辩驳。

## 7. 落点 / 7. Where It Lands

| 去向 | 载体 | 说明 |
|---|---|---|
| **落库（事实源）** | 新表 `ai_behavior_alerts` | 可追溯：事后能答「那时是否告警过、依据是什么」 |
| **管理员站内** | `NotificationsService`（发给所有 ADMIN，type `ai_anomaly_alert`） | 自动获得铃铛/SSE/WS/设备推送 |
| **对外** | `AlertWebhookService.sendAlert()` | 钉钉/飞书/Slack，自带防抖；未配置则静默跳过 |
| **管理台** | 新页「行为异常」（Guard 组） | 未处理/全部筛选、级别、证据下钻、标记已处理 |

## 8. 验收 / 8. Acceptance

- **单测（规则边界）**：恰好等于阈值**不**告警、超一个即告警、窗口外的数据不计入；R-2 只认高危工具（低危失败不告警）；
  去重冷却期内不重复落库；开关关闭时不扫描。
- **单测（文本解析）**：`detail` 形态漂移时 R-2 静默漏检而非误报（钉住边界）。
- **e2e**：真造一次异常（同会话多写 / 反复触发被拒的高危工具）→ 跑扫描 → 断言告警**落库** + 冷却期内**不重复** + 管理员**收到通知**。
- **前端**：`typecheck` + vitest（列表渲染、级别 chip、标记已处理调用）。
- **全量回归** + 三闸（semantic-single-source / language / evidence-canonical）。

## 9. 关联 / 9. Related

- 数据源：`src/ai/audit/ai-audit-log.entity.ts`｜`src/ai/tool-effects/ai-tool-side-effect.entity.ts`
- 通道：`src/alert-webhook/alert-webhook.service.ts`｜`src/notifications/notifications.service.ts`
- 扫描宿主：`src/maintenance-tasks/maintenance-tasks.service.ts`
- 治理面（**不改**）：`AiService._assertToolAllowed`（门控）｜`docs/ai-governance-protocol.md`
- 不承诺清单：告警是**观测**，不新增安全承诺；措辞见 §3.4
