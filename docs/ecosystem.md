# KeelBase family — single source / KeelBase 家族——唯一来源

> **This file is the single source for the "KeelBase family" section.** The matching section in each
> repository's README is generated from the two marked regions below by
> [`scripts/sync-family-block.mjs`](../scripts/sync-family-block.mjs) — **edit here, not there.**
> Run `node scripts/sync-family-block.mjs` to propagate, or `--check` to verify without writing.
>
> **本文件是「KeelBase 家族」段的唯一来源。** 各仓 README 里的同名段由
> [`scripts/sync-family-block.mjs`](../scripts/sync-family-block.mjs) 从下面两个标记区推出——
> **不要手改 README 里那一段**，改这里。跑 `node scripts/sync-family-block.mjs` 推送，
> 加 `--check` 只校验不写。

## Why one family / 为什么是一个家族

KeelBase is not a set of parallel products but **one protocol with several implementations and
hosts**. The contract repository defines the protocol semantics — the wire schemas, the
language-neutral conformance vectors, and the single version line they share. Two runtimes consume
that same contract **in parallel**: neither is a translation of the other. The bridge wires
**existing** Java/Spring systems in; the host adapter adds the governance layer to a mature
enterprise platform. Keeping those two apart — *connecting an existing system* versus *adding a
governance layer to a platform* — is the key to reading this family.

KeelBase 不是几个并列的产品，而是**一套协议 + 多个实现 + 多种宿主**。契约仓定义协议语义——
线缆 schema、语言无关的一致性向量、以及两者共用的那一条版本线。两个 runtime **平行**消费同一份
契约：谁也不是谁的翻译版。桥接层负责把**存量** Java/Spring 系统接进来；宿主适配层把治理层加到成熟的
企业平台上。分清这两件事——*接入存量系统* 与 *给平台加治理层*——是读懂这个家族的钥匙。

## Maintenance rules / 维护约定

1. **The marked regions are the only thing that is synced.** Everything outside them in this file is
   for the reader, not for the READMEs.
   **只有标记区内的内容会被同步。** 本文件里标记区之外的部分是给人读的，不进 README。
2. **Only absolute URLs inside the block.** In particular, no relative links: `check-readme-parity.mjs`
   compares the *relative* link sets of `README.md` and `README.zh-CN.md`, so a relative link that
   exists in the English block but not the Chinese one would fail a gate for no reason.
   **块内只允许绝对 URL。** 尤其是不能有相对链接：`check-readme-parity.mjs` 比对
   `README.md` 与 `README.zh-CN.md` 的**相对**链接集合，英文块里有、中文块里没有的相对链接
   会平白撞红一道门禁。
3. **The `sha256:` stamp on each BEGIN line is the content hash**, computed over the LF-normalised
   region body. It is what lets each repository self-check without the sibling checkouts and without
   network access. It is written by the sync script — never hand-edit it.
   **每行 BEGIN 上的 `sha256:` 戳是内容哈希**，按 LF 归一化后的区内容计算。它让各仓不依赖兄弟
   检出、不联网即可自检。由同步脚本写入——**不要手改**。
4. **No per-repository substitutions.** Deliberately there is no "you are here" marker: the README is
   already the repository's own page. Anything per-repository would break byte-identity.
   **不做按仓替换。** 刻意没有「你在哪」标记：README 本身就是那个仓的页面。任何按仓变量都会破坏逐字节一致。

---

<!-- BEGIN keelbase-family:en sha256:2b814db6cf768ed2e451305808a7a612049519af49310cef56ce7a5bc97bad2c -->
## 🧬 The KeelBase family

> KeelBase is **one protocol with several implementations and hosts** — not a set of competing
> products. The contract is the source of truth; runtimes and hosts consume it, and none of them
> owns it. Every repository here is **Apache-2.0**.

```text
  host adapters   KeelBase-YuDao
                  └ governance added to a mature enterprise platform (yudao)

  runtimes        KeelBase (TypeScript)   ·   KeelBase4J (Java / Spring)
                  └ two carriers of the same protocol — peers, not translations

  bridge          KeelBase-java-starter
                  └ wire an existing Java/Spring system in as governed AI tools

  contract        keelbase-contract
                  └ wire schemas + conformance vectors + the version line they share
```

