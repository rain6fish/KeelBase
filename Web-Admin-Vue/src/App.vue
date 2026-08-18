<template>
  <el-config-provider>
    <router-view />
    <GlobalSnackbar />
  </el-config-provider>
</template>

<script setup lang="ts">
import GlobalSnackbar from '@/components/GlobalSnackbar.vue'
</script>
