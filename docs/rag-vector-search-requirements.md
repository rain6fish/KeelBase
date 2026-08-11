# RAG 向量检索升级（AI-5）需求确认书

> 需求确认日期：2026-08-06
> 状态：已确认

## 1. 背景与目标

RAG 问答当前用全文搜索（LIKE 匹配标题/内容/分类），语义相关但关键词不匹配的文档检索不到。pgvector 已就绪（docker `keelbase-postgres` 容器，`vector 0.8.2` 扩展已启用，库 front）。

**目标**：知识库检索升级为向量检索（语义相似度），保留全文搜索作降级兜底，保证无 Embedding 配置/非 PostgreSQL 环境仍可用。

## 2. 设计原则（降级链）

```
搜索请求 → VECTOR_SEARCH_ENABLED + embedding 可用 + pgvector 表存在
         → 是：向量检索（cosine 距离排序）
         → 否/抛错：全文搜索（LIKE 兜底，原逻辑）
```

- `KnowledgeService.search` 签名不变（RagAgent 零改动）
- 向量不可用打 warn 日志（同 CacheService / Queue 降级风格）
- 无 Embedding 配置 / SQLite / 表缺失 / 查询异常 → 全部静默降级全文

## 3. 功能需求

| # | 需求 | 说明 | 优先级 |
|---|------|------|--------|
| F1 | Embedding 服务 | OpenAI 兼容 `/embeddings` 调用（配置驱动，原生 fetch 零依赖） | P0 |
| F2 | 向量存储 | pgvector 表存知识条目 embedding（cosine 距离 + HNSW 索引） | P0 |
| F3 | 写入向量化 | 创建/更新知识条目时自动生成并存储 embedding（失败不阻断） | P0 |
| F4 | 向量检索 | search 优先向量检索，失败降级全文 | P0 |
| F5 | 配置开关 | `VECTOR_SEARCH_ENABLED` + embedding 连接配置 | P0 |

**不在范围**：混合检索（向量+全文加权融合）、知识条目分块（chunking）、rerank 重排。

## 4. 配置

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `VECTOR_SEARCH_ENABLED` | true | 总开关 |
| `EMBEDDING_BASE_URL` | '' | OpenAI 兼容 embeddings 端点基址（如 https://api.openai.com/v1） |
| `EMBEDDING_API_KEY` | '' | 嵌入 API key |
| `EMBEDDING_MODEL` | 'text-embedding-3-small' | 嵌入模型（维度须与迁移一致） |
| `EMBEDDING_DIMENSIONS` | 1536 | 向量维度（对应迁移 vector(1536)） |

**向量可用条件**：`VECTOR_SEARCH_ENABLED=true` + `DB_TYPE=postgres` + `EMBEDDING_API_KEY` + `EMBEDDING_MODEL` 全部满足。任一缺失 → 全文降级。

## 5. 迁移策略

`AddKnowledgeEmbeddings` 迁移：
- **postgres**：建 `ai_knowledge_embeddings` 表（article_id FK 级联删除 + embedding vector(1536) + model + created_at）+ HNSW 余弦索引
- **sqlite**：no-op（空迁移，保证 CI 一致性校验通过——sqlite 下无向量表，实体 metadata 无对应，generate 对比一致）

> 维度变更需重建列或新迁移；默认 1536（OpenAI text-embedding-3-small）。换 Qwen v3（1024）需调整迁移。

## 6. 验收标准

- 单元测试：EmbeddingsService（embed 调用/可用性判断）+ KnowledgeService（向量优先/降级/写入失败静默）
- 既有测试全绿（sqlite 环境走全文，不破坏）
- e2e 全绿（sqlite 无向量表，search 仍走全文）
- 可选：postgres 容器验证向量检索真正生效
