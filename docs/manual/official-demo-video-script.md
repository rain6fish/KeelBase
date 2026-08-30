# KeelBase 官方 Demo 视频脚本（4 分钟版）

> 依据 `KeelBase官方 Demo 视频脚本方案.md` 落地为可执行分镜脚本。
> 录制前请先运行 `npm run seed:demo`，确保演示账号 `alex / Alex@2026$Demo` 有真实种子数据。

## 1. 成片信息

| 项 | 内容 |
|---|---|
| 视频标题 | 《KeelBase：当 AI 开始行动，谁来保证它做对？》 |
| 副标题 | Business-safe AI Agent Runtime |
| 成片时长 | 约 4:00 |
| 目标观众 | 开源开发者、企业技术决策者 |
| 语言 | 中文旁白；屏幕文字保留英文；字幕中英双语 |
| 核心信息 | AI can act — but only within explicit business boundaries. |
| 演示账号 | `alex / Alex@2026$Demo`（开发环境自动种子） |
| 画幅 | 16:9，1920x1080 |

---

## 2. 分镜总览

| 时间码 | 段落 | 目的 |
|---|---|---|
| 0:00–0:20 | Opening：AI 会行动之后的问题 | 制造悬念，提出信任问题 |
| 0:20–0:45 | KeelBase 是什么 | 一句话定位 + Brand Sentence |
| 0:45–1:05 | Demo 1：AI 发现业务风险 | 展示 AI 读真实数据、按规则分析 |
| 1:05–1:25 | Demo 2：写操作必须确认 | 展示人工确认，不是普通 Agent |
| 1:25–1:40 | Demo 3：真正写入 CRM | 展示真实数据变化，证据镜头 |
| 1:40–1:58 | Demo 4：审计轨迹 | 展示完整决策链与哈希链 |
| 1:58–2:15 | Demo 5：撤销副作用 | 展示 AI 行动可纠错 |
| 2:15–2:35 | Trust Runtime 升维 | 从 CRM 泛化到任意 Agent/业务系统 |
| 2:35–2:55 | 越权失败 + Test Evidence | 证明权限是运行时强制，不是 Prompt |
| 2:55–3:25 | Build：30 分钟构建 | 展示 Protocol → Code |
| 3:25–3:45 | Existing System：Bridge | 展示不替换存量系统 |
| 3:45–4:00 | Private Deploy + 收尾 | 数据主权 + 品牌尾板 |

---

## 3. 分镜脚本

### 3.1 0:00–0:20 Opening：AI 会行动之后的问题

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 | 音效/操作 |
|---|---|---|---|---|---|
| 01 | 0:00–0:05 | 黑底，居中依次出现普通 AI 对话气泡 | `User: Which customers are at the highest risk this week?`<br>`AI: 3 customers require attention.` | AI 已经不只是聊天。 | 低音科技感 pad 起 |
| 02 | 0:05–0:09 | 对话下方出现工具调用链 | `AI → read customer data → analyze risk → create follow-up task → update CRM` | 它正在读取企业数据、分析业务、调用工具，甚至直接修改业务系统。 | 逐条浮现，轻微打字音 |
| 03 | 0:09–0:13 | 画面急停，红色警示 | `WAIT.`<br>`Can the AI really do that?` | 但当 AI 真正开始行动，企业缺少的可能不是一个更聪明的 Agent。 | 音乐骤停，心跳声一次 |
| 04 | 0:13–0:18 | 三个问题逐行出现 | `Can it access data it shouldn't see?`<br>`Can it write without approval?`<br>`If something goes wrong, can we know what happened — and undo it?` | 而是一层信任。 | 逐行出现，节奏放慢 |
| 05 | 0:18–0:20 | 黑屏收 logo | `KeelBase`<br>`Business-safe AI Agent Runtime` | （无旁白） | logo 淡入，音乐回升 |

