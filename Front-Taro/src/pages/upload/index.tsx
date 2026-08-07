 import { View, Text, Button } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useUploadStore } from '../../stores/upload-store'
 import { MAX_FILE_SIZE, ALLOWED_EXTENSIONS } from '../../utils/constants'
 import './index.scss'
 
 export default function UploadPage() {
   const { isUploading, uploadedUrl, error, upload, clear } = useUploadStore()
 
   const handlePickAndUpload = async () => {
     try {
       const res = await Taro.chooseMessageFile({
         count: 1,
         type: 'file',
         extension: ALLOWED_EXTENSIONS.map((e) => e.replace('.', '')),
       })
 
       if (!res.tempFiles?.length) return
 
       const file = res.tempFiles[0]
       if (file.size > MAX_FILE_SIZE) {
         Taro.showToast({ title: 'File size exceeds 10 MB limit', icon: 'none' })
         return
       }
 
       await upload(file.path)
     } catch (err: any) {
       // User cancelled or error
       if (err?.errMsg?.includes('cancel')) return
       Taro.showToast({ title: 'Failed to pick file', icon: 'none' })
     }
   }
 
   return (
     <View className='upload-page'>
       {/* Upload area */}
       <View className='upload-page__area card' onClick={isUploading ? undefined : handlePickAndUpload}>
         {isUploading ? (
           <View className='upload-page__uploading'>
             <View className='spinner' />
             <Text className='upload-page__uploading-text'>Uploading...</Text>
           </View>
         ) : (
           <View className='upload-page__placeholder'>
             <Text className='upload-page__placeholder-icon'>☁️</Text>
             <Text className='upload-page__placeholder-text'>Tap to select a file</Text>
             <Text className='upload-page__placeholder-hint'>
               Supported: jpg, png, gif, webp, pdf, zip
             </Text>
           </View>
         )}
       </View>
 
       {/* Error */}
       {error && (
         <View className='upload-page__error'>
           <Text className='upload-page__error-text'>{error}</Text>
         </View>
       )}
 
       {/* Result */}
       {uploadedUrl && (
         <View className='upload-page__result card'>
           <Text className='upload-page__result-title'>✅ Upload successful!</Text>
           <Text className='upload-page__result-url'>{uploadedUrl}</Text>
           <Button className='upload-page__result-btn' onClick={clear}>
             Upload Another
           </Button>
         </View>
       )}
     </View>
   )
 }
