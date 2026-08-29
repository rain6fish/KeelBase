# Java 补偿端点参考实现（Integrator Kit / Java Adapter）

> KeelBase AI 写操作在外部系统产生副作用后，可通过 **revokePath** 撤销——撤销时 KeelBase 会调用 Java 系统的**补偿端点**（注入委托身份）。
> This is the Java-side compensation endpoint that KeelBase calls to undo an AI-created side effect.
>
> 位置：本示例是「集成商在 Java 存量系统侧实现的参考」，KeelBase 侧撤销机制已具备（`proxy-revoker.service.ts`）。
>
> **Spring Boot 3.x / Java 17+ 请优先用 [keelbase-java-starter](https://github.com/rain6fish/KeelBase-java-starter) 的 `KeelBaseCompensationSupport`**——本页手写的委托验签 + 幂等 + 审计样板已被脚手架封装（文档：仓库 `docs/compensation.md` / `docs/compensation.zh-CN.md`）；本示例仅作 Java 8 / Spring Boot 2 存量系统兜底。

## 一、调用约定 / Contract

KeelBase 撤销外部副作用时（`GET /ai/tool-effects` 撤销 / P0-15 本人撤销）：

```
KeelBase
  ├─ 签发委托 JWT（audience 限定 = 你的系统）
  └─ DELETE {baseUrl}{revokePath}{resultId}
       headers: Authorization: Bearer <委托 JWT>
```

- `revokePath` 在 ProxyTool 配置（`ai_proxy_tools` 工具项）里指定，支持 `DELETE /api/customers/{customerId}/followups/{id}` 这类「方法 + 路径 + 占位」格式
- `{id}` 占位 → 副作用 resultId（AI 写调用锚点）
- 补偿端点需返回 **2xx**（成功）；幂等（重复撤销返回 200 + `idempotent`）

## 二、Spring Boot 参考实现 / Reference Implementation

```java
// KeelBaseCompensationController.java —— AI 副作用撤销补偿端点（参考实现）
@RestController
@RequestMapping("/api/compensation")
public class KeelBaseCompensationController {

    /** 与 KeelBase 共享的委托密钥（DELEGATION_SECRET，验签用） */
    private final SecretKey delegationKey =
        Keys.hmacShaKeyFor(System.getenv("DELEGATION_SECRET").getBytes(StandardCharsets.UTF_8));

    /** 撤销 AI 创建的跟进任务（外部 CRM 场景） */
    @DeleteMapping("/followups/{id}")
    public ResponseEntity<?> revokeFollowup(
            @PathVariable Long id,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        // 1. 验签委托 JWT（KeelBase 签发，audience 限定；失败 401）
        Claims claims = verifyDelegation(auth);
        if (claims == null) return unauthorized();

        // 2. 幂等：已撤销 / 不存在 → 200 + idempotent:true
        Followup f = followupRepo.findById(id).orElse(null);
        if (f == null || Boolean.TRUE.equals(f.getCancelled())) {
            return ok(Map.of("idempotent", true, "resultId", id));
        }

        // 3. 撤销（软删 cancelled；如需硬删走事务）
        f.setCancelled(true);
        followupRepo.save(f);

        // 4. 审计（谁 / 何时 / 补偿什么——企业可追溯）
        auditLogger.log("compensation", id, claims.getSubject(),
            "followup revoked by KeelBase compensation");

        return ok(Map.of("idempotent", false, "resultId", id, "status", "revoked"));
    }

    /** 验签 KeelBase 委托 JWT：HS256 + audience 校验 + 过期校验 */
    private Claims verifyDelegation(String bearer) {
        if (bearer == null || !bearer.startsWith("Bearer ")) return null;
        try {
            JwtParser parser = Jwts.parserBuilder().setSigningKey(delegationKey).build();
            Claims c = parser.parseClaimsJws(bearer.substring(7)).getBody();
            // audience 限定：确保是 KeelBase 本平台签发（可选，按系统约定校验）
            if (!"legacy-crm".equals(c.getAudience())) return null;
            return c;
        } catch (JwtException e) {
            return null; // 签名不合法 / 过期
        }
    }
}
```

## 三、要点 / Key Points

| 要点 | 说明 |
|---|---|
| **验签** | 用 `DELEGATION_SECRET`（与 KeelBase 同密钥）HS256 验签；`audience` 校验防跨系统 |
| **幂等** | 重复撤销返回 200 + `idempotent:true`（KeelBase 撤销是幂等操作） |
| **软删/硬删** | 建议软删（`cancelled` 标记）便于追溯；需要物理删除走事务 |
| **审计** | 补偿动作必须记审计（谁 / 何时 / 撤销了什么），与 KeelBase 审计哈希链呼应 |
| **失败语义** | 返回非 2xx → KeelBase 撤销失败并透传原因（`proxy-revoker.service.ts`） |

## 四、接入步骤 / Integration Steps

1. 在 Java 系统实现补偿端点（参考上面示例）
2. 在 KeelBase 配置 `ai_proxy_tools`：写工具加 `revokePath: "DELETE /api/compensation/followups/{id}"`
3. 配置 `DELEGATION_SECRET`（KeelBase 与 Java 系统共享，缺省回退 JWT_SECRET，生产应独立配置）
4. 验证：管理台 `AI 工具与副作用` → 撤销该副作用 → 观察 Java 补偿端点被调用 + 状态变为已撤销

## 五、与 KeelBase 侧的关系 / Relationship

- 撤销发起方：`proxy-revoker.service.ts`（读 revokePath + 签发委托 JWT + 调补偿端点）
- 副作用登记：`ai-tool-side-effect`（proxy_call 类型，可见/可审计）
- 前端入口：管理台「AI 行为回放 / 工具与副作用」→ 撤销按钮；工作台「AI 执行轨迹」→ 本人撤销
