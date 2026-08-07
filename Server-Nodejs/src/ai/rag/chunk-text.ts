/**
 * 文本切块 — 纯函数，按段落贪心打包 + overlap 续接。
 * 面向中文无需 tokenizer，按字符切分足够。
 */

export interface ChunkTextOptions {
  max?: number;
  overlap?: number;
}

/** 默认单块上限字符数 */
const DEFAULT_MAX = 800;
/** 块间重叠字符数（保上下文连续） */
const DEFAULT_OVERLAP = 100;

export function chunkText(
  content: string,
  opts: ChunkTextOptions = {},
): string[] {
  const max = opts.max ?? DEFAULT_MAX;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;

  // 规范化空白
  let text = content.replace(/\r\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ').trim();
  if (!text) return [];

  // 按段落切分
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current = '';

  const emit = (chunk: string) => {
    const t = chunk.trim();
    if (t) chunks.push(t);
  };

  const startWithOverlap = (tail: string, paragraph: string): string => {
    const tailLen = Math.min(overlap, tail.length);
    const tailOverlap = tail.slice(tail.length - tailLen).trimStart();
    return tailOverlap ? `${tailOverlap}\n${paragraph}` : paragraph;
  };

  for (const paragraph of paragraphs) {
    // 单段超过 max：硬切
    if (paragraph.length > max) {
      if (current) {
        emit(current);
        current = '';
      }
      let rest = paragraph;
      while (rest.length > max) {
        const piece = rest.slice(0, max);
        emit(piece);
        const tailLen = Math.min(overlap, rest.length - max);
        rest = rest.slice(max - tailLen);
      }
      if (rest) {
        current = rest;
      }
      continue;
    }

    // 段能塞进当前块则续接
    if (!current) {
      current = paragraph;
      continue;
    }
    const candidate = `${current}\n${paragraph}`;
    if (candidate.length <= max + overlap) {
      current = candidate;
      continue;
    }
    // 塞不下：收尾当前块，新块用 overlap 续接
    emit(current);
    current = startWithOverlap(current, paragraph);
  }

  if (current) emit(current);
  return chunks;
}
