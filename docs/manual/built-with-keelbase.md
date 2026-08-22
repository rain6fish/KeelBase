# Built with KeelBase — 来源身份与 Badge 规范

> 定位：让「识别一个 KeelBase 应用」成为确定性的机器可读操作，并为第三方应用提供「Built with KeelBase」徽标贴法。
> 命名：本文件用中性词「来源身份 / provenance」。**生态发现**（registry / 发现页）待第三方应用出现后（1.0 后 External Validation）再激活——本文件先定义好协议层，应用来了即用。

---

## 1. 什么是 KeelBase 来源身份

| 层 | 载体 | 回答 |
|---|---|---|
| **静态**（Build 侧）| `.keelbase/manifest.json`（`keelbase init` 生成/幂等合并：schema/identity/generator/version/protocol/modules）| 这是什么项目、协议几版、含哪些生成模块 |
| **CLI 识别** | `keelbase inspect`（来源 + 能力指纹）· `keelbase doctor`（完整性/一致性/运行时/版本/兼容矩阵五查）| 是否 KeelBase 应用、是否健康、协议是否兼容 |
| **运行时**（Run 侧）| `GET /app/provenance`（来源身份 + 能力清单 + AI 工具指纹：读写分类/风险级分布）| 运行中的系统有哪些能力 |

`inspect`/`doctor` 是 Build 侧 CLI，`/app/provenance` 是运行时 HTTP 端点——互补覆盖「源码里是什么」与「跑起来是什么」。

## 2. 识别一个 KeelBase 应用（三步）

```bash
# ① CLI：源码侧来源身份（退出 0 = KeelBase 应用）
node scripts/keelbase-init.mjs inspect

# ② 运行时：跑起来的能力指纹（公开，无需认证）
curl <base>/api/v1/app/provenance

# ③ 健康诊断（完整性 / 一致性 / 运行时 / 生成器版本）
node scripts/keelbase-init.mjs doctor
```

非 KeelBase 项目运行 `inspect` 退出 1（清单缺失），不抛栈不锁定。

## 3. "Built with KeelBase" Badge 规范

### 3.1 Markdown 徽标

```markdown
[![Built with KeelBase](https://img.shields.io/badge/Built%20with-KeelBase-4A90D9)](https://github.com/rain6fish/KeelBase)
```

### 3.2 语义

- badge = 应用由 KeelBase 构建（业务模块经 `keelbase init` 生成，运行时 AI/治理基于 KeelBase）。
- **不承诺** 具体兼容版本；可在 badge 旁注明 manifest 的 `protocol` 版本（如 `protocol 1.0`）。
- **可验证**：应用 README 应指向含 `.keelbase/manifest.json` 的仓库，或说明运行时 `/app/provenance` 可访问——badge 不是空头声明。

### 3.3 贴法（应用 README 顶部）

```markdown
# 我的应用

[![Built with KeelBase](https://img.shields.io/badge/Built%20with-KeelBase-4A90D9)](https://github.com/rain6fish/KeelBase)

- 来源身份：`.keelbase/manifest.json`（`keelbase inspect` 可验证）
- 运行时指纹：`GET /app/provenance`
```

## 4. 生态原则

- **无遥测**：来源身份不收集任何数据，纯本地清单 + 公开端点。
- **无锁定**：删除 `.keelbase/manifest.json` 不破坏任何代码（来源标记可移除）。
- **非水印**：不注入源码标记，不扫描用户代码。
- **协议层先行**：本规范先定好，生态发现等第三方应用出现后激活。

## 5. 当前状态（2026-08-21）

- 来源身份能力完整：`.keelbase/manifest.json` + `keelbase inspect`/`doctor` + `GET /app/provenance`，均已实现并测试。
- 官方模板/生成链路均携带来源身份：`keelbase init` 幂等合并 manifest（gate ⑨ Provenance 验证）；模板市场 `GET /admin/templates` 列表附 `provenance`（source/templateId/keelbaseVersion）。
- **待第三方**：生态发现（registry / 发现页）、badge 聚合展示——1.0 后 External Validation 出现真实应用时激活。

## 相关

- [module-protocol.md](../module-protocol.md) §6 生成来源身份
- [release-1.0-candidate.md](release-1.0-candidate.md) Gate 4
