# 多系统单控制面演示 / Multi-System, One Control Plane

> **定位（MOAT-3，治理能力 2.2 收口实证）**：演示「一个独立治理控制平面同时管住 N 个异构业务系统的 AI」——统一审计、共享门控、跨系统决策进同一哈希链。这是 D-2 控制平面「最强锁定」的可运行证明。
> **Positioning (MOAT-3, capabilities 2.2 closure proof)**: demonstrate one standalone governance control plane governing the AI of N heterogeneous business systems — unified audit, shared gating, cross-system decisions in a single hash chain. A runnable proof of the D-2 control plane's strongest lock-in.

## 拓扑 / Topology

```
治理控制平面 :3100（独立治理库，一个控制面）
        │  x-api-key 服务身份
    ┌───┴────────────┐
sidecar A :3200     sidecar B :3201     ← 语言无关，任意 OpenAI 兼容 client
    │                    │
系统 A「Node 商城」      系统 B「Java CRM」  ← 业务系统只改 LLM base_url，零代码接入
    └────── 共同 → mock 上游 LLM :4390
```

## 演示要点 / What the Demo Shows

| # | 断言 | 观察 |
|---|---|---|
| 1 | **统一审计** | 一次治理库查询同时看到两个系统的 AI 活动，按 `x-user-id` 归因区分（`mall-bot` / `crm-bot`） |
| 2 | **共享门控语义** | 两系统的写工具（`send_email` / `update_contract`）都按同一协议风险级 **R3** 触发确认门控，未批准不放行 |
| 3 | **跨系统确认 + 执行** | 两个系统各自批准后取回 `tool_calls` 执行，决策全部进同一治理哈希链 |
| 4 | **语言无关** | System B 标记为 Java 业务系统——sidecar 只认 OpenAI 兼容协议，不关心业务语言 |

## 运行 / Run

```bash
cd Server-NestJS
npm run build        # 一次（spawn dist/governance 与 dist/governance-sidecar）
node scripts/demo-multi-system.mjs
# 可选端口：GOV_PORT / SIDECAR_PORT_A / SIDECAR_PORT_B / MOCK_PORT
```

脚本自动起治理台 + 两个 sidecar + mock LLM（无需真实 API Key），模拟两个系统各发一次 AI 调用（都触发 R3 写工具 → 确认 → 批准执行），最后打印统一审计视图 + 哈希链连续性，并写 `docs/benchmark/moat3-multisystem-*.json`。

## 与真实多系统接入的对应 / Mapping to Real Integration

| 演示角色 | 真实接入 |
|---|---|
| sidecar A / B | 每个业务系统自己的 sidecar（或复用治理台 external 上报端点） |
| `SIDECAR_TOOLS` | 业务系统工具清单 → 风险级（对齐 [ai-governance-protocol.md](../protocols/ai-governance-protocol.md) §4） |
| 治理台策略 | `GET /api/v1/external/governance/policy` 实时下发，改策略 60s 内生效 |
| Java 存量系统 | [keelbase-java-starter](https://github.com/rain6fish/KeelBase-java-starter)（`@KeelbaseTool` + 委托验签 + 审计上报）走同一条治理管线 |
| 跨系统撤销 | D-2 双向回调（治理台 DELETE → 业务系统 `GOVERNANCE_TARGET_URL` revoke），java-starter 补偿脚手架已具备 |

## 相关 / Related

- [governance-deploy.md](governance-deploy.md) — 治理控制平面部署与接入
- [adoption-30min.md](adoption-30min.md) — 单个业务系统 30 分钟接入（MOAT-1）
- [ai-governance-protocol.md](../protocols/ai-governance-protocol.md) — 治理协议 + 兼容实现清单
