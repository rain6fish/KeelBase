# 10 分钟证明走查脚本（冻结前内部用）/ 10-Minute Proof Walkthrough (pre-freeze, internal)

> 定位 / Purpose：材料冻结（9/25）前在**活环境**把「AI 会行动之后，谁来保证它做对？」讲成一条 10 分钟可复现的主线。把 2026-09-04 新封口的三件套（**AI Action Center** 9478ddb / **Trust 沙盘** eb86a3c / **Policy Evidence** 0b83eb3）接进既有 Golden Flow（golden-demo-script.md 场景 1），既是演示分镜、也是冻结前逐项勾选的走查清单。本文档不 README 链接、不进代码，仅冻结窗口内使用。
> 环境 / Env：`./deploy/demo.sh` 一键（工作台，local）或 ECS demo（`demo.keelbase.com.cn` 三入口 `/user/` `/admin/`）；账号 `alex / Alex@2026$Demo`（工作台）、`admin / Admin@2026$KeelBase`（管理台，仅取合规证据用）。**前置**：环境需已部署到含 `9478ddb`（Action Center）+ `eb86a3c`（Trust 沙盘）+ `0b83eb3`（Policy Evidence）的版本。

---

## 一、主线分镜（约 10 分钟）

> 一句话字幕贯穿：**AI 读你的数据 → 判断风险 → 在你确认后写数据 → 每一步可查、可撤销、有版本依据。**

| 段 | 时间 | 画面 | 操作 | 证据点（给观众看什么） |
|---|---|---|---|---|
| T0 | 0:00 | 工作台首页（alex） | 登录；主页快捷卡出现「我的 AI 行为」 | 业务用户有"我的 AI"统一入口 |
| T1 | 0:10 | AI CRM → 客户详情 | 开客户 →「AI 助手」→「分析这家客户的风险，值得跟进吗？」 | 读工具卡（`query_customer_orders/activities/analyze_customer_risk`，蓝读徽标） |
| T2 | 0:25 | AI 回复 | AI 给出风险结论 +「要我为 X 创建跟进任务吗？」 | 写操作触发确认门控（R3） |
| T3 | 0:32 | 确认卡 | 点「批准」（可顺带展开技术详情看 risk/checks） | 人工确认是执行前置；治理抽屉自动开（谁/何时/为何允许/结果/副作用） |
| T4 | 0:45 | 业务动作详情 | 治理抽屉 →「查看完整轨迹」进 Business Action Detail 七段 | Who/Why/Approval/Effect/**Integrity**（哈希链）一屏闭环 |
| **T5** | 1:00 | **我的 AI 行为（新）** | 顶栏「我的」→「我的 AI 行为」/ 或直接 `my-ai-actions` | 刚确认创建的跟进任务**在本人清单**：人类标签 + 状态 chip「已执行」+ 撤销按钮 |
| **T6** | 1:15 | 行操作 | 点该行「查看证据」→ B4 详情；（可选）「对象历史」抽屉 | 同一行可直达完整证据 / 该业务对象的跨来源行为史（A-2） |
| **T7** | 1:40 | 撤销演示 | 回「我的 AI 行为」点该行「撤销」→ 确认 | chip 变「已撤销」；目标软删（回收站可恢复语义）——**Design for Recovery 可演示** |
| **T8** | 2:10 | Trust 沙盘（新） | 工作台「Trust 沙盘」→ 依次 run：越权拒绝 / R5 阻断 / 确认门控 | 每条 outcome 业务语言（无 LLM 确定性），可一键复现"运行时边界拒绝" |
| **T9** | 3:30 | Policy Evidence（后端级） | 管理台 admin 登录 → 合规证据 / AI Action Report 导出（或审计身份链 `allowed.policyVersion`） | 「为什么允许」带**当时哪一版规则**（`policyVersion`=policy.updatedAt）——合规取证的版本依据 |
| T10 | 4:00+ | 收口 | 若录视频：以上为素材，切 60s 短版选 T1→T5→T7→T8 | 主线即"读→判断→确认→写→查→撤→拒"闭环 |

> **诚实边界**：Policy Evidence v1 落在**后端/合规证据**（identity chain `allowed.policyVersion` + 证据包 JSON）；工作台「为什么允许」面板的**漂移徽标**（现策略 ≠ 快照版本 → "决策基于旧版规则"）为后续 UI 项，不在本走查画面承诺。

## 二、冻结前勾选清单（活环境逐项走）

- [ ] 环境已含 9478ddb / eb86a3c / 0b83eb3（`demo.keelbase.com.cn/app/version` 或本地 build 时间确认）
- [ ] T5：我的 AI 行为清单能显示本人**刚经确认创建**的写副作用（非仅 seed）
- [ ] T6：行「查看证据」跳 B4 七段正常；「对象历史」抽屉对 crm_task/pm_task/app_request 可用
- [ ] T7：撤销 → chip 变「已撤销」；业务对象列表不再见该条；管理台回收站可恢复（admin 验证一次）
- [ ] 隔离：第二个普通账号登录 → 我的 AI 行为为空（看不到 alex 的动作）；未登录 401
- [ ] T8：Trust 沙盘六场景逐一 run，outcome 均业务语言、越权/R5/确认各自不同文案
- [ ] T9：管理台合规导出 JSON 中某条 `allowed.policyVersion` 与当时策略 `updatedAt` 一致（取一次管理台「策略中心」的生效时间比对）
- [ ] 双语：中/英界面各走一遍 T5–T7 文案（无硬编码中文）
- [ ] 录屏素材打点：T1 读工具 / T3 确认卡 / T4 完整证据 / T5 清单 / T7 撤销 / T8 拒

## 三、与既有脚本的关系

- golden-demo-script.md 场景 1 = 本文 T1–T4 主干（60s 首屏）；本文在其后追加 T5–T9 证据段落。
- official-demo-video-script / trust-proof-video-script：官方 4min 片素材若复用，Action Center 建议作「撤销」镜头、「我的 AI 行为」作转场画面（可读性强）。
- Trust 沙盘 = roadmap §22.15「Trust 沙盘页」落地（并发 eb86a3c），与本文 T8 对齐。

## 四、红线 / 明确不进（防回潮）

- 不新增核心功能（9/25 冻结纪律）；本清单只做**走查/验证/录素材**。
- 不做（已定案）：待我确认中心（需 R3 落库，冻结后）、跨会话被拒聚合、AI 口头导航到工作台页（page registry 未成）、Policy Evidence 漂移徽标 UI（后续）、④ 影响预览（用户 2026-09-04 定案冻结前不做）。
- 冻结后 backlog（不占演示窗口）：① 证据根跨链锚定 / ② 国密+时间锚 / ④ 级联撤销 / R3 确认落库。

## 相关 / Related

golden-demo-script.md ｜ trust-proof-video-script ｜ official-demo-video-script ｜ docs/ai-action-center.spec.md ｜ docs/audit-authz-snapshot.spec.md §5 ｜ 私库 roadmap §22.17 执行记录（2026-09-04）
