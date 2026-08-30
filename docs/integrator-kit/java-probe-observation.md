# Java 探针观察窗口（Java Probe Observation）

> 用 `keelbase-java-starter` 作为 **Java 需求的低成本探针**：观察市场是否真的要求"整体 Java 版 KeelBase"，据此决定是否启动 KeelBase4J（Java 版产品）。需求驱动，非可行性驱动。
> Using `keelbase-java-starter` as a low-cost **demand probe for Java**: observe whether the market truly requires a full Java KeelBase, and only then decide whether to start KeelBase4J. Demand-driven, not feasibility-driven.

## 一、为什么用探针（Why a probe）

不重写 Java 运行时（永久双维护 + Build 侧目标栈翻倍 + 安全移植风险），用 **协议桥接 + Java 开发体验** 两条腿解套。探针的作用是**低成本验证需求是否真实存在**，避免用 2x 维护成本去赌一个未验证的市场。

> Do not rewrite the Java runtime (permanent dual-maintenance + doubled Build targets + highest security-port risk). The probe verifies whether real demand exists, without betting 2x maintenance cost on an unvalidated market.

## 二、观察对象（Probe targets）

| 对象 | 坐标 / 地址 | 说明 |
|---|---|---|
| Maven Central 构件 | `cn.com.keelbase:*`（7+ 构件：client / compensation / delegation-filter / tools-annotation / tools-export / spring-boot-autoconfigure / spring-boot-starter / starter-parent） | 发布状态 + 版本演进（repo1 目录探测，比 search API 索引可靠） |
| GitHub 仓库 | `rain6fish/KeelBase-java-starter` | stars / forks / issues / 活跃度 |
| 集成商反馈 | 人工渠道（issue / 邮件 / 咨询） | **关键触发信号来源** |

## 三、信号清单（Signal checklist）

| 信号 | 采集方式 | 含义 |
|---|---|---|
| 构件在线 + 最新版本 | `node scripts/check-java-probe.mjs`（repo1 探测） | 发布链路健康，可被 Java 团队拉取 |
| Maven 下载量 > 0 | mvnrepository 页面人工查看（无公开 API） | 有人实际在拉取使用 |
| GitHub stars / forks / issues | 脚本 + GitHub API | 认知与采纳迹象 |
| 集成商咨询 / PoC | 人工记录 | 真实需求信号 |
| **集成商反馈「产品好，但整体不是 Java 无法立项」** | 人工记录（issue / 邮件） | **KeelBase4J 启动的核心触发依据** |

## 四、触发条件（KeelBase4J 启动依据）

> 只有出现**明确的需求信号**才启动 Java 版产品：集成商试用后反馈"产品好，但整体不是 Java 无法立项"（整体非 Java 无法投标的政企/央国企/信创段位）。
> 在信号出现前：不做 KeelBase4J，不另建仓库，不改名，不加 Java 版模块；`java-starter` 持续作为一等公民接入层维护。
>
> The trigger is explicit integrator feedback — "the product is good, but we can't bid without an all-Java stack." Until then: no KeelBase4J, no new repo, no rename, no Java-version modules; keep `java-starter` as a first-class integration layer.

若启动，正确姿势 = 分层移植：只移 Core + AI 治理层 + 旗舰模块（CRM/PM/Approval），复用协议约定让 AI 生成 Java 模块，绝不 1:1 全量照搬。

## 五、评估节奏（Cadence）

1. **每 2-4 周**跑一次 `node scripts/check-java-probe.mjs`，快照落 `docs/benchmark/java-probe-*.json`；
2. 人工补充：Maven 下载量页面 + GitHub issues/PR + 集成商反馈，追加到快照或本表；
3. **每季度**评估一次"是否出现触发信号"，结论记入私有 roadmap（Java 战略章节）。

## 六、快照记录（Snapshot log）

| 日期 | 构件在线 | 最新版本 | GitHub | 采纳信号 | 触发信号 | 结论 |
|---|---|---|---|---|---|---|
| 2026-08-30 | 8/8 | 0.1.1 | 0⭐ 0🍴 0 issue | 下载量待人工核 | 无 | 探针运行正常，未触发；持续观察 |
|  |  |  |  |  |  |  |

## 相关（Related）

- 战略决策：[私有 roadmap · Java 战略章节]（KeelBase4J 触发条件）· 接入层能力：[reference-project-guide.md](reference-project-guide.md)
- 采集脚本：[check-java-probe.mjs](../../scripts/check-java-probe.mjs) · 集成商套件总览：[../integrator-kit.md](../integrator-kit.md)
