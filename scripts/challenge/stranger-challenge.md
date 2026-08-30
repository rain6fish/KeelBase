# KeelBase 合成陌生人挑战（Stranger Challenge）

> W3 合成陌生人 harness：用**无本仓上下文的 AI / 外部开发者**从干净环境跑 30min Build + 60min Business，脚本化记录 onboarding 卡点，持续烧掉上手摩擦。本文件自包含——执行者不需要任何前置项目知识。
> 运行方式：`./scripts/challenge/run.sh`（自动干净 clone + 起后端 + 打印本卡 + 记录模板）；或手动按下面步骤。

## 挑战目标

用 KeelBase 证明两件事：

1. **30min Build**：从一个干净环境，生成一个**可运行的业务模块**（含权限/AI 工具）。
2. **60min Business**：让 **AI 安全完成一个真实业务任务**（如创建一条数据）。

记录每一处卡住（Where stuck / Why / Missing abstraction），这是挑战最有价值的产出。

## 环境

- 干净 clone：`<REPO>`（无任何你的前置改动）
- 后端已启动：`<URL>`（演示账号 `alex/Alex@2026$Demo` 工作台、`admin/Admin@2026$KeelBase` 管理台）
- 你只能看 README / 文档 / 运行命令，**不看源码内部实现**（模拟真实外部开发者）

## 30min Build（生成业务模块）

| # | 步骤 | 提示 | 记录用时 |
|---|------|------|---------|
| 1 | 找到生成模块的命令 | 读 README「30 分钟创造」；`node scripts/keelbase-init.mjs` | |
| 2 | 生成一个模块（如「帖子 posts」：标题/内容） | 交互或 `--module posts --label 帖子 --fields title:string,content:text` | |
| 3 | 让模块跑起来（编译） | `cd Server-NestJS && npm run build` | |
| 4 | 管理台验证模块页出现 | 登录 `/admin`，侧边栏应出现「帖子」 | |
| 5 | AI 工具验证：对话让 AI 查询该模块 | 工作台 AI 对话：如「有哪些帖子？」→ 应看到工具调用卡 | |

**验收**：模块出现在管理台 + AI 能查询它（工具卡 / 审计可见）。

## 60min Business（AI 安全完成业务任务）

用 `alex` 账号让 AI 完成一个真实写任务（如「为华润建材创建跟进任务」），观察：

- 工具调用（读/写徽标）
- **写操作人工确认**（不静默执行）
- 审计记录（管理台「AI 审计」+ 哈希链）
- 可撤销（若创建了记录）

**验收**：写操作必须经确认才执行；操作落审计。

## 记录表（挑战结束时填写，交回反馈）

| 步骤 | 用时 (min) | Where stuck（卡在哪一步） | Why stuck（为什么卡） | Missing abstraction（缺什么抽象/文档/命令） |
|------|-----------|--------------------------|----------------------|--------------------------------------------|
| Build-1 找命令 | | | | |
| Build-2 生成 | | | | |
| Build-3 编译 | | | | |
| Build-4 管理台 | | | | |
| Build-5 AI 查询 | | | | |
| Business 写任务 | | | | |

**最终反馈**：
- 30min Build 是否完成？ Y/N
- 60min Business 是否完成？ Y/N
- Would you use KeelBase again? Y/N + 一句话原因：
