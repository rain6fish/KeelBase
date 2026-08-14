<template>
  <view class="upload-page">
    <!-- Upload area -->
    <view class="upload-page__area card" @click="handlePickAndUpload">
      <view v-if="isUploading" class="upload-page__uploading">
        <view class="spinner" />
        <text class="upload-page__uploading-text">Uploading...</text>
      </view>
      <view v-else class="upload-page__placeholder">
        <text class="upload-page__placeholder-icon">☁️</text>
        <text class="upload-page__placeholder-text">Tap to select a file</text>
        <text class="upload-page__placeholder-hint">
          Supported: jpg, png, gif, webp, pdf, zip
        </text>
      </view>
    </view>

    <!-- Error -->
    <view v-if="error" class="upload-page__error">
      <text class="upload-page__error-text">{{ error }}</text>
    </view>

    <!-- Result -->
    <view v-if="uploadedUrl" class="upload-page__result card">
      <text class="upload-page__result-title">✅ Upload successful!</text>
      <text class="upload-page__result-url">{{ uploadedUrl }}</text>
      <button class="upload-page__result-btn" @click="store.clear">
        Upload Another
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useUploadStore } from '../../stores/upload-store'
import { MAX_FILE_SIZE, ALLOWED_EXTENSIONS } from '../../utils/constants'

const store = useUploadStore()
const { isUploading, uploadedUrl, error } = storeToRefs(store)

const handlePickAndUpload = async () => {
  if (isUploading.value) return
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

    await store.upload(file.path)
  } catch (err: any) {
    // User cancelled or error
    if (err?.errMsg?.includes('cancel')) return
    Taro.showToast({ title: 'Failed to pick file', icon: 'none' })
  }
}
</script>

<style src="./index.scss" scoped></style>
