---
name: generate-module
description: 生成新业务模块（后端 CRUD + 前端页面 + 7 处接线），用 keelbase init CLI 或手工按 AGENTS.md 清单
---

# 生成业务模块（EASY-6 ④ 工具链集成）

## 用途
用户要「加一个 X 模块」时，用本 skill 生成完整业务模块。

## 首选：keelbase init CLI（标准 CRUD）
```bash
node scripts/keelbase-init.mjs --module <plural> --label <中文名> --fields <f1>:<type>,<f2>:<type>
# 交互式（可输自然语言走 LLM，EASY-2.1）：
node scripts/keelbase-init.mjs
# LLM 识别：
node scripts/keelbase-init.mjs --desc "描述模块字段"
```

CLI 已自动接线 7 处：app.module / modules-manifest / feature-flags / main.dart / app_router / i18n / navigate-page.tool（+ Web-Admin）。

## 生成后必做（不能只跑 CLI 就完）
1. **验证编译**：`cd Server-NestJS && npm run build`
2. **跑生成模块单测**：`npm test -- <plural>.service`
3. **生成迁移**（prod postgres 需要，TypeORM 索引是 hash 名禁止手写）：
   `npm run migration:generate -- src/migrations/Add<PascalCase>`
4. **前端验证**：`cd Front-Flutter && flutter analyze`
5. **确认 AI 导航**：navigate-page.tool.ts 的 PAGE_ROUTES 已含新页

## 手工加模块（非标准 CRUD / 复杂模块）
按 `AGENTS.md` 第 3 节「新增业务模块 —— AI 必做清单」逐项完成（7 处接线 + 测试 + 迁移 + 验收）。

## 验收
- 后端 build + flutter analyze 0 error
- 迁移一致性：`migration:generate` 输出 "No changes"
- 新模块数据可被 AI 工具操作（如需）
