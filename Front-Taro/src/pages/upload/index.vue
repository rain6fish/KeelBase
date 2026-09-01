<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="upload-page">
    <!-- Upload area -->
    <view class="upload-page__area card" @click="handlePickAndUpload">
      <view v-if="isUploading" class="upload-page__uploading">
        <view class="spinner" />
        <text class="upload-page__uploading-text">{{ t('upload.uploading') }}</text>
      </view>
      <view v-else class="upload-page__placeholder">
        <text class="upload-page__placeholder-icon">☁️</text>
        <text class="upload-page__placeholder-text">{{ t('upload.tapToSelect') }}</text>
        <text class="upload-page__placeholder-hint">
          {{ t('upload.supported') }}
        </text>
      </view>
    </view>

    <!-- Error -->
    <view v-if="error" class="upload-page__error">
      <text class="upload-page__error-text">{{ error }}</text>
    </view>

    <!-- Result -->
    <view v-if="uploadedUrl" class="upload-page__result card">
      <text class="upload-page__result-title">{{ t('upload.success') }}</text>
      <text class="upload-page__result-url">{{ uploadedUrl }}</text>
      <button class="upload-page__result-btn" @click="store.clear">
        {{ t('upload.uploadAnother') }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useUploadStore } from '../../stores/upload-store'
import { useI18n } from '../../composables/useI18n'
import { MAX_FILE_SIZE, ALLOWED_EXTENSIONS } from '../../utils/constants'

const store = useUploadStore()
const { isUploading, uploadedUrl, error } = storeToRefs(store)
const { t } = useI18n()

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
      Taro.showToast({ title: t('upload.sizeExceeded'), icon: 'none' })
      return
    }

    await store.upload(file.path)
  } catch (err: any) {
    // User cancelled or error
    if (err?.errMsg?.includes('cancel')) return
    Taro.showToast({ title: t('upload.pickFailed'), icon: 'none' })
  }
}
</script>

