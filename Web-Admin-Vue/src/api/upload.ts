// SPDX-License-Identifier: Apache-2.0

import instance from './client'

/** What the platform's `/upload` pipeline returns for one stored file. */
/* 平台 `/upload` 管线为单个已存文件返回的内容。 */
export interface UploadedFile {
  url: string
  filename: string
  originalName: string
  mimeType: string
  size: number
}

/**
 * Uploads one file through the platform's existing pipeline.
 *
 * This is the console's single copy of that call, so generated module clients import it
 * rather than each carrying the same few lines. The response interceptor already attaches
 * the bearer token and unwraps the envelope, so a caller gets the file record directly and
 * never touches FormData itself.
 *
 * 把单个文件走平台既有的上传管线。这是管理台**唯一**一份该调用的实现，生成的模块客户端
 * 直接 import 它，而不是各自带一份同样几行。响应拦截器已带 Bearer 并解包，故调用方直接
 * 拿到文件记录，不必自己碰 FormData。
 */
export function uploadFile(file: File): Promise<UploadedFile> {
  const fd = new FormData()
  fd.append('file', file)
  return instance.post('/upload', fd) as unknown as Promise<UploadedFile>
}
