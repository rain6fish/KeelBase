/**
 * 对象存储抽象接口 + DI token。
 * 实现：LocalStorageService（本地磁盘）/ S3StorageService（S3/MinIO/OSS 兼容）。
 */
export const STORAGE_SERVICE = 'STORAGE_SERVICE';

export interface StorageService {
  /**
   * 保存文件，返回可访问的 URL（local → /uploads/xxx，s3 → 完整 URL）。
   */
  save(buffer: Buffer, originalName: string, mimetype: string): Promise<string>;

  /**
   * 删除文件（key 为 save 返回 URL 中的对象键）。
   */
  delete(key: string): Promise<void>;

  /**
   * 健康探测（A8）：返回 'up' | 'down'，供 /health?detail=true 展示依赖状态。
   */
  checkHealth(): Promise<'up' | 'down'>;
}
