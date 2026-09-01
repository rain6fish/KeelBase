// SPDX-License-Identifier: Apache-2.0

/**
 * 文档解析 — PDF/DOCX 文本抽取（无 DI，纯函数）
 *
 * 仅支持 PDF 与 DOCX（Word）。解析失败抛错，由调用方转 400。
 * pdf-parse v2（安全版，无 v1 的 debug-data 加载器漏洞）。
 */

import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

export type DocType = 'pdf' | 'docx';

export const KNOWLEDGE_DOC_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const MAX_KNOWLEDGE_FILE_SIZE = 10 * 1024 * 1024;

/** 解析文本长度上限（≈1000 个 800 字 chunk），防病态文档拖垮向量化 */
export const MAX_DOC_CHARS = 800_000;

/** 识别扩展名 → 文档类型（'.pdf' | '.docx'，小写） */
export function detectDocType(ext: string): DocType | null {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (e === '.docx') return 'docx';
  return null;
}

/** 解析文档 buffer → 纯文本。失败抛错。 */
export async function parseDocument(
  buffer: Buffer,
  docType: DocType,
): Promise<string> {
  if (docType === 'pdf') {
    const pdf = new PDFParse({ data: buffer });
    const result = (await pdf.getText()) as unknown as { text?: string };
    return result?.text ?? '';
  }
  // docx
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? '';
}
