// SPDX-License-Identifier: Apache-2.0

import { detectDocType, parseDocument } from './document-parser';

// mock pdf-parse 与 mammoth
// 用 mockImplementation 记录 PDFParse 以在测试中覆盖 getText
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(
    () =>
      ({
        async getText(): Promise<{ text: string }> {
          return { text: 'PDF 内容' };
        },
      }) as any,
  ),
}));

jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({ value: 'DOCX 内容', messages: [] }),
}));

import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

describe('detectDocType', () => {
  it('should detect .pdf', () => {
    expect(detectDocType('.pdf')).toBe('pdf');
    expect(detectDocType('.PDF')).toBe('pdf');
  });

  it('should detect .docx', () => {
    expect(detectDocType('.docx')).toBe('docx');
    expect(detectDocType('.DOCX')).toBe('docx');
  });

  it('should return null for unsupported extensions', () => {
    expect(detectDocType('.txt')).toBeNull();
    expect(detectDocType('.doc')).toBeNull();
    expect(detectDocType('.png')).toBeNull();
  });
});

describe('parseDocument', () => {
  it('should parse pdf via PDFParse.getText', async () => {
    const text = await parseDocument(Buffer.from('fake-pdf'), 'pdf');
    expect(text).toBe('PDF 内容');
  });

  it('should parse docx via mammoth.extractRawText', async () => {
    const text = await parseDocument(Buffer.from('fake-docx'), 'docx');
    expect(text).toBe('DOCX 内容');
    expect(mammoth.extractRawText).toHaveBeenCalledWith({
      buffer: expect.any(Buffer),
    });
  });

  it('should propagate pdf parse errors', async () => {
    (PDFParse as unknown as jest.Mock).mockImplementationOnce(
      () =>
        ({
          async getText(): Promise<string> {
            throw new Error('pdf broken');
          },
        }) as any,
    );
    await expect(parseDocument(Buffer.from('x'), 'pdf')).rejects.toThrow('pdf broken');
  });
});
