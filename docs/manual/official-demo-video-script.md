# KeelBase 官方 Demo 视频脚本（4 分 45 秒版）

> 依据 `KeelBase官方 Demo 视频脚本方案.md` 落地为可执行分镜脚本。
> 录制前请先运行 `npm run seed:demo`，确保演示账号 `alex / Alex@2026$Demo` 有真实种子数据。
> 术语注（KB-1 词汇表 v2）：主名 **Business-safe AI Runtime**（中文「业务安全 AI 运行时」）；
> 中间层称 **Governance Layer**（「治理层」）。**Trust Layer / Trust Runtime 不再并列混用**。
> **本版对应代码基线 = HEAD（v1.0.10 之后）**：级联撤销（`881d4911`）与对抗沙盘不在 v1.0.10 里，
> 录制环境须先升到 HEAD，否则第 19–20、26 镜拍不出来——**不要用旧环境硬演**。

## 1. 成片信息

| 项 | 内容 |
|---|---|
| 视频标题 | 《KeelBase：当 AI 开始行动，谁来保证它做对？》 |
| 副标题 | Business-safe AI Runtime |
| 成片时长 | 约 4:45（39 镜） |
| 目标观众 | 开源开发者、企业技术决策者 |
| 语言 | 中文旁白；屏幕文字保留英文；字幕中英双语 |
| 核心信息 | AI can act — but only within explicit business boundaries. |
| 演示账号 | `alex / Alex@2026$Demo`（工作台）· `admin / Admin@2026$KeelBase`（管理台） |
| 画幅 | 16:9，1280x800 录制 |

**计划时间轴与旁白为单一来源**：`docs/official-video/shot-timing.json`（时间轴）、
`docs/official-video/narration.json`（旁白，39 镜 1:1）。中英字幕由
`node scripts/video/build-subtitles.mjs` 生成；录制后用
`node scripts/video/align-subtitles.mjs` 按真实时间轴重排。

---

## 2. 分镜总览

| 时间码 | 段落 | 目的 |
|---|---|---|
| 0:00–0:45 | Opening：AI 会行动之后的问题 | 制造悬念，提出信任问题 |
| 0:45–1:45 | Demo 1–4：读 → 确认 → 执行 → 审计 | 展示真实数据、人工确认、真实写入 |
| 1:45–2:25 | Demo 5：撤销 = 一次业务动作整组补偿 | 展示 AI 行动可纠错 |
| 2:25–2:45 | Governance Layer 升维 | 从一个 CRM 泛化到任意 Agent/业务系统 |
| 2:45–2:57 | 越权失败 | 证明权限是运行时强制 |
| 2:57–3:16 | 对抗沙盘（现场跑） | 用可运行对抗场景替代静态数字 |
| 3:16–3:38 | Build：业务规格 → 协议 → 源码 | 展示 Protocol → Code |
| 3:38–4:09 | Existing System：Bridge + Private Deploy | 不替换存量系统 + 数据主权 |
| 4:09–4:39 | 证据报告 + 首次运行就绪清单 | 离线可自证 + 开箱知道下一步 |
| 4:39–4:45 | 收尾 | 品牌尾板 |

---

## 3. 分镜脚本

