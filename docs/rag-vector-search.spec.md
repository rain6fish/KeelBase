# RAG 向量检索升级 — RagVectorSearch（AI-5）

## 1. 概述

知识库检索从全文搜索升级为向量检索（pgvector + OpenAI 兼容 embedding），保留全文搜索兜底。降级链设计，无外部配置的环境自动回退全文，不影响既有功能。

## 2. EmbeddingsService（`src/ai/embeddings/embeddings.service.ts`）

原生 fetch 调用 OpenAI 兼容 `/embeddings`（零依赖，同 LlmProvider 风格）。

```typescript
@Injectable()
export class EmbeddingsService {
  constructor(private readonly configService: ConfigService) {}

  /** 向量功能是否可用：开关 + postgres + key + model 全部满足 */
  isAvailable(): boolean

  /** 生成单文本 embedding；失败抛错，由调用方降级 */
  async embed(text: string): Promise<number[]>
}
```

- `embed`：`POST ${baseURL}/embeddings`，body `{ model, input: text }`，解析 `data[0].embedding`
- baseURL 去尾斜杠
- 超时/非 200 → 抛错

## 3. 迁移 `AddKnowledgeEmbeddings`

`src/migrations/*-AddKnowledgeEmbeddings.ts`：

| 分支 | 动作 |
|------|------|
| postgres | `CREATE TABLE ai_knowledge_embeddings (id serial PK, article_id int NOT NULL REFERENCES ai_knowledge_articles(id) ON DELETE CASCADE, embedding vector(1536) NOT NULL, model varchar(64), created_at timestamptz DEFAULT now())` + `CREATE INDEX ON ... USING hnsw (embedding vector_cosine_ops)` |
| sqlite | 无操作（保证 CI migration-consistency 通过） |

分支判断：`(queryRunner.connection.options as any).type === 'postgres'`。

## 4. KnowledgeService 改造

注入 `EmbeddingsService` + `@InjectDataSource() DataSource`。

### 4.1 写入向量化（create / update）

```typescript
// create/update 保存成功后（失败静默，不阻断业务）
if (embeddingsService.isAvailable()) {
  try {
    const vector = await embeddingsService.embed(`${title}\n${content}`);
    await this.dataSource.query(
      `INSERT INTO ai_knowledge_embeddings (article_id, embedding, model)
       VALUES ($1, $2::vector, $3)
       ON CONFLICT (article_id) DO UPDATE SET embedding = EXCLUDED.embedding, model = EXCLUDED.model`,
      [id, `[${vector.join(',')}]`, model],
    );
  } catch (err) {
    this.logger.warn(`[RAG] embedding write failed article=${id}: ${err.message}`);
  }
}
```

需 `UNIQUE(article_id)` 约束支持 upsert。

### 4.2 删除（remove）

`DELETE FROM ai_knowledge_embeddings WHERE article_id = $1`（失败静默）。

### 4.3 search 降级链

```typescript
async search(query: string, limit = 5): Promise<KnowledgeArticle[]> {
  const keyword = query.trim();
  if (!keyword) return [];

  if (this.embeddingsService.isAvailable()) {
    try {
      return await this.vectorSearch(keyword, limit);
    } catch (err) {
      this.logger.warn(`[RAG] vector search failed, fallback to full-text: ${err.message}`);
    }
  }
  return this.fullTextSearch(keyword, limit);
}

private async vectorSearch(query: string, limit: number): Promise<KnowledgeArticle[]> {
  const vector = await this.embeddingsService.embed(query);
  const rows = await this.dataSource.query(
    `SELECT a.id, a.title, a.content, a.category, a."createdAt", a."updatedAt"
     FROM ai_knowledge_articles a
     JOIN ai_knowledge_embeddings e ON e.article_id = a.id
     ORDER BY e.embedding <-> $1::vector
     LIMIT $2`,
    [`[${vector.join(',')}]`, limit],
  );
  return rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) }));
}
```

`KnowledgeService.search` 签名不变 → **RagAgent 零改动**。

## 5. 配置

`env.config.ts` 加：

```typescript
VECTOR_SEARCH_ENABLED: Joi.boolean().default(true),
EMBEDDING_BASE_URL: Joi.string().allow('').default(''),
EMBEDDING_API_KEY: Joi.string().allow('').default(''),
EMBEDDING_MODEL: Joi.string().default('text-embedding-3-small'),
EMBEDDING_DIMENSIONS: Joi.number().default(1536),
```

`.env.example` 同步。

## 6. 测试

- `embeddings.service.spec.ts`：isAvailable 各条件（开关/db/key/model 缺失 → false）、embed 成功解析、embed 失败抛错
- `knowledge.service.spec.ts`：
  - create/update：isAvailable=true 时写入向量（mock dataSource.query 断言调用 + upsert SQL）；false 时跳过
  - search：isAvailable=true → 向量检索调用；查询抛错 → 降级全文；isAvailable=false → 直接全文
  - 既有用例适配（注入 mock EmbeddingsService + DataSource）
- e2e：sqlite 环境无向量表，search 走全文，全绿不受影响

## 7. 实测验证（2026-08-06 postgres 容器）

用 `scripts/mock-embeddings.mjs`（本地 mock，2-gram 稀疏向量，相似文本 → 余弦距离小）+ pgvector 容器实测：

1. **docker-compose postgres 改用 `pgvector/pgvector:pg17` 镜像 + 挂载 `docker/init/001-enable-pgvector.sql`** → 容器启动自动启用 `vector 0.8.2` 扩展
2. 后端 `DB_TYPE=postgres` + `EMBEDDING_*` 指向 mock 启动，dev 模式 synchronize 建表（12 表）
3. 手动建 `ai_knowledge_embeddings`（vector(1536) + HNSW 余弦索引 + FK 级联）——迁移 postgres SQL 已实测可用
4. **API 创建知识条目 → 自动向量化**：`ai_knowledge_embeddings` 每篇写入 1536 维向量（model=text-embedding-3-small）
5. **语义排序**：查询「带薪休假按工龄计算」→ 年假规则(0.90) > 休假政策(1.23) > 请假流程(1.40)，向量路径生效（无降级 warn）

> 注：迁移文件本身为 sqlite 方言（`AUTOINCREMENT`/`datetime('now')`），postgres 下 `migration:run` 会失败——dev 用 synchronize 建表，向量表手动建或后续补 postgres 版基线迁移。

## 8. 后续

- 混合检索（向量 + 全文加权融合）
- 知识条目分块（长文档 chunking）
- 换 embedding 模型（维度变化需迁移重建）
- 本地 embedding（如 ONNX/bge）免外部 API
