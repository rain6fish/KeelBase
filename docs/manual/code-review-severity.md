# 代码扫描严重度映射 / Code Review Severity Mapping

> 原则：静态扫描器按通用规则报严重度，**不能直接当 KeelBase 缺陷分级**。先过本映射再进 backlog，否则 AI 每次跑扫描都会制造几十上百个「严重问题」，淹没真正影响 Trust 的缺陷。

## 映射表 / Mapping

| 扫描器 Severity | KeelBase 级 | 处理动作 | 例 |
|---|---|---|---|
| Critical | P0 | 立即评估是否 Trust/安全/正确性缺陷；是则 P0，否则降级 | 数据越权 / 审计链可被篡改 |
| High | P0/P1 | 按是否属于 Server Runtime 或 Trust 核心链（Identity→Authz→Tool→Confirm→SideEffect→Audit→Revoke）判定 | 真越权、绕过确认执行写工具 |
| Medium | P1/P2 | 确认影响面；Engine 缺陷进 backlog，非核心可 P2 | 资源泄漏、竞态 |
| Low | P2/P3 | 通常进 P3 一次性清理 | 空指针兜底、edge case |
| Style | P3 | 一次性 formatter/lint 清理，不逐条建 issue | 缩进 / 分号 / 引号 |
| Documentation | P3 | 随文档改动顺手修 | 过期注释 / HTML 语义标签 |
| Generated / config | 通常 P3 | 模板型/生成型文件不污染核心指标 | Taro 配置、脚手架样板 |
| 工具误报 / 规则不适配 | Ignore | 记录原因后忽略 | Flutter Bridging Header 缺 guard、`#import`、一次性脚本 `open` |

## 处理流程 / Workflow

1. 扫描 → 逐条过映射表分类。
2. P0/P1：只保留真正归属 Trust/安全/正确性的项，进 backlog。
3. P2：按模块记录，Engine/核心优先。
4. P3：一次性清理（跑各端自带 formatter/lint），不逐条建 issue。
5. Ignore：写明理由，不建 issue。

## 实证参考 / Evidence

一次对全仓库的静态扫描约产生 **~180 条**发现，实际 **约 145 条「提示」+ 33 条「一般」+ 仅 2 条「严重」**；多数集中在模板/生成型前端（格式风暴）与文档；2 条「严重」经复核均不属 Server Runtime 安全（一次性脚本资源管理、Flutter 桥接头误报）。结论：**按映射过滤后，真正需进 backlog 的极少，且集中 Trust 核心链。**

相关：[[../../README]] · docs/manual/release-precheck · docs/keelbase-dna.md
