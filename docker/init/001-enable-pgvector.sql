-- 启用向量扩展（pgvector）
CREATE EXTENSION IF NOT EXISTS vector;

-- 启用 uuid 生成（ai_conversations.id 默认值）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 验证版本
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
