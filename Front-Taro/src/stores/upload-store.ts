 import { create } from 'zustand'
 import { uploadService } from '../services/upload-service'
 
 interface UploadState {
   isUploading: boolean
   uploadedUrl: string | null
   error: string | null
 
   upload: (filePath: string) => Promise<void>
   clear: () => void
 }
 
 export const useUploadStore = create<UploadState>((set) => ({
   isUploading: false,
   uploadedUrl: null,
   error: null,
 
   upload: async (filePath) => {
     set({ isUploading: true, error: null, uploadedUrl: null })
     try {
       const result = await uploadService.uploadFile(filePath)
       set({ isUploading: false, uploadedUrl: result.url })
     } catch (err: any) {
       set({ isUploading: false, error: err.message || 'Upload failed' })
     }
   },
 
   clear: () => set({ uploadedUrl: null, error: null }),
 }))