### 3.2 0:20–0:45 KeelBase 是什么

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 | 音效/操作 |
|---|---|---|---|---|---|
| 06 | 0:20–0:32 | 架构简化动画：AI Agents → MCP/OpenAPI/Tools → KeelBase Trust Layer → CRM/ERP/OA/MES | `AI Agents`<br>`MCP / OpenAPI / Tools`<br>`KeelBase Trust Layer`<br>`CRM · ERP · OA · MES` | KeelBase 是一个开源的 Enterprise AI Trust Runtime。它连接 AI Agent 与真实业务系统。 | 节点逐个点亮 |
| 07 | 0:32–0:40 | 中间 Trust Layer 展开 6 个能力词 | `Identity` `Policy` `Permission` `Confirmation` `Audit` `Revoke` | 向上，它可以接入 MCP、OpenAPI、Function Calling 和现有 Agent；向下，它可以连接 CRM、ERP、OA、数据库以及存量系统。 | 能力词逐个出现 |
| 08 | 0:40–0:45 | 能力词收拢到 Trust Layer，最后一句放慢 | `AI can act — but only within explicit business boundaries.` | 而在中间，KeelBase 负责让 AI 的每一次业务行动，都处在明确的边界之内。 | Brand Sentence 单独停留 |

### 3.3 0:45–1:05 Demo 1：AI 发现业务风险

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 | 音效/操作 |
|---|---|---|---|---|---|
| 09 | 0:45–0:52 | 打开 Workbench，进入 AI CRM，直接打开 AI 对话 | 登录 `alex / Alex@2026$Demo`，进入 `AI CRM` | 在 KeelBase 中，AI 不只是回答问题。 | 真实系统录制，不切菜单 |
| 10 | 0:52–0:58 | 输入问题，AI 开始显示工具步骤卡 | `Understanding request...`<br>`→ query_customer_orders`<br>`→ query_customer_activities`<br>`→ analyze_customer_risk` | 它可以真正读取业务数据，并根据业务规则进行分析。 | 工具卡带「读」徽标 |
| 11 | 0:58–1:05 | 风险结论卡片出现 | `发现 3 个需要关注的客户`<br>`瀚宇制造 · Risk: Critical`<br>`原因：单笔 280 万订单逾期 40 天；资金链紧张` | 例如这里，AI 找到了高风险客户，并解释了风险来自哪里。 | 结论停留 2 秒；逾期天数以界面实际为准 |

> 录制提示：方案原稿使用「云帆商贸」，本项目种子数据中的对应高风险客户为「瀚宇制造」。为保证视频与系统一致，本脚本统一使用「瀚宇制造」。

### 3.4 1:05–1:25 Demo 2：写操作必须确认

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 | 音效/操作 |
|---|---|---|---|---|---|
| 12 | 1:05–1:12 | AI 建议创建跟进任务，出现确认卡片 | `建议为瀚宇制造创建销售跟进任务。是否执行？` | 但是分析和执行，是两回事。读取可以发生，业务写操作不能悄悄发生。 | 刻意停 1 秒 |
| 13 | 1:12–1:20 | 确认卡片展开 | `Create Follow-up Task`<br>`Customer: 瀚宇制造`<br>`Owner: Alex`<br>`Due: Tomorrow`<br>`Reason: High customer risk`<br>`[ Reject ] [ Approve ]` | 创建任务属于业务副作用，所以 KeelBase 要求获得用户的明确确认。 | 卡片高亮，等待审批状态明显 |
| 14 | 1:20–1:25 | 鼠标移动到 Approve，点击 | （无新增文字） | （无旁白） | 点击音效 |

### 3.5 1:25–1:40 Demo 3：真正写入 CRM

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 | 音效/操作 |
|---|---|---|---|---|---|
| 15 | 1:25–1:32 | 执行步骤动画 | `Creating task...`<br>`✓ Permission checked`<br>`✓ Human approval received`<br>`✓ Task created` | 确认之后，AI 才真正修改 CRM。这不是模拟出来的回答。 | 逐项打勾 |
| 16 | 1:32–1:40 | 切到 CRM Tasks 列表，高亮新任务 | `New task in CRM Tasks`<br>`推进瀚宇制造分期方案签约` | 业务数据已经发生真实变化。 | 证据镜头，停留 3 秒，不要快速切走 |