### 3.1 0:00–0:45 Opening

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 |
|---|---|---|---|---|
| 01 | 0:00–0:05 | 黑底，居中出现对话气泡 | `User: Which customers are at the highest risk this week?`<br>`AI: 3 customers require attention.` | AI 已经不只是聊天。 |
| 02 | 0:05–0:09 | 对话下方出现工具调用链 | `AI → read customer data → analyze risk → create follow-up task → update CRM` | 它读取业务数据、判断风险、调用工具，甚至直接修改业务系统。 |
| 03 | 0:09–0:13 | 画面急停，红色警示 | `WAIT.` / `Can the AI really do that?` | 但当 AI 真正开始行动，企业缺的，可能不是更聪明的 Agent。 |
| 04 | 0:13–0:18 | 三个问题逐行出现 | `Can it access data it shouldn't see?` / `Can it write without approval?` / `If something goes wrong, can we know what happened — and undo it?` | 而是一层信任：它能碰不该碰的数据吗？会不经批准就写入吗？出了错，我们查得清、撤得回吗？ |
| 05 | 0:18–0:20 | 黑屏收 logo | `KeelBase` / `Business-safe AI Runtime` | KeelBase 给出的答案，是一个开源的业务安全 AI 运行时。 |
| 06 | 0:20–0:32 | 架构简化动画 | `AI Agents` → `MCP / OpenAPI / Tools` → `KeelBase Governance Layer` → `CRM · ERP · OA · MES` | 上面是 AI 代理，下面是你的业务系统——CRM、ERP、OA。KeelBase 的治理层在中间，守住每一道边界。 |
| 07 | 0:32–0:40 | 治理层展开 6 个能力词 | `Identity` `Policy` `Permission` `Confirmation` `Audit` `Revoke` | 身份、策略、权限、人工确认、审计、撤销——每一步都有规则，每一次都有记录。 |
| 08 | 0:40–0:45 | 能力词收拢，brand sentence 停留 | `AI can act — but only within explicit business boundaries.` | 一句话：AI 可以行动，但只在明确的业务边界内。 |

### 3.2 0:45–1:45 Demo 1–4

| 镜头 | 时间 | 画面 | 旁白 |
|---|---|---|---|
| 09 | 0:45–0:52 | 登录工作台 → 进入 AI CRM | 我们来跑一遍真实流程。 |
| 10 | 0:52–0:58 | 提问，工具步骤卡逐条出现（读徽标） | 问 AI：哪些客户本周最值得跟进？它会真的去读订单和跟进记录。 |
| 11 | 0:58–1:05 | 风险结论卡片 | 瀚宇制造，逾期两百八十万，风险最高，建议立即跟进。 |
| 12 | 1:05–1:12 | AI 提议创建、出现确认卡 | 接着，AI 想建一个跟进任务。写入是真实的业务副作用，所以它先停下来问。 |
| 13 | 1:12–1:20 | 确认卡展开（含**影响预览**与撤销口径） | 确认卡不只说「要做什么」，还会告诉你这次动作会影响什么、能不能撤销。 |
| 14 | 1:20–1:25 | 点击批准 | 你批准，它才执行。 |
| 15 | 1:25–1:32 | 执行步骤打勾 | 权限检查、人工批准、写入——三步都留下记录。 |
| 16 | 1:32–1:40 | 切到 CRM 任务列表，高亮新任务 | CRM 里已经多了一条真实任务。这不是模拟出来的回答。 |
| 17 | 1:40–1:50 | 治理轨迹逐级点亮 | 这条链完整可查：谁发起、AI 怎么决策、调了哪个工具、为什么被允许、谁批准、最后改了什么。 |
| 18 | 1:50–1:58 | 审计哈希链校验 | 整条记录进入防篡改的审计链，并且可以离线校验。 |

### 3.3 1:58–2:25 Demo 5：撤销 = 整组补偿

| 镜头 | 时间 | 画面 | 旁白 |
|---|---|---|---|
| 19 | 1:58–2:10 | 让 AI 做一次**跨表业务动作**（建项目 + 三个任务），确认卡出现 | 如果这次动作写了好几张表，撤销不必一条一条点——同一次业务动作的整组写入，会一起补偿。 |
| 20 | 2:10–2:20 | 点撤销 → 整组级联补偿，出现补偿条数提示 | 一次撤销，整组回滚。 |
| 21 | 2:20–2:25 | 主线定格 | 读取、决策、确认、执行、审计、撤销——这是一个闭环。 |

> **录制前提**：本镜依赖复合写工具 `create_project_with_tasks`（`881d4911` 引入，**不在 v1.0.10**）。
> 若环境仍是 v1.0.10，本镜**演不出来**——请先升级环境，不要退回单表撤销假装演示。

### 3.4 2:25–2:45 Governance Layer 升维

| 镜头 | 时间 | 画面 | 旁白 |
|---|---|---|---|
| 22 | 2:25–2:38 | 从 Demo 抽象为通用架构 | 这套治理层不绑定某一家 Agent：MCP、OpenAPI、Function Calling，接进来就受同一套规则管。 |
| 23 | 2:38–2:45 | 两张品牌字卡 | 这不是又一个 Agent 框架，而是一个业务安全的 AI 运行时。 |

