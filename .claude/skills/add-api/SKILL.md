---
name: add-api
description: 给现有业务模块新增 API 端点（REST + CASL 权限 + 审计 + Swagger + 测试）
---

# 加 API 端点（EASY-6 ④）

## 用途
给已有模块加新端点（如 `GET /events/upcoming`、`POST /todos/bulk`）。

## 步骤

### 后端（Server-NestJS）
1. **Controller**：`src/<module>/<module>.controller.ts` 加方法
   - RESTful：`GET`=查询 `POST`=创建 `PUT`=更新 `DELETE`=删，路径 `@Get('xxx')`
   - 加 `@ApiOperation({ summary: '...' })`（Swagger 自动生成，AI 可消费元数据）
   - **权限**：需要登录默认即可；管理员加 `@CheckPolicies((a) => a.can('manage', 'all'))`；本人数据用 `@CurrentUser()` 取 userId
2. **Service**：加方法，**所有权校验**——操作他人数据抛 `ForbiddenException`
3. **DTO**：入参用 class-validator 装饰器（whitelist 校验，多余字段剔除）
4. **审计**：写操作（POST/PUT/DELETE）由全局 OperationAuditInterceptor 自动捕获，无需手写
5. **测试**：`<module>.service.spec.ts` 补单测（含越权 403 / 未认证 401）；关键路径补 e2e

### 前端（如需）
- Flutter：repository 加方法 + provider 暴露 + page 调用
- i18n：新文案走 `app_localizations.dart`（中英双语）

### AI 集成（如该 API 供 AI 工具用）
- `src/ai/tools/` 注册对应 AiTool，execute 带 userId + 所有权校验

## 验收
- `npm run build` + `npm test -- <module>` 通过
- Swagger（`/api/docs`）能看到新端点
- 越权访问返回 403

## 安全红线（不得破坏）
- 用户只能访问本人数据（userId 隔离）
- 敏感字段不返回明文（管理端脱敏）