### 3.6 1:40–1:58 Demo 4：审计轨迹

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 | 音效/操作 |
|---|---|---|---|---|---|
| 17 | 1:40–1:50 | 点击 Audit Trace / 治理轨迹，完整链路逐级出现 | `User Request → AI Decision → Tool Call → Authorization → Human Approval → Database Mutation → Audit Record` | 但企业还需要知道：AI 为什么做这个决定？谁发起的？AI 调用了什么工具？为什么被允许？谁批准了？最终修改了什么？ | 链路逐级点亮 |
| 18 | 1:50–1:58 | 显示哈希链校验结果 | `SHA-256 Hash Chain`<br>`✓ Integrity Verified` | KeelBase 将这些行为形成完整的决策与审计轨迹，并通过哈希链验证完整性。 | 少讲密码学，让画面说话 |

### 3.7 1:58–2:15 Demo 5：撤销副作用

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 | 音效/操作 |
|---|---|---|---|---|---|
| 19 | 1:58–2:05 | 点击 Revoke，弹出确认 | `Revoke AI-created task?`<br>`[ Cancel ] [ Revoke ]` | 更重要的是，AI 的业务副作用不是「一旦发生就结束」。 | 红/灰双按钮 |
| 20 | 2:05–2:10 | 点击 Revoke | `✓ Side effect revoked` | 对支持撤销的操作，KeelBase 可以追踪并撤销 AI 创建的业务记录。 | 撤销成功音效 |
| 21 | 2:10–2:15 | 画面缩小，出现主线 | `Read → Decide → Confirm → Act → Audit → Revoke` | 让 AI 的行动不仅可控，也可纠错。 | 主线定格 1 秒 |

### 3.8 2:15–2:35 Trust Runtime 升维

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 | 音效/操作 |
|---|---|---|---|---|---|
| 22 | 2:15–2:28 | 从刚才的 Demo 流程抽象为通用架构 | `Any AI Agent`<br>`↓ Tool / MCP / API`<br>`KeelBase Trust Layer`<br>`Identity · Policy · Authorization · Human Approval · Side-effect · Audit · Revoke · Evaluation`<br>`↓ Any Business System` | 这就是 KeelBase 与普通 Agent Framework 的区别。KeelBase 不重新发明 Agent 的编排方式，它提供的是 Agent 与企业业务之间的信任层。 | 架构图动画，节奏平稳 |
| 23 | 2:28–2:35 | 两张品牌字卡 | `Not another Agent Framework.`<br>`A Trust Runtime for Business AI.` | 每一次 Tool Call 都可以进入统一的身份、权限、治理和审计体系；AI 可以连接真实业务，但不能绕过业务边界。 | 字卡居中，配重低音 |

### 3.9 2:35–2:55 越权失败 + Test Evidence

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 | 音效/操作 |
|---|---|---|---|---|---|
| 24 | 2:35–2:42 | 回到 AI 对话，尝试跨用户访问 | `User: 查看其他销售负责的客户订单` | 如果 AI 越过用户的数据范围呢？ | 输入后短暂停顿 |
| 25 | 2:42–2:47 | 系统直接拒绝 | `ACCESS DENIED`<br>`Reason: User scope: Owner = Alex`<br>`Requested resource: Customer owned by Bob`<br>`Policy: ROW-LEVEL DENY` | KeelBase 不依赖 AI 自己「记住规则」。权限判断发生在运行时。AI 即使提出了请求，也必须经过业务授权。被拒绝，不是异常，而是系统正常工作。 | 红色拒绝动画 |
| 26 | 2:47–2:52 | Test Evidence 字卡 | `Enterprise Safety Validation`<br>`✓ 39-case Authorization Matrix`<br>`✓ 12/12 Security Evaluation`<br>`✓ Golden Flow E2E`<br>`✓ Audit Integrity Verification`<br>`✓ 15/15 Agent Behavior Benchmark` | 这些安全边界不是宣传语，而是随代码库一起运行的可执行验证。 | 指标逐项打勾 |
| 27 | 2:52–2:55 | 收束一句 | `Security boundary ≠ Prompt instruction`<br>`Runtime enforcement` | （无旁白） | 字卡淡入 |

> 录制提示：越权拒绝的具体文案以当前系统实际输出为准；脚本重点展示「运行时拒绝」而非提示词建议。

