# 图片处理（ST-2）功能规格

## 1. 概述

上传图片自动处理：光栅图（jpeg/png/webp）统一转 **WebP**（质量 80）+ 宽度上限 **1280px**（小图不放大），gif/pdf/zip 原样存储。依赖 ST-1 对象存储抽象（处理点在 `validateMagicBytes` 之后、`storageService.save` 之前，buffer 已验证）。

## 2. 处理规则

| 类型 | 行为 |
|------|------|
| image/jpeg / png / webp | sharp `rotate()`（修正 EXIF）+ `resize(1280, withoutEnlargement)` + `webp(quality: 80)`，扩展名改 `.webp` |
| image/gif | 原样（sharp 处理 gif 有损） |
| application/pdf / zip | 原样 |
| 处理失败 | 静默降级为原图（不阻断上传），记 warn 日志 |

## 3. 实现

- `ImageProcessorService`（`src/upload/image-processor.service.ts`）：`processImage(buffer, originalName, mimetype)` → `{ buffer, filename, mimetype }`
- upload.controller：魔数校验后调 `processImage`，用返回结果 `storageService.save(...)`；响应 `filename/mimeType/size` 反映处理后的值（如 `test.png` → `.webp`，mimeType `image/webp`）

## 4. 依赖与平台

- `sharp`（prebuilt N-API binary，同 bcrypt/better-sqlite3 型）：Windows `win32-x64` + CI `node:22-alpine` `linuxmusl-x64` 均由官方 prebuild 覆盖，npm ci 按平台拉取，无需编译。
- `module: nodenext` + CommonJS 下 `import sharp from 'sharp'` 正常。

## 5. 测试

- 后端单测：image-processor.service.spec 5 用例（大图→webp 1280、小图不放大、gif 原样、pdf 原样、失败降级）
- 后端 e2e：真实 PNG 上传 → 返回 `.webp` url + `image/webp`；魔数不匹配 400

## 6. 后续

- 前端消费上传 URL（头像/事件图展示）可后续接线——当前 `avatarUrl` 字段无消费
- 头像专用裁剪（正方形居中）可加 `resize({ width: 512, height: 512, fit: 'cover' })` 变体
