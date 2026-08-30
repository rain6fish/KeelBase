<template>
  <scroll-view class="legal-page" scroll-y>
    <view class="legal-page__content">
      <text class="legal-page__title">{{ t('legal.terms.title') }}</text>
      <text class="legal-page__updated">{{ t('legal.terms.updated') }}</text>

      <text class="legal-page__heading">{{ t('legal.terms.s1h') }}</text>
      <text class="legal-page__text">{{ t('legal.terms.s1b') }}</text>

      <text class="legal-page__heading">{{ t('legal.terms.s2h') }}</text>
      <text class="legal-page__text">{{ t('legal.terms.s2b') }}</text>

      <text class="legal-page__heading">{{ t('legal.terms.s3h') }}</text>
      <text class="legal-page__text">{{ t('legal.terms.s3b') }}</text>

      <text class="legal-page__heading">{{ t('legal.terms.s4h') }}</text>
      <text class="legal-page__text">{{ t('legal.terms.s4b') }}</text>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import { useI18n } from '../../composables/useI18n'
import '../privacy/index.scss'

const { t } = useI18n()
</script>
