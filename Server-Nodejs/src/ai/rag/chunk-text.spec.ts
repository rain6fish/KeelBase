import { chunkText } from './chunk-text';

describe('chunkText', () => {
  it('should return empty for empty/whitespace content', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('should return a single chunk for short text', () => {
    const result = chunkText('hello world');
    expect(result).toEqual(['hello world']);
  });

  it('should split long text into multiple chunks each within max+overlap', () => {
    const content = Array.from({ length: 30 }, (_, i) => `段落${i}：这是第 ${i} 段内容，用于测试切块。`)
      .join('\n');
    const max = 200;
    const result = chunkText(content, { max, overlap: 20 });
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(max + 20);
      expect(chunk.length).toBeGreaterThan(0);
    }
    // 所有内容被覆盖
    const joined = result.join('\n');
    expect(joined).toContain('段落0');
    expect(joined).toContain('段落29');
  });

  it('should preserve continuity with overlap (next chunk starts with prior tail)', () => {
    const content = Array.from({ length: 20 }, (_, i) => `第${i}段内容比较长一些方便触发切块逻辑。`)
      .join('\n');
    const max = 120;
    const result = chunkText(content, { max, overlap: 20 });
    expect(result.length).toBeGreaterThan(1);
    // 第二块应包含第一块尾部的部分字符（overlap 续接）
    const firstTail = result[0].slice(-20);
    expect(result[1].includes(firstTail.slice(-10))).toBe(true);
  });

  it('should handle Chinese-only content', () => {
    const content = '你好世界'.repeat(500);
    const result = chunkText(content, { max: 800, overlap: 100 });
    expect(result.length).toBeGreaterThan(1);
    expect(result.every((c) => c.length > 0)).toBe(true);
  });

  it('should hard-split a single over-max paragraph', () => {
    const longPara = 'x'.repeat(2000);
    const result = chunkText(longPara, { max: 800, overlap: 100 });
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(800 + 100);
    }
    expect(result.join('').replace(/^x+/, '').length).toBeLessThan(result.length * 100);
  });
});
