# 业务模块协议（Module Protocol）— EASY-7

> 目的：定义**一份 AI 可读的业务模块约定**，让 AI（Claude Code 等）读它就能按基座约定生成完整模块。
> 核心原则（用户 2026-08-13 明确）：**焦点不是让系统内建生成器，而是 AI 能否按系统约定快速生成**——系统提供约定（协议），AI 负责生成。
> 红线：协议**只覆盖高频重复的 20%**，每个字段问「AI 不生成它行不行？」，能手写就手写；复杂业务走手写 + AI 辅助。协议薄则成脚手架升级版，厚则成低代码平台。

---

## 1. 协议形态

一个业务模块用**一份 JSON** 描述（AI 可读、可校验）：

```json
{
  "module": "note",
  "plural": "notes",
  "label": "笔记",
  "fields": [
    { "name": "title", "type": "string", "label": "标题", "required": true },
    { "name": "content", "type": "text", "label": "内容" }
  ],
  "searchable": true
}
```

## 2. 字段类型（协议词汇表）

| type | entity 列 | 前端组件 | 说明 |
|------|-----------|----------|------|
| `string` | `varchar(200)` | 文本输入 | 短文本 |
| `text` | `text` | 多行输入 | 长文本 |
| `int` | `int` | 数字输入 | 整数 |
| `bool` | `boolean` | 开关 | 布尔 |
| `date` | `datetime` | 日期选择 | 时间 |

> 超出这 5 种类型的复杂字段（外键/枚举/关联），**不写协议**，走手写 + AI 辅助。

## 3. 协议 → 生成物映射（AI 必读）

协议字段如何映射到基座各层：

| 协议项 | 后端（Server-Nodejs） | 前端（Front-Flutter） |
|--------|----------------------|----------------------|
| `module`/`plural` | 目录 `src/<plural>/` | 目录 `lib/features/<plural>/` |
| `label` | 中文名（Swagger/i18n） | 页面标题（i18n） |
| `fields[].name` | entity 列名 + DTO 字段 | model 字段 + 表单字段 |
| `fields[].type` | TypeORM 列类型 | Flutter 输入控件 |
| `fields[].required` | DTO `@IsNotEmpty` | 表单必填校验 |
| `searchable` | 列表搜索 + `/search` 索引 | 搜索入口 |

**固定的安全接线（协议不含，AI 必须补）**：
- CASL：用户只能访问本人数据（`userId` 所有权）
- 审计：写操作自动入 OperationAudit（全局拦截器）
- 导航注册：`navigate-page.tool.ts` PAGE_ROUTES
- i18n：所有用户可见文本中英双语
- 迁移：`migration:generate` 生成（禁止手写，TypeORM 索引用 hash 名）

## 4. 如何用协议生成

**方式 A：CLI（标准 CRUD）**
```bash
node scripts/keelbase-init.mjs --module notes --label 笔记 --fields title:string,content:text
```
CLI 内部即按本协议解析 + 生成 + 接线（见 `scripts/generator/validate.mjs` / `module-spec.mjs`）。

**方式 B：AI 按协议手工生成（复杂/非标准）**
1. 写协议 JSON（或从用户描述提取，`--desc` 走 LLM，EASY-2.1）
2. 按第 3 节映射表逐层实现
3. 按 `AGENTS.md` 第 3 节「必做清单」完成 7 处接线
4. 补测试 + 迁移 + 验收

## 5. 协议边界（红线）

- **不覆盖**：关联查询、级联、复杂业务逻辑、权限变体（非本人数据）
- **为什么**：协议厚了会变成低代码平台（撞竞品），且被元数据拖死可扩展性
- 每个字段写协议前问：「AI 不生成它行不行？」——能手写就手写
