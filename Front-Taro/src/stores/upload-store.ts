import { defineStore } from 'pinia'
import { uploadService } from '../services/upload-service'
import { translate } from '../i18n/translate'

/** 文件上传状态（Taro→Vue3 迁移：zustand → pinia）：上传中/结果 URL/错误。 */
export const useUploadStore = defineStore('upload', {
  state: () => ({
    isUploading: false,
    uploadedUrl: null as string | null,
    error: null as string | null,
  }),
  actions: {
    async upload(filePath: string) {
      this.isUploading = true
      this.error = null
      this.uploadedUrl = null
      try {
        const result = await uploadService.uploadFile(filePath)
        this.isUploading = false
        this.uploadedUrl = result.url
      } catch (err: any) {
        this.isUploading = false
        this.error = err.message || translate('upload.uploadFailed')
      }
    },

    clear() {
      this.uploadedUrl = null
      this.error = null
    },
  },
})