### 3.5 2:45–3:16 越权失败 + 对抗沙盘

| 镜头 | 时间 | 画面 | 旁白 |
|---|---|---|---|
| 24 | 2:45–2:52 | 回到 AI 对话，尝试跨用户访问 | 那如果 AI 越过了自己的数据范围呢？ |
| 25 | 2:52–2:57 | 系统直接拒绝 | 运行时直接拒绝。依据、策略、范围，全部落在审计里——被拒绝不是异常，而是系统正常工作。 |
| 26 | 2:57–3:11 | 管理台**对抗沙盘**：现场运行确定性场景 → 结果 + 决策轨迹 | 这些边界不是宣传语。管理台里可以现场跑对抗场景，直接看结果和决策轨迹。 |
| 27 | 3:11–3:16 | 收束字卡 | 安全边界不是靠提示词哄出来的，是运行时强制出来的。 |

> **说明**：第 26 镜替换了旧版的「39 项越权矩阵 / 12/12 / 15/15」静态数字卡——
> 那些数字是 v1.0.9 时期的 README 快照，且**静态数字不如可现场复现的对抗场景有力**。
> 若确需保留数字，必须按当前实测值重新核对后再上屏，**不得沿用旧数字**。

### 3.6 3:16–3:38 Build：业务规格 → 协议 → 源码

| 镜头 | 时间 | 画面 | 旁白 |
|---|---|---|---|
| 28 | 3:16–3:25 | 终端：`business-spec.mjs` 业务规格 → 模块协议（含「不可映射」显式清单） | 要建新业务模块？从一句业务诉求开始，先变成结构化的业务规格。 |
| 29 | 3:25–3:38 | 终端：`keelbase-init.mjs --spec` 生成真实源码与接线 | 再确定性映射成模块协议——一条命令，生成真实的业务源码。 |
| 30 | 3:38–3:46 | 生成源码 / 业务页面 | 生成的是普通源码：看得懂、改得动，留在你自己的仓库里。 |
| 31 | 3:46–3:49 | 品牌字卡 | （无旁白） |

> 命令口径以 README 为准：CLI **随仓库分发，无需全局安装**——
> 用 `node scripts/keelbase-init.mjs --spec specs/invoices.json`，不写裸 `keelbase init`。

### 3.7 3:49–4:09 Existing System + Private Deploy

| 镜头 | 时间 | 画面 | 旁白 |
|---|---|---|---|
| 32 | 3:49–4:02 | 终端：`--import-openapi-proxy` 把存量 OpenAPI 变成受治理工具（读 R1 自动 / 写 R3 确认） | 存量系统也不用推倒重来。把接口交给 KeelBase，它们就变成受治理的 AI 工具。 |
| 33 | 4:02–4:09 | 收束字卡 | 读操作自动执行，写操作必须批准——核心代码一行不改。 |
| 34 | 4:09–4:16 | 终端：私有 AI 验证（本地模型 / 本地向量化 / 本地审计） | 数据敏感，就私有化部署：本地模型、本地向量化、本地审计，数据一步不出域。 |
| 35 | 4:16–4:20 | 部署标签 | Docker、离线、本地部署——数据主权，握在自己手里。 |

### 3.8 4:20–4:45 证据报告 + 就绪清单 + 收尾

| 镜头 | 时间 | 画面 | 旁白 |
|---|---|---|---|
| 36 | 4:20–4:30 | 终端：`render-period-report.mjs` 渲染单文件自包含 HTML 证据报告 | 每一次业务动作，都能导出成一份自包含的 HTML 证据报告；审计方离线就能复核，不必安装 KeelBase。 |
| 37 | 4:30–4:39 | 管理台首页**就绪清单**：五维 ready + 各自下一步 | 第一次打开就有就绪清单：运行时、数据库、AI、治理、演示——每一维都告诉你下一步该做什么。 |
| 38 | 4:39–4:41 | 黑屏 | （无旁白） |
| 39 | 4:41–4:45 | 品牌尾板 | 构建、运行、信任、私有部署。KeelBase：AI 可以行动，但只在明确的业务边界内。 |

