# RAG 向量检索升级（AI-5）需求确认书 / RAG Vector Search Upgrade (AI-5) Requirements Confirmation

> 需求确认日期：2026-08-06
> Requirements confirmation date: 2026-08-06
> 状态：已确认
> Status: Confirmed

## 1. 背景与目标 / Background and Goals

RAG 问答当前用全文搜索（LIKE 匹配标题/内容/分类），语义相关但关键词不匹配的文档检索不到。pgvector 已就绪（docker `keelbase-postgres` 容器，`vector 0.8.2` 扩展已启用，库 front）。

RAG Q&A currently uses full-text search (LIKE matching on title/content/category), which cannot retrieve documents that are semantically relevant but have no keyword match. pgvector is ready (docker `keelbase-postgres` container, `vector 0.8.2` extension enabled, database `front`).

**目标**：知识库检索升级为向量检索（语义相似度），保留全文搜索作降级兜底，保证无 Embedding 配置/非 PostgreSQL 环境仍可用。

**Goal**: upgrade knowledge-base retrieval to vector search (semantic similarity), keeping full-text search as a degradation fallback so the feature still works without Embedding configuration or in non-PostgreSQL environments.

## 2. 设计原则（降级链）/ Design Principles (Degradation Chain)

```
搜索请求 → VECTOR_SEARCH_ENABLED + embedding 可用 + pgvector 表存在
         → 是：向量检索（cosine 距离排序）
         → 否/抛错：全文搜索（LIKE 兜底，原逻辑）
```

- `KnowledgeService.search` 签名不变（RagAgent 零改动）
  `KnowledgeService.search` signature unchanged (zero changes to RagAgent)
- 向量不可用打 warn 日志（同 CacheService / Queue 降级风格）
  Log a warn when vectors are unavailable (same style as CacheService / Queue degradation)
- 无 Embedding 配置 / SQLite / 表缺失 / 查询异常 → 全部静默降级全文
  No Embedding config / SQLite / missing table / query errors → all silently degrade to full-text

## 3. 功能需求 / Functional Requirements

| # | 需求 / Requirement | 说明 / Description | 优先级 / Priority |
|---|------|------|--------|
| F1 | Embedding 服务 | OpenAI 兼容 `/embeddings` 调用（配置驱动，原生 fetch 零依赖）/ OpenAI-compatible `/embeddings` call (config-driven, native fetch, zero dependencies) | P0 |
| F2 | 向量存储 | pgvector 表存知识条目 embedding（cosine 距离 + HNSW 索引）/ pgvector table stores knowledge-entry embeddings (cosine distance + HNSW index) | P0 |
| F3 | 写入向量化 | 创建/更新知识条目时自动生成并存储 embedding（失败不阻断）/ Auto-generate and store the embedding when creating/updating a knowledge entry (failure does not block) | P0 |
| F4 | 向量检索 | search 优先向量检索，失败降级全文 / search prefers vector retrieval, falls back to full-text on failure | P0 |
| F5 | 配置开关 | `VECTOR_SEARCH_ENABLED` + embedding 连接配置 / `VECTOR_SEARCH_ENABLED` + embedding connection config | P0 |

**不在范围**：混合检索（向量+全文加权融合）、知识条目分块（chunking）、rerank 重排。

**Out of scope**: hybrid retrieval (weighted fusion of vector + full-text), knowledge-entry chunking, rerank reordering.

## 4. 配置 / Configuration

| 环境变量 / Env Var | 默认 / Default | 说明 / Description |
|----------|------|------|
| `VECTOR_SEARCH_ENABLED` | true | 总开关 / Master switch |
| `EMBEDDING_BASE_URL` | '' | OpenAI 兼容 embeddings 端点基址（如 https://api.openai.com/v1）/ OpenAI-compatible embeddings endpoint base URL (e.g. https://api.openai.com/v1) |
| `EMBEDDING_API_KEY` | '' | 嵌入 API key / Embedding API key |
| `EMBEDDING_MODEL` | 'text-embedding-3-small' | 嵌入模型（维度须与迁移一致）/ Embedding model (dimensions must match the migration) |
| `EMBEDDING_DIMENSIONS` | 1536 | 向量维度（对应迁移 vector(1536)）/ Vector dimensions (corresponds to migration vector(1536)) |

**向量可用条件**：`VECTOR_SEARCH_ENABLED=true` + `DB_TYPE=postgres` + `EMBEDDING_API_KEY` + `EMBEDDING_MODEL` 全部满足。任一缺失 → 全文降级。

**Vector availability condition**: `VECTOR_SEARCH_ENABLED=true` + `DB_TYPE=postgres` + `EMBEDDING_API_KEY` + `EMBEDDING_MODEL` must all be satisfied. If any is missing → degrade to full-text.

## 5. 迁移策略 / Migration Strategy

`AddKnowledgeEmbeddings` 迁移：

The `AddKnowledgeEmbeddings` migration:

- **postgres**：建 `ai_knowledge_embeddings` 表（article_id FK 级联删除 + embedding vector(1536) + model + created_at）+ HNSW 余弦索引
  **postgres**: creates the `ai_knowledge_embeddings` table (article_id FK cascade delete + embedding vector(1536) + model + created_at) + HNSW cosine index
- **sqlite**：no-op（空迁移，保证 CI 一致性校验通过——sqlite 下无向量表，实体 metadata 无对应，generate 对比一致）
  **sqlite**: no-op (empty migration, keeps the CI consistency check passing — no vector table under sqlite, no entity-metadata counterpart, so the generate comparison stays consistent)

> 维度变更需重建列或新迁移；默认 1536（OpenAI text-embedding-3-small）。换 Qwen v3（1024）需调整迁移。
> Changing dimensions requires rebuilding the column or a new migration; the default is 1536 (OpenAI text-embedding-3-small). Switching to Qwen v3 (1024) requires adjusting the migration.

## 6. 验收标准 / Acceptance Criteria

- 单元测试：EmbeddingsService（embed 调用/可用性判断）+ KnowledgeService（向量优先/降级/写入失败静默）
  Unit tests: EmbeddingsService (embed call / availability check) + KnowledgeService (vector-first / degradation / silent write failure)
- 既有测试全绿（sqlite 环境走全文，不破坏）
  Existing tests all green (sqlite environment uses full-text, nothing broken)
- e2e 全绿（sqlite 无向量表，search 仍走全文）
  e2e all green (sqlite has no vector table; search still uses full-text)
- 可选：postgres 容器验证向量检索真正生效
  Optional: verify vector search actually works in a postgres container
