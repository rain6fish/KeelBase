<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <scroll-view class="legal-page" scroll-y>
    <view class="legal-page__content">
      <text class="legal-page__title">{{ t('legal.privacy.title') }}</text>
      <text class="legal-page__updated">{{ t('legal.privacy.updated') }}</text>

      <text class="legal-page__heading">{{ t('legal.privacy.s1h') }}</text>
      <text class="legal-page__text">{{ t('legal.privacy.s1b') }}</text>

      <text class="legal-page__heading">{{ t('legal.privacy.s2h') }}</text>
      <text class="legal-page__text">{{ t('legal.privacy.s2b') }}</text>

      <text class="legal-page__heading">{{ t('legal.privacy.s3h') }}</text>
      <text class="legal-page__text">{{ t('legal.privacy.s3b') }}</text>

      <text class="legal-page__heading">{{ t('legal.privacy.s4h') }}</text>
      <text class="legal-page__text">{{ t('legal.privacy.s4b') }}</text>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import { useI18n } from '../../composables/useI18n'
import './index.scss'

const { t } = useI18n()
</script>
