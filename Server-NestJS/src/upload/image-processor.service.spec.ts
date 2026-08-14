import sharp from 'sharp';
import { ImageProcessorService } from './image-processor.service';

/** 构造一张 width x height 的 PNG buffer */
function pngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 50, b: 50 },
    },
  })
    .png()
    .toBuffer();
}

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;

  beforeAll(() => {
    service = new ImageProcessorService();
  });

  it('converts a large PNG to WebP', async () => {
    const input = await pngBuffer(2000, 1500);

    const result = await service.processImage(input, 'photo.png', 'image/png');

    expect(result.mimetype).toBe('image/webp');
    expect(result.filename).toBe('photo.webp');
    // webp 头 RIFF
    expect(result.buffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('webp');
    // 宽度被降到 1280
    expect(meta.width).toBe(1280);
  });

  it('does not upscale a small image', async () => {
    const input = await pngBuffer(400, 300);

    const result = await service.processImage(input, 'small.png', 'image/png');

    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBe(400);
    expect(meta.format).toBe('webp');
  });

  it('passes through gif unchanged', async () => {
    const gif = Buffer.from('GIF89a...', 'ascii');

    const result = await service.processImage(gif, 'anim.gif', 'image/gif');

    expect(result.buffer).toBe(gif);
    expect(result.mimetype).toBe('image/gif');
    expect(result.filename).toBe('anim.gif');
  });

  it('passes through pdf unchanged', async () => {
    const pdf = Buffer.from('%PDF-1.4...', 'ascii');

    const result = await service.processImage(pdf, 'doc.pdf', 'application/pdf');

    expect(result.buffer).toBe(pdf);
    expect(result.mimetype).toBe('application/pdf');
  });

  it('falls back to original when processing fails', async () => {
    // 非图片内容但 MIME 声明为 png → sharp 抛错 → 降级
    const bad = Buffer.from('not an image at all', 'ascii');

    const result = await service.processImage(bad, 'bad.png', 'image/png');

    expect(result.buffer).toBe(bad);
    expect(result.mimetype).toBe('image/png');
  });
});