| Repository | Role | Stack | Status |
|---|---|---|---|
| [`KeelBase`](https://github.com/rain6fish/KeelBase) | Reference implementation · product documentation · demo | TypeScript · NestJS · Vue · Flutter · Taro | active |
| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) | The Java carrier of the same protocol | Java 17 · Spring Boot | active |
| [`KeelBase-java-starter`](https://github.com/rain6fish/KeelBase-java-starter) | Wire an existing Java/Spring system in as governed AI tools | Maven · Gradle | 0.1.x |
| [`KeelBase-YuDao`](https://github.com/rain6fish/KeelBase-YuDao) | Host adapter — the governance layer on a yudao platform | Java · Vue 3 | active |
| [`keelbase-contract`](https://github.com/rain6fish/keelbase-contract) | The protocol itself — schemas, vectors, the version line | JSON Schema | v1.x |

**Where to start** — see it run: [`KeelBase`](https://github.com/rain6fish/KeelBase) (60-second
Docker) · make an existing Java system AI-capable:
[`KeelBase-java-starter`](https://github.com/rain6fish/KeelBase-java-starter) · you already run yudao:
[`KeelBase-YuDao`](https://github.com/rain6fish/KeelBase-YuDao) · implement the protocol:
[`keelbase-contract`](https://github.com/rain6fish/keelbase-contract).

Which contract version each runtime answers for is maintained **once**, in the main repository — see
[Compatibility](https://github.com/rain6fish/KeelBase#-compatibility). It is not duplicated here.
<!-- END keelbase-family:en -->

<!-- BEGIN keelbase-family:zh sha256:71b3f61e591ebb6fe93043059b0e22041d60492f0e6bc804ecc44759bef4312f -->
## 🧬 KeelBase 家族

> KeelBase 是**一套协议、多个实现与多种宿主**——不是几个互相竞争的产品。契约是唯一真源，
> 各 runtime 与各宿主消费它，**谁也不拥有它**。这里每个仓都是 **Apache-2.0**。

```text
  宿主适配   KeelBase-YuDao
             └ 在成熟企业平台上补治理层（芋道）

  runtime    KeelBase（TypeScript）  ·  KeelBase4J（Java / Spring）
             └ 同一协议的两个载体——互为平行，不是翻译关系

  桥接       KeelBase-java-starter
             └ 把存量 Java/Spring 系统接成受治理的 AI 工具

  契约       keelbase-contract
             └ 线缆 schema + 一致性向量 + 两者共用的版本线
```

| 仓 | 角色 | 技术栈 | 状态 |
|---|---|---|---|
| [`KeelBase`](https://github.com/rain6fish/KeelBase) | 参考实现 · 产品文档 · 演示 | TypeScript · NestJS · Vue · Flutter · Taro | 活跃 |
| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) | 同一协议的 Java 载体 | Java 17 · Spring Boot | 活跃 |
| [`KeelBase-java-starter`](https://github.com/rain6fish/KeelBase-java-starter) | 把存量 Java/Spring 系统接成受治理的 AI 工具 | Maven · Gradle | 0.1.x |
| [`KeelBase-YuDao`](https://github.com/rain6fish/KeelBase-YuDao) | 宿主适配——芋道平台上的治理层 | Java · Vue 3 | 活跃 |
| [`keelbase-contract`](https://github.com/rain6fish/keelbase-contract) | 协议本体——schema、向量、版本线 | JSON Schema | v1.x |

**从哪里开始** —— 想看它跑起来：[`KeelBase`](https://github.com/rain6fish/KeelBase)（60 秒
Docker）· 想让存量 Java 系统具备 AI 能力：
[`KeelBase-java-starter`](https://github.com/rain6fish/KeelBase-java-starter) · 你已经在用芋道：
[`KeelBase-YuDao`](https://github.com/rain6fish/KeelBase-YuDao) · 想实现这个协议：
[`keelbase-contract`](https://github.com/rain6fish/keelbase-contract)。

每个 runtime 对着哪一版契约应答，**只在主仓维护一处**——见
[兼容矩阵](https://github.com/rain6fish/KeelBase/blob/main/README.zh-CN.md#-兼容矩阵)。此处不重复。
<!-- END keelbase-family:zh -->
