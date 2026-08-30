# Trust 证明包 · 60 秒演示视频分镜

> 定位：给评审 / 集成商 / 社区一个 **60 秒看懂"普通 Agent 能回答，KeelBase 让 Agent 在真实企业系统里安全地做事"** 的演示视频。
> 前置素材：后端已启动（demo provider + delete_customer R5 工具）；用 [verify-trust-proof.mjs](../../Server-NestJS/scripts/verify-trust-proof.mjs) 的六场景作为每一镜的实际操作脚本。
> 中文 · [English](trust-proof-video-script-en.md)

## 总览

| 时间 | 场景 | 一句话信息 |
|------|------|-----------|
| 0-5s | 片头 | 普通 Agent 能回答；KeelBase 让 Agent 安全地做事 |
| 5-15s | S1 正常成功 | AI 读真实业务数据 → 风险分析 critical |
| 15-25s | S2 越权拒绝 | 别人看你数据 → 403 无权访问 |
| 25-35s | S3 高风险动作 | AI 想删客户 → R5 BLOCKED |
| 35-45s | S4 人工确认 | 写操作必须你点"批准"才执行 |
| 45-55s | S5 撤销 | 一步撤销 AI 做的事，可恢复 |
| 55-60s | 片尾 | 存量系统也能接（Java Starter）+ 定位语 |

## 逐镜分镜

### 镜 1 — 片头（0-5s）
- **画面**：KeelBase logo（深蓝盾形）居中，下方两行字：普通 Agent 能回答问题 / KeelBase 让 Agent 在真实企业系统里**安全地做事情**
- **旁白（中）**：普通 AI 能回答问题；KeelBase 让 AI 在真实企业系统里，安全地做事情。
- **旁白（英）**：Ordinary AI answers questions. KeelBase lets AI do things — safely — inside real business systems.

### 镜 2 — S1 正常成功（5-15s）
- **画面**：工作台（`/workbench`）打开 AI CRM → 客户"瀚宇制造"详情（2 笔逾期订单 280 万 + 80 万）→ 在 AI Copilot 输入"分析客户风险" → 返回**风险等级 critical + 依据清单**
- **操作**：`node scripts/verify-trust-proof.mjs` 的 S1 步骤；或直接在管理台工作台操作
- **旁白（中）**：AI 能读真实业务数据，并给出有依据的风险判断。
- **旁白（英）**：AI reads real business data and produces an evidence-based risk verdict.

### 镜 3 — S2 越权拒绝（15-25s）
- **画面**：切换成 bob 登录 → 打开 alex 的客户详情 → 页面/接口返回 **403 无权访问**
- **操作**：S2 步骤（bob 访问 alex 客户 → 403）
- **旁白（中）**：别人想读你的数据？行级权限直接 403，不只是提示。
- **旁白（英）**：Trying to read someone else's data? Row-level policy returns a real 403 — not just a suggestion.

### 镜 4 — S3 高风险动作（25-35s）
- **画面**：AI Copilot 输入"删除客户" → 系统弹出 **R5 BLOCKED** 卡片（不可逆动作，风险级 R5，策略阻断）
- **操作**：S3 步骤（对话触发 delete_customer → R5 阻断）
- **旁白（中）**：AI 想做不可逆的高风险操作？被系统策略直接阻断。
- **旁白（英）**：AI wants an irreversible, high-risk action? Blocked by policy before it can execute.

### 镜 5 — S4 人工确认（35-45s）
- **画面**：AI Copilot 输入"为瀚宇制造创建跟进任务" → 弹出**确认卡**（R3 写操作 + 风险级 + 授权依据）→ 点"批准" → 任务落库
- **操作**：S4 步骤（流式对话 → confirmation_request → approve → 落库）
- **旁白（中）**：AI 写操作？必须人工确认，确认才执行，且全程留痕。
- **旁白（英）**：AI write? Requires your approval first — and every step is audited.

### 镜 6 — S5 撤销（45-55s）
- **画面**：进入该任务的动作详情（Business Action Detail 页）→ 点"撤销" → 任务软删（可经回收站恢复）
- **操作**：S5 步骤（governance 反查副作用 → 本人撤销 → 软删）
- **旁白（中）**：AI 做的每一件事都能追溯、能撤销，数据主权在你手里。
- **旁白（英）**：Everything AI does is traceable and reversible — you stay in control of your data.

### 镜 7 — 片尾（55-60s）
- **画面**：六场景完成打勾列表（S1-S6）+ 一行字：存量系统也能接——Java 不动，AI Runtime 外挂。右下角 GitHub / 官网
- **旁白（中）**：开源、私有部署、存量系统也能接。KeelBase —— AI 进入真实业务系统时的 Trust Runtime。
- **旁白（英）**：Open-source, private-deployable, works with your existing systems. KeelBase — the Trust Runtime for AI in real business systems.

## 录制建议

- 字幕：中英双轨可选；旁白用 1.0-1.2 倍速自然语速。
- 背景：深蓝主题（管理台默认）或工作台浅灰底；保持视觉一致。
- 真实操作：每个场景跑 `verify-trust-proof.mjs` 对应步骤，若需真实 LLM 演示，配 `PROVIDER=deepseek`。
- 若录制工具受限，可用 `verify-trust-proof.mjs` 的控制台输出（✓/✗ + 报告 JSON）作为画面替代。

## 相关

- 一键验证脚本：[verify-trust-proof.mjs](../../Server-NestJS/scripts/verify-trust-proof.mjs)
- 可运行展示文档：[security-showcase.md](security-showcase.md)
- 现有演示脚本：[golden-demo-script.md](golden-demo-script.md)
