// 本地 mock Embeddings 服务（AI-5 实测用）
// 返回基于输入文本哈希的确定性 1536 维向量；相似文本 → 相似向量（cosine 距离小）。
// 用法: node scripts/mock-embeddings.mjs   （监听 9999，POST /v1/embeddings）
import http from 'node:http';

const DIM = 1536;

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function embed(text) {
  // 基于 2-gram 的稀疏相似：共享子串越多，向量越接近
  const seed = hashSeed(text);
  const v = new Array(DIM).fill(0);
  for (let i = 0; i + 1 < text.length; i++) {
    const gram = text.slice(i, i + 2);
    const g = hashSeed(gram) % DIM;
    v[g] += 1;
  }
  if (v.every((x) => x === 0)) v[seed % DIM] = 1;
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return v.map((x) => x / norm);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.endsWith('/embeddings')) {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const { model, input } = JSON.parse(body);
      const inputs = Array.isArray(input) ? input : [input];
      const data = inputs.map((text) => ({ embedding: embed(String(text)) }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model, data }));
    } catch {
      res.writeHead(400);
      res.end();
    }
  });
});

server.listen(9999, () => {
  console.log('[mock-embeddings] listening on :9999 (POST /v1/embeddings, dim=' + DIM + ')');
});
