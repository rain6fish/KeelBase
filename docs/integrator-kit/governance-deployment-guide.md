# Integrator Kit：Governance & Deployment Guide（治理与部署指南）

> 面向集成商的指南：接入外部系统后，**治理如何自动落到接入的工具** + **如何交付部署**。
> For integrators: how governance applies to connected tools automatically, and how to deliver deployment.
>
> 原则：接入的工具**默认自动获得治理**（风险级/确认/审计/撤销）——不是集成商额外实现，是 KeelBase 运行时提供。

## 一、接入即治理 / Governance by Default

外部系统经 AI Bridge / OpenAPI / SQL / Capability 接入后，每个工具自动进入治理链路：

```
AI 请求 → 工具调用 → 权限检查（CASL + 角色白名单）
  → 风险级（R1 读自动 / R3 写确认 / R4 双人审批 / R5 阻断）
  → 人工确认（写操作）
  → 执行 + 副作用登记（可撤销）
  → 审计哈希链（防篡改，可验证）
```

| 治理维度 | 默认行为 | 说明 |
|---|---|---|
| **风险级** | 读=R1 自动 / 写=R3 确认 | 生成器自动标注；`riskLevel` 可显式覆盖 |
| **人工确认** | R3/R4 写操作需确认 | 不确认不执行；R4 双人审批（operator ≠ approver） |
| **权限范围** | CASL 行级 + `allowedRoles` 白名单 | 工具只作用于调用者有权访问的数据 |
| **审计** | 每步 tool_call 落审计哈希链 | 管理台 AI 审计 / 行为回放可见（Human→Agent→System） |
| **撤销** | 副作用可撤销 | 内部实体软删；外部系统走 revokePath 补偿端点（[java-compensation-example.md](java-compensation-example.md)） |

**策略可配置**（管理台「策略中心」Policy Center，保存即实时生效）：工具启用/禁用、是否需确认、角色白名单、审计粒度（全部/仅写/关）。

## 二、集成商交付清单 / Delivery Checklist

接入一个存量系统时核对：

1. **身份**：`DELEGATION_SECRET` 与 Java 系统共享（委托 JWT 验签，audience 限定）
2. **读工具**（R1 自动）：查询类工具默认放行，确认只读
3. **写工具**（R3 确认）：确认每一类写操作触发人工确认，不静默执行
4. **高风险写**（R4/R5）：评估是否需要双人审批或阻断（`riskLevel` 覆盖）
5. **撤销**：内部实体副作用可软删；外部系统实现补偿端点 + 配 `revokePath`
6. **审计**：确认每步操作在 AI 审计可见（含 agent_id 归责、username 左联）
7. **演示**：管理台治理总览一页看五中心态势

## 三、部署选项 / Deployment Options

| 场景 | 推荐 | 文档 |
|---|---|---|
| 客户单机 / 演示 | 一键单容器（含工作台+管理台+移动预览） | [one-click-deploy.md](../manual/one-click-deploy.md) · [demo-deploy.md](../manual/demo-deploy.md) |
| 内网 / 私有化（数据不出域） | 离线部署（外部依赖降级） | [offline-deploy.md](../manual/offline-deploy.md) |
| 生产更新 | 蓝绿发布 | [blue-green-deploy.md](../manual/blue-green-deploy.md) |
| 管理台单独部署 | Nginx 静态托管（后端单独） | [admin-deploy.md](../manual/admin-deploy.md) |
| 交付前安全核对 | 安全验证矩阵 | [security-verification-matrix.md](../manual/security-verification-matrix.md) |

**私有化要点**（对政企/金融客户）：
- 本地模型（Ollama）+ 本地 Embedding → 数据不出域
- 审计哈希链可验证（HS-11）；来源身份 manifest（`keelbase inspect`/`doctor`）
- 见 [private-ai-verification.md](../manual/private-ai-verification.md)

## 四、上线前安全核对 / Pre-launch Security Check

- [ ] 生产 `DELEGATION_SECRET` 独立配置（不回落 JWT_SECRET）
- [ ] `CORS_ORIGINS` 收敛到实际域名
- [ ] 外部 MCP server url 过 SSRF 校验（私网/云元数据拒绝）
- [ ] 高风险写工具确认 R4/R5 门控生效（含 self-approve 拒绝）
- [ ] 审计哈希链 `verify` 全绿
- [ ] 完整安全验证矩阵通过（[security-verification-matrix.md](../manual/security-verification-matrix.md)）
