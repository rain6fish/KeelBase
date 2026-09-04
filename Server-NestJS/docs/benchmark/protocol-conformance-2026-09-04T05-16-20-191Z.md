# AI Governance Protocol Conformance（2026-09-04T05-16-20-191Z）

- 22/22 通过 ｜ 总耗时 0s ｜ 协议：审计链 / 委托 token / 工具风险分级

| # | 断言 | 结果 | 详情 |
|---|------|------|------|
| 1 | canonicalJSON 顶层键按名称排序 | ✅ | {"a":2,"b":1} |
| 2 | canonicalJSON undefined 剔除 + null 保留（扁平 payload） | ✅ | {"a":1,"b":null} |
| 3 | chainHash 输出 64 hex | ✅ | a83bca33206eed0c… |
| 4 | chainHash 确定性（同输入同输出） | ✅ |  |
| 5 | 篡改 payload → hash 变化（防篡改） | ✅ |  |
| 6 | genesis 语义：prevHash 缺省用字面量 `genesis`（与空串区分） | ✅ |  |
| 7 | legacy key 派生 = HMAC-SHA256(keelbase:audit-chain:v1, secret) | ✅ | 19342038247375f0… |
| 8 | 链校验：3 条连续记录全过 | ✅ | checked=3 |
| 9 | 篡改检测：改中间记录 → 断链@2 | ✅ | brokenIndex=2 |
| 10 | 密钥轮换：候选密钥集 [current, legacy] 可验旧链 | ✅ |  |
| 11 | 密钥域分离：current key 不能验 legacy 链（密钥隔离生效） | ✅ |  |
| 12 | JWT HS256 签发 + 验签通过 | ✅ | aud=legacy-erp sub=local:42 |
| 13 | aud 限定：跨系统 audience 拒绝 | ✅ |  |
| 14 | 过期检测：exp 已过 → 拒绝 | ✅ |  |
| 15 | 篡改检测：payload 被改 → 签名不匹配 | ✅ |  |
| 16 | sub 前缀语义：local:<userId> 统一身份映射键 | ✅ | local:42 |
| 17 | R1（读）→ auto / 无需确认 | ✅ | R1/auto |
| 18 | R3（业务敏感写）→ confirmation / 需确认 | ✅ | R3/confirmation |
| 19 | R4（高影响）→ human_approval / 需确认 | ✅ | R4/human_approval |
| 20 | R5（不可逆/外部）→ block / 阻断 | ✅ | R5/block |
| 21 | 派生规则：未声明写工具 → R3 confirmation | ✅ | R3 |
| 22 | 派生规则：未声明读工具 → R1 auto | ✅ | R1 |
