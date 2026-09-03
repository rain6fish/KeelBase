# 国内 OpenAI 兼容 Provider 工具调用兼容对比验证

**日期**：2026-09-02
**验证人**：项目（真实 key，逐 provider 实测 OpenAI 兼容端点工具调用）
**目的**：折中 Claude/Gemini 海外 key 限制——验证国内 OpenAI 兼容 provider 能否作「第二真实 LLM」（工具调用是黄金流程核心环节）。

## 结论 / Conclusion

| Provider | 对话 | 工具调用（function calling） | 判定 |
|---|---|---|---|
| **智谱 GLM**（glm-4-flash，open.bigmodel.cn/api/paas/v4） | ✅ | ✅ **标准**（触发 + 结果回填闭环） | ✅ **可靠第二 provider** |
| Qwen DashScope（/compatible-mode） | ✅ | ❌ 不触发（finish:None + tool_calls:null，多模型多参数复现） | ⚠️ 需适配 |
| Kimi Moonshot（api.moonshot.cn，**kimi-k2.6**） | ✅ | ✅ **标准**（触发 + 结果回填闭环） | ✅ 可靠 provider（标准平台 key） |
| **Gemini**（原生 + OpenAI 兼容，AQ Auth Key） | ⚠️ 生成 403 | — | ❌ **Google 项目级 denied**（2026-09-03 诊断） |

**Gemini AQ Auth Key 专项诊断（2026-09-03，纠正 AIza 误判）**：Google 2026 已从 `AIza` Standard Key 迁移到 `AQ` Auth Key（AI Studio 新 key 默认 AQ，官方文档确认，2026-09 将拒绝 Standard Key）——**AQ 前缀正常，非异常**。区分测试：
- AQ key + `x-goog-api-key`（原生端点）：**认证通过**（模型过时报 404 NOT_FOUND 而非 401）
- 同 key 生成 gemini-3.6-flash：**403 project has been denied access**（原生 + OpenAI 兼容均复现，两 key 一致）
- AQ key + Bearer：401（AQ 非 OAuth token，Bearer 不适配）

**结论**：AQ key 认证机制正常，**project 生成权限被 Google 侧拒绝**（风控/配额，需 contact support）——非 KeelBase/调用方式问题。**KeelBase 适配待办**：gemini provider 走 OpenAI 兼容层 + Bearer，而 AQ key 官方认证用 `x-goog-api-key`——项目恢复/海外可用后需验证 KeelBase gemini 接入是否适配 AQ key（可能需原生端点 generateContent 适配）。

**验证样本（GLM，OpenAI 兼容端点）**：
1. 工具触发：`finish: tool_calls`，正确返回 `{"name":"query_customers","arguments":{"keyword":"east"}}`
2. 工具结果回填闭环：assistant tool_call → tool 消息回填 → `finish: stop` + 正确总结（"customer Acme, risk high"）

## 完整 golden-crm 端到端验证（2026-09-03，真实 key + 独立后端）

| 模型 | 结果 | 详情 |
|---|---|---|
| **glm-5.1** | ✅ **8/8 全过** | 登录→seed→读工具→确认门控→写执行→审计→撤销→时间盒全闭环；DB 核实：任务真实创建（customerId 正确取用）+ 副作用登记 + 撤销软删；报告 `docs/benchmark/golden-crm-2026-09-03T04-22-57-001Z.md` |
| glm-4-flash | ⚠️ 6/8 | **参数幻觉**：读工具后 create_followup_task 编造 `customerId:12345`（真实 id 1-11）→ "客户不存在" 写失败。工具触发/门控/审计全通，仅写参数失真 |

> 结论：**GLM-5.1（glm-5 系新一代）工具调用上下文保持可靠，可作第二真实 provider 完整跑通黄金流程**；glm-4-flash 多步工具场景参数幻觉——选模型需 ≥ glm-5 系。

## KeelBase 配置层含义 / Implication

- **GLM 可用 `AI_PROVIDER=openai` + `OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4` + `OPENAI_API_KEY`（智谱 key）+ `AI_CHAT_MODEL=glm-4-flash`**——任意 OpenAI 兼容端点走既有 openai provider + base_url 覆盖，无需新 provider 注册。工具调用链路与 DeepSeek（golden-crm 8/8）同标准。
- **Qwen DashScope `/compatible-mode` 工具调用不兼容**（openai-compatible 标准 tools 透传不触发）；`AI_PROVIDER=qwen` 声明需打标，真支持需评估 DashScope 原生协议或 Qwen 专用 tools 格式——需求驱动。
- Kimi：**kimi-k2.6（标准平台 key）已验证 ✅** 工具调用 + agent 闭环（2026-09-03）——注意会员 key（`sk-kimi-` 前缀）不走平台端点，需 platform.moonshot.cn 标准 `sk-` key。

## 建议 / Next

1. **第二真实 provider = 智谱 GLM**：真实 key 已验工具调用 + agent 闭环；完整 golden-crm 8/8（GLM）可在配了 GLM 的后端/部署环境跑（HTTP 集成侧 DeepSeek 已证）。
2. 多 provider 支持现状：**DeepSeek（完整闭环 ✅）+ GLM（工具调用 ✅）+ demo（零配置 ✅）** 已构成可靠矩阵；Qwen 记录待适配。
3. Claude/Gemini：注册了官方 OpenAI 兼容端点（海外 key），同链路待海外访问验证，不阻塞。

---
*事实性验证记录 · 2026-09-02 · 真实 key 实测*
