// SPDX-License-Identifier: Apache-2.0

/**
 * 对象存储抽象接口 + DI token。
 * 实现：LocalStorageService（本地磁盘）/ S3StorageService（S3/MinIO/OSS 兼容）。
 */
export const STORAGE_SERVICE = 'STORAGE_SERVICE';

export interface StorageService {
  /**
   * 保存文件，返回**存储引用**（local 与 s3 均为 `/uploads/<key>`）。
   * CR-21：S3 对象不再公开可读，引用是稳定的 `/uploads/` 路径；
   * 实际取用经 `/uploads` 访问层（签名校验后由 accessRedirectUrl 解析）。
   */
  save(buffer: Buffer, originalName: string, mimetype: string): Promise<string>;

  /**
   * 删除文件（key 为 save 返回引用中的对象键）。
   */
  delete(key: string): Promise<void>;

  /**
   * 健康探测（A8）：返回 'up' | 'down'，供 /health?detail=true 展示依赖状态。
   */
  checkHealth(): Promise<'up' | 'down'>;

  /**
   * CR-21：把存储引用解析成 HTTP 取用目标（供 main.ts 的 /uploads 访问层调用）。
   * - local：返回 null —— 进程自己从磁盘流式送出。
   * - s3：返回**有时效的 presigned GET URL**（bucket 私有）—— 调用方回 302。
   * ref 形如 `/uploads/<key>`。
   */
  accessRedirectUrl(ref: string): Promise<string | null>;
}
