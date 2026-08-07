# 对象存储抽象（ST-1）功能规格

## 1. 概述

上传从本地磁盘抽象为可切换存储后端（本地 / S3 / MinIO / OSS 兼容）。核心改动：multer 从 diskStorage 改 memoryStorage，controller 拿 buffer 调 `StorageService.save()`——**避免切 S3 时双写磁盘**。

## 2. StorageService 接口

```typescript
export const STORAGE_SERVICE = 'STORAGE_SERVICE';

interface StorageService {
  save(buffer: Buffer, originalName: string, mimetype: string): Promise<string>;
  delete(key: string): Promise<void>;
}
```

- `save` 返回可访问 URL：local → `/uploads/xxx`；s3 → 完整 URL
- `delete` 的 key 为 save 返回 URL 中的对象键

## 3. 实现

| 实现 | 说明 |
|------|------|
| `LocalStorageService` | 写 `uploads/`（mkdir recursive），文件名 `Date.now()-random.ext`（沿用旧 controller 逻辑），URL `/uploads/xxx`，经 main.ts 静态托管 + nginx 代理 |
| `S3StorageService` | `@aws-sdk/client-s3` PutObject（key `YYYY-MM-DD/timestamp-random.ext`，ACL public-read），URL 用 `S3_PUBLIC_URL` 或 `https://bucket.s3.amazonaws.com/...`；MinIO/OSS 用 S3 兼容 endpoint + `forcePathStyle` |

## 4. 配置

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| STORAGE_DRIVER | local | local（本地磁盘）\| s3（S3/MinIO/OSS 兼容） |
| S3_ENDPOINT | '' | 本地 MinIO 填 http://localhost:9000 |
| S3_REGION | us-east-1 | |
| S3_BUCKET | '' | |
| S3_ACCESS_KEY / S3_SECRET_KEY | '' | |
| S3_PUBLIC_URL | '' | 对象公网前缀，留空用 bucket URL |

`StorageModule` 用 useFactory 按 driver 提供 `STORAGE_SERVICE` 实现；S3 驱动默认不启用，不触发网络。

## 5. 上传流程变更

- multer `memoryStorage()`（文件在内存 buffer）
- controller：扩展名白名单（原 diskStorage filename 回调职责）→ `validateMagicBytes(buffer, mimetype)`（buffer 版魔数校验，不依赖磁盘路径，失败无 unlink）→ `storageService.save(buffer, originalName, mimetype)`
- 响应字段不变：`{ url, filename, originalName, size, mimeType }`

## 6. 测试

- 后端单测：local 3 用例（save 写文件/delete 删除/缺失静默）、s3 3 用例（PutObject + URL/PUBLIC_URL 前缀/delete 去前缀）、module 2 用例（driver 切换）
- 后端 e2e：2 用例（真实 PNG 上传返回 url、魔数不匹配 400）

## 7. 前端消费

- `AppConstants.resolveUrl()`：相对 `/uploads/xxx` → 完整 URL（剥 baseUrl 的 `/api/v1`）；S3 绝对 URL 原样
- profile 编辑页可上传头像（file_picker → /upload → PUT /users/:id avatarUrl）；profile 页展示头像（Image.network 圆角）
- 上传返回 URL 字段（url/filename/originalName/size/mimeType）现已实际使用

## 8. 后续

- ST-2 图片处理（缩略图/压缩/WebP）依赖本抽象，可对 save 前 buffer 做处理