### 3.10 2:55–3:25 Build：30 分钟构建 AI 应用

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 | 音效/操作 |
|---|---|---|---|---|---|
| 28 | 2:55–3:02 | 终端输入 | `keelbase init --desc "Customer management"` | KeelBase 不只是运行 AI，它也帮助开发者构建 AI 应用。 | 终端打字音 |
| 29 | 3:02–3:14 | 生成链路动画 | `Natural Language → Module Spec → Application Protocol → Application Code → AI Tools → Governance` | 通过 Application Protocol 描述业务约定，再由 AI 生成真实的应用代码。 | 链路逐个点亮 |
| 30 | 3:14–3:22 | 展示生成源码与生成页面 | `Protocol → Code`<br>`Your application. Your source code.` | 生成的是普通、可读、可修改的源码，不是一个把企业锁死在平台里的低代码黑盒。 | 代码滚动，切到业务页面 |
| 31 | 3:22–3:25 | 品牌字卡 | `Protocol → Code` | （无旁白） | 字卡停留 |

### 3.11 3:25–3:45 Existing System：不替换既有系统

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 | 音效/操作 |
|---|---|---|---|---|---|
| 32 | 3:25–3:38 | 存量系统桥接图 | `Existing CRM / ERP / 10-year-old Java System / Existing Database`<br>`↓ Bridge`<br>`Application Protocol`<br>`↓ KeelBase Trust Runtime`<br>`↓ AI Agent` | 企业也不需要推倒重来。KeelBase 可以通过 Bridge 连接既有数据库、OpenAPI 或 Java 系统。 | 图从左到右流动 |
| 33 | 3:38–3:45 | 收束一句 | `Legacy system, new AI capability.` | 让十年前的业务系统获得 AI 能力，而不是因为 AI 而重新建设整个系统。 | 音乐渐柔 |

### 3.12 3:45–4:00 Private Deploy + 收尾

| 镜头 | 时间 | 画面 | 屏幕文字 | 旁白 | 音效/操作 |
|---|---|---|---|---|---|
| 34 | 3:45–3:52 | 私有化部署链路 | `Cloud LLM OR Local Model / Ollama`<br>`→ Local Embedding`<br>`→ Local RAG`<br>`→ Business-safe Agent`<br>`→ Local Audit` | 对数据敏感的企业，KeelBase 支持 Docker、离线和本地模型部署。 | 链路逐级点亮 |
| 35 | 3:52–3:56 | 部署标签 | `Docker` `Offline` `On-Premise` `Private Data` | 数据可以留在自己的环境，AI 仍然可以真正完成业务工作。 | 标签淡入 |
| 36 | 3:56–3:58 | 黑屏 | （无文字） | （无旁白） | 音乐收住 |
| 37 | 3:58–4:00 | 最终品牌尾板 | `KeelBase`<br>`Build → Run → Trust → Private Deploy`<br>`Business-safe AI Applications`<br>`AI can act — but only within explicit business boundaries.`<br>`Open Source · Enterprise AI Trust Runtime`<br>`github.com/rain6fish/KeelBase` | （无旁白） | 尾板定格 |

---

## 4. 完整旁白（录音版）

> 以下为可直接录音的旁白全文，总时长约 3 分 50 秒。

AI 已经不只是聊天。

它正在读取企业数据、分析业务、调用工具，甚至直接修改业务系统。

但当 AI 真正开始行动，企业缺少的可能不是一个更聪明的 Agent，而是一层信任。

KeelBase，是一个开源的 Enterprise AI Trust Runtime。

它连接 AI Agent 与真实业务系统，在身份、权限、人工确认、审计和撤销的边界内，让 AI 真正完成业务工作。

例如，在 AI CRM 中，我可以问：

“哪些客户本周最值得跟进？”

KeelBase AI 会读取授权范围内的客户、订单和跟进数据，分析风险，并给出判断。

但当 AI 准备创建一项跟进任务时，系统会暂停。

因为这已经是一个真实的业务副作用。

只有用户明确确认，操作才会执行。

执行之后，整个过程都会被记录：

用户请求、AI 决策、工具调用、权限依据、人工确认，以及最终的数据变化。

对支持撤销的操作，还可以追踪并撤销 AI 创建的业务记录。

