# 待办清单（Todos）需求确认书 / Todo List (Todos) Requirements Confirmation

> 需求确认日期：2026-08-06
> Requirements confirmation date: 2026-08-06
> 状态：已确认（已实现，文档后补）
> Status: Confirmed (implemented; documentation written retroactively)

## 1. 背景与目标 / Background and Goals

作为 App 基座平台，需要一个简单通用的任务管理能力，作为业务示例 + 基座功能补齐。目标：用户可创建/勾选/删除自己的待办，列表按完成状态组织，支持截止时间。

As an App base platform, a simple, generic task-management capability is needed, serving both as a business example and a base-platform feature. Goal: users can create/check off/delete their own todos, the list is organized by completion status, and due dates are supported.

**不在范围**：任务共享/协作、标签/优先级、重复任务、提醒（可复用 MS-4 事件提醒机制，本期不做）。

**Out of scope**: task sharing/collaboration, tags/priority, recurring tasks, reminders (can reuse the MS-4 event-reminder mechanism; not in this iteration).

## 2. 功能需求 / Functional Requirements

| # | 需求 / Requirement | 说明 / Description | 优先级 / Priority |
|---|------|------|--------|
| F1 | 创建待办 | 输入标题（必填，1-200 字）+ 可选描述 + 可选截止时间 / Enter a title (required, 1-200 chars) + optional description + optional due date | P0 |
| F2 | 待办列表 | 我的待办：未完成在前，按创建时间倒序；含完成状态 / My todos: incomplete first, sorted by creation time descending; includes completion status | P0 |
| F3 | 切换完成 | 一键勾选/取消完成 / One-tap check/uncheck completion | P0 |
| F4 | 删除待办 | 删除前二次确认 / Second confirmation before deleting | P0 |
| F5 | 编辑待办 | 修改标题/描述/截止时间 / Edit title/description/due date | P1 |
| F6 | 所有权 | 仅本人可访问自己的待办（CASL 行级）/ Only the owner can access their own todos (CASL row-level) | P0 |

## 3. 非功能需求 / Non-Functional Requirements

- 数据隔离：他人待办必须 403（CASL `can('manage','Todo',{userId})`）
  Data isolation: others' todos must return 403 (CASL `can('manage','Todo',{userId})`)
- 校验：标题 1-200，截止时间为合法 ISO 8601
  Validation: title 1-200, due date must be valid ISO 8601
- 前端接入：底部 Tab + Explore 入口 + AI 导航注册
  Frontend integration: bottom Tab + Explore entry + AI navigation registration

## 4. 界面规格 / UI Specification

iOS 风格（Cupertino）：

iOS style (Cupertino):

- 顶部输入框 + 添加按钮，回车或点击添加
  Top input field + add button; Enter or click adds
- 列表项：圆形勾选图标（点击切换）+ 标题（完成加删除线）+ 右侧删除按钮
  List item: circular check icon (tap to toggle) + title (strikethrough when completed) + delete button on the right
- 删除弹二次确认
  Delete shows a second confirmation
- 空态：暂无待办
  Empty state: no todos yet

## 5. 验收标准 / Acceptance Criteria

- 后端 e2e：创建→列表→切换完成→删除 全链路；他人删除返回 403
  Backend e2e: full chain create → list → toggle complete → delete; deleting others' todos returns 403
- 前端：Tab 可进入、增删勾选正常
  Frontend: the Tab is reachable; add/delete/check work correctly
- 迁移：AddTodos 迁移在 SQLite/PostgreSQL 均可执行
  Migration: the AddTodos migration runs on both SQLite/PostgreSQL

## 6. 风险与依赖 / Risks and Dependencies

- 无外部依赖。userId 字段当前 nullable（实体宽松），后续如需强外键可收紧。
  No external dependencies. The userId field is currently nullable (lenient entity); it can be tightened later with a strong foreign key if needed.
