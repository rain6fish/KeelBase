# Cross-platform Capability Matrix（多端能力对齐矩阵）

> 2026-08-23 依据 roadmap §10 正式化 + 代码核对。多端是工程优势，但不能演变成 Capability Drift——新能力必须明确各端支持情况。

## 1. 端定位

| 端 | 目录 | 定位 |
|---|---|---|
| **Backend** | `Server-NestJS/` | Core：实体 / CASL / AI 运行时 / 治理 / 审计 / Protocol |
| **Flutter** | `Front-Flutter/` | **移动主 App**（iOS / Android）；Flutter web 仅作移动 App 的 Web 预览形态，不作为独立产品界面 |
| **Taro** | `Front-Taro/` | H5 / 小程序（轻量入口，不含管理功能） |
| **Web-Admin** | `Web-Admin-Vue/` | **Web 业务 UI 唯一宿主**——同一壳两套导航：工作台（普通用户业务）/ 控制台（管理员）；Flutter 不再承担 Web 业务界面 |

## 2. 能力矩阵（✅ 核对现状 / ✗ 该端无 / P1·P2 规划）

| Capability | Backend | Flutter | Taro | Web-Admin |
|---|---:|---:|---:|---:|
| Auth | ✅ | ✅ | ✅ | ✅ |
| AI Chat（用户对话） | ✅ | ✅ | ✅（无确认卡） | ✗（工作台无；控制台 System AI 非用户对话） |
| Tool Confirmation（写确认） | ✅ | ✅ | ✗ | ✗ |
| Audit（AI 审计） | ✅ | ✅（本人轨迹） | ✗ | ✅（控制台审计页） |
| Notification | ✅ | ✅ | ✅ | ✅（工作台 + 控制台） |
| Agent Decision Trace | ✅ | ✅ | ✗ | ✅（工作台 AiTrace） |
| Approval（旗舰） | ✅ | ✅ | ✗ | ✅（工作台审批） |
| AI CRM / PM（旗舰） | ✅ | ✅ | ✗ | ✅（工作台） |

> 注：与 roadmap §10 原表的差异（2026-08-23 核对更正）：Taro 的 Tool Confirmation / Audit / Trace 为 ✗（Taro `ai` 页无确认卡）；Web-Admin 工作台无用户 AI 对话页（原表 AI Chat ✓ 属乐观标记）。

## 3. 新增能力时的核对方法（防 Capability Drift）

每个新能力进入时，按「能力对齐清单」明确并登记到矩阵：

1. 哪些端支持 / 哪些暂不支持（标 P1/P2 规划）
2. 是否影响生成器（`keelbase init` 模板）
3. 是否影响 Protocol（Application Model 字段/工具映射）
4. Web 业务 UI 归**工作台**还是移动归 **Flutter**（新增业务模块 UI 策略：后端一次生成 → 业务 Web 页只进工作台、移动页进 Flutter）

**端 UI 归属决策**（2026-08-17 定）：
- Web 业务 UI 唯一宿主 = 工作台（Vue 壳 Workbench 侧）
- 新业务模块 UI：后端一次生成 → 业务 Web 页只进工作台、移动页进 Flutter（不再两端各做一遍）

## 4. 核对记录

- **2026-08-23**：依据现状代码核对（Flutter `features/`、Taro `pages/`、Web-Admin `views/workbench`+`views/console`）；Taro `ai` 页无确认卡、Web 工作台无用户 AI 对话页 → 矩阵据实更正。