---

## 4. 完整旁白（录音版）

> 全文见 `docs/official-video/narration.json`（39 镜 1:1，中英各一份）。
> 本项目不做手工誊抄的第二份旁白，避免两处漂移。

---

## 5. 字幕文件

由旁白与计划时间轴生成，可直接导入剪辑软件：

- [中文 SRT](official-demo-video-subtitles.zh.srt)
- [英文 SRT](official-demo-video-subtitles.en.srt)

```bash
node scripts/video/build-subtitles.mjs        # 由旁白 + 计划时间轴生成
node scripts/video/align-subtitles.mjs \      # 录制后按真时间轴重排（可 --input/--output 烧录）
  --shot-log artifacts/official-demo/shot-log.json \
  --srt docs/manual/official-demo-video-subtitles.zh.srt
```

---

## 6. 录制操作清单

```bash
# 0. 起分镜服务（必须在仓库根跑：ROOT 相对 cwd 解析）
SLIDES_PORT=3011 node scripts/video/serve-official-assets.mjs
# 1. 种演示数据
cd Server-NestJS && npm run seed:demo
# 2. 录制（中英各一遍；BASE_URL 指向目标环境）
BASE_URL=<目标环境> SLIDES_URL=http://localhost:3011 LANG=zh \
  DEMO_PASSWORD='Alex@2026$Demo' node scripts/video/record-official-demo.mjs
```

1. 确认演示账号有客户、订单、风险、待办、通知数据。
2. Demo 1–4：AI CRM 提问 → 工具卡 → 风险结论 → 确认卡（含影响预览）→ 批准 → CRM 任务 → 治理轨迹。
3. Demo 5：让 AI 做一次跨表动作（建项目 + 三任务），批准后**整组撤销**，确认出现级联补偿提示。
4. 越权失败：用 Alex 提问访问 Bob 的客户数据；拒绝文案以实际系统为准。
5. 对抗沙盘：管理台 `#/security-showcase` 运行第一个场景，等结果与决策轨迹出现。
6. Build / Bridge / Private / Evidence 四段终端镜：`terminal.html?type=consulting|build|bridge|private|evidence`。
7. 就绪清单：管理台 `#/dashboard`。
8. `align-subtitles.mjs` 按 shot-log 重排字幕后再烧录。

---

## 7. 素材与资产清单

| 类型 | 素材 | 来源 |
|---|---|---|
| 系统画面 | 工作台 / AI CRM / 工具卡 / 确认卡（影响预览）/ 治理轨迹 / 级联撤销 / 对抗沙盘 / 就绪清单 | 真实系统实录 |
| 终端画面 | `business-spec.mjs`、`keelbase-init.mjs`、`--import-openapi-proxy`、`verify-private-ai.sh`、`render-period-report.mjs` | 真实命令输出（捕获自实际运行） |
| 架构动画 | Agent → Governance Layer → Business System | 可基于 `docs/branding/` 资源重绘 |
| 音乐 | 低沉科技感、中性渐强、结尾收束 | 版权音乐库 |

---

## 8. 三个不能犯的错误

1. 不要开场介绍技术栈：NestJS / Vue / Flutter / TypeORM 只放结尾字幕。
2. 不要把 20 个功能轮流展示：只讲一条「读 → 决策 → 确认 → 执行 → 审计 → 撤销」主线。
3. 不要把安全讲成 PPT：所有安全能力都用真实操作演示，Show, don't tell。
   **演不出来就不演**——宁可换镜头，也不要用旧环境的近似画面上屏。

---

## 9. 最终建议

视频标题首选：

**《KeelBase：当 AI 开始行动，谁来保证它做对？》**

副标题：

**Business-safe AI Runtime**

整支视频用 AI CRM 的真实操作回答：权限 → 确认 → 执行 → 审计 → 撤销。

让观看者自己得出一个结论：KeelBase 不是让 Agent 更聪明，而是让 Agent 真正敢进入企业业务。
