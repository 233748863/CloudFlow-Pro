<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { purchaseRequestConfig } from './oaApplicationConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="purchaseRequestConfig" />
</template>
