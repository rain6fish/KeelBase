<template>
  <v-app>
    <router-view />
    <GlobalSnackbar />
  </v-app>
</template>

<script setup lang="ts">
import GlobalSnackbar from '@/components/GlobalSnackbar.vue'
</script>
