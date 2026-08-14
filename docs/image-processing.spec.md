# 图片处理（ST-2）功能规格 / Image Processing (ST-2) Functional Specification

## 1. 概述 / Overview

上传图片自动处理：光栅图（jpeg/png/webp）统一转 **WebP**（质量 80）+ 宽度上限 **1280px**（小图不放大），gif/pdf/zip 原样存储。依赖 ST-1 对象存储抽象（处理点在 `validateMagicBytes` 之后、`storageService.save` 之前，buffer 已验证）。

Automatic processing of uploaded images: raster images (jpeg/png/webp) are converted to **WebP** (quality 80) with a max width of **1280px** (small images are not upscaled); gif/pdf/zip are stored as-is. Depends on the ST-1 object storage abstraction (the processing point is after `validateMagicBytes` and before `storageService.save`, where the buffer is already validated).

## 2. 处理规则 / Processing Rules

| 类型 / Type | 行为 / Behavior |
|------|------|
| image/jpeg / png / webp | sharp `rotate()`（修正 EXIF）+ `resize(1280, withoutEnlargement)` + `webp(quality: 80)`，扩展名改 `.webp` / sharp `rotate()` (corrects EXIF) + `resize(1280, withoutEnlargement)` + `webp(quality: 80)`; extension changed to `.webp` |
| image/gif | 原样（sharp 处理 gif 有损） / As-is (sharp processing of gif is lossy) |
| application/pdf / zip | 原样 / As-is |
| 处理失败 / Processing failure | 静默降级为原图（不阻断上传），记 warn 日志 / Silently degrades to the original image (does not block the upload) and logs a warn message |

## 3. 实现 / Implementation

- `ImageProcessorService`（`src/upload/image-processor.service.ts`）：`processImage(buffer, originalName, mimetype)` → `{ buffer, filename, mimetype }`
  `ImageProcessorService` (`src/upload/image-processor.service.ts`): `processImage(buffer, originalName, mimetype)` → `{ buffer, filename, mimetype }`
- upload.controller：魔数校验后调 `processImage`，用返回结果 `storageService.save(...)`；响应 `filename/mimeType/size` 反映处理后的值（如 `test.png` → `.webp`，mimeType `image/webp`）
  upload.controller: after magic-byte validation, calls `processImage`, then saves via `storageService.save(...)` with the returned result; the response `filename/mimeType/size` reflects the processed values (e.g. `test.png` → `.webp`, mimeType `image/webp`)

## 4. 依赖与平台 / Dependencies and Platforms

- `sharp`（prebuilt N-API binary，同 bcrypt/better-sqlite3 型）：Windows `win32-x64` + CI `node:22-alpine` `linuxmusl-x64` 均由官方 prebuild 覆盖，npm ci 按平台拉取，无需编译。
  `sharp` (prebuilt N-API binary, like bcrypt/better-sqlite3): Windows `win32-x64` + CI `node:22-alpine` `linuxmusl-x64` are all covered by official prebuilds; npm ci fetches per platform, no compilation needed.
- `module: nodenext` + CommonJS 下 `import sharp from 'sharp'` 正常。
  `import sharp from 'sharp'` works under `module: nodenext` + CommonJS.

## 5. 测试 / Testing

- 后端单测：image-processor.service.spec 5 用例（大图→webp 1280、小图不放大、gif 原样、pdf 原样、失败降级）
  Backend unit tests: 5 cases in image-processor.service.spec (large image → webp 1280, small image not upscaled, gif as-is, pdf as-is, failure fallback)
- 后端 e2e：真实 PNG 上传 → 返回 `.webp` url + `image/webp`；魔数不匹配 400
  Backend e2e: uploading a real PNG → returns a `.webp` url + `image/webp`; magic-byte mismatch returns 400

## 6. 后续 / Follow-up

- 前端消费上传 URL（头像/事件图展示）可后续接线——当前 `avatarUrl` 字段无消费
  Frontend consumption of the upload URL (avatar / event image display) can be wired up later — the `avatarUrl` field currently has no consumers
- 头像专用裁剪（正方形居中）可加 `resize({ width: 512, height: 512, fit: 'cover' })` 变体
  A dedicated avatar crop (square, centered) can be added as a `resize({ width: 512, height: 512, fit: 'cover' })` variant