如果 AI 尝试访问用户没有权限的数据，运行时会直接拒绝。

权限不是写在 Prompt 里的建议，而是在运行时真正执行的边界。

这就是 KeelBase 与普通 Agent Framework 的区别。

我们不重新发明 Agent。

KeelBase 提供的是 AI 与企业业务之间的信任层。

同时，开发者可以通过 Application Protocol 和 `keelbase init`，从自然语言、SQL Schema 或 OpenAPI 出发生成真实的业务源码。

企业也可以通过 Bridge 接入现有 CRM、ERP、OA 或传统 Java 系统，而不必推倒重来。

对敏感业务，KeelBase 支持 Docker、离线以及本地模型部署，让数据留在企业自己的环境中。

这些安全边界不是宣传语，而是随代码库一起运行的可执行验证。

Build. Run. Trust. Private Deploy.

KeelBase。

AI 可以行动，但只在明确的业务边界内行动。

---

## 5. 字幕文件

已随脚本生成可直接导入剪辑软件的字幕：

- [中文 SRT](official-demo-video-subtitles.zh.srt)
- [英文 SRT](official-demo-video-subtitles.en.srt)

字幕时间轴与分镜脚本一致；如需微调，请以最终成片剪辑节奏为准。

---

## 6. 录制操作清单

1. 准备环境：`cd Server-NestJS && npm run seed:demo`，确认输出包含 CRM/PM/Approval 等数据。
2. 登录演示账号 `alex / Alex@2026$Demo`，确认工作台有客户、订单、风险、待办、通知数据。
3. 录制 Demo 1：进入 AI CRM，使用 AI Copilot 提问「哪些客户本周最值得跟进？」，等待工具卡与风险结论。
4. 录制 Demo 2：让 AI 提议创建跟进任务，展示确认卡片后点击 Approve。
5. 录制 Demo 3：切到 CRM Tasks，高亮新创建的任务，停留 3 秒。
6. 录制 Demo 4：打开治理轨迹，逐级展示链路与 SHA-256 哈希校验。
7. 录制 Demo 5：点击 Revoke，展示撤销成功。
8. 录制越权失败：用 Alex 提问访问 Bob 的客户数据，展示运行时拒绝；拒绝文案以实际系统为准。
9. 录制 Build：终端执行 `keelbase init --desc "Customer management"`，展示生成源码与页面。
10. 录制收尾：私有化部署链路 + 品牌尾板。

---

## 7. 素材与资产清单

| 类型 | 素材 | 来源 |
|---|---|---|
| 系统画面 | Workbench / AI CRM / 工具卡 / 确认卡 / 审计轨迹 / Revoke | 本地运行实录 |
| 终端画面 | `keelbase init` 与生成过程 | 本地终端实录 |
| 架构动画 | Agent → Trust Layer → Business System | 可基于 `docs/branding/keelbase-architecture.svg` 重绘 |
| 品牌尾板 | KeelBase Logo + Build → Run → Trust → Private Deploy | `README.md` / 品牌资源 |
| 测试证据 | 39-case / 12/12 / E2E / Audit / 15/15 | README「Enterprise Safety Validation」 |
| 音乐 | 低沉科技感、中性渐强、结尾收束 | 版权音乐库 |
| 字体 | 中英双语无衬线字体 | 剪辑软件默认或授权字体 |

---

## 8. 三个不能犯的错误

1. 不要开场介绍技术栈：NestJS / Vue / Flutter / TypeORM 等只放结尾字幕。
2. 不要把 20 个功能轮流展示：视频只讲一条「读 → 决策 → 确认 → 执行 → 审计 → 撤销」主线。
3. 不要把安全讲成 PPT：所有安全能力都用真实操作演示，Show, don't tell。

---

## 9. 最终建议

视频标题首选：

**《KeelBase：当 AI 开始行动，谁来保证它做对？》**

副标题：

**Business-safe AI Agent Runtime**

整支视频用 AI CRM 的真实操作回答：

权限 → 确认 → 执行 → 审计 → 撤销。

让观看者自己得出一个结论：

KeelBase 不是让 Agent 更聪明，而是让 Agent 真正敢进入企业业务。
