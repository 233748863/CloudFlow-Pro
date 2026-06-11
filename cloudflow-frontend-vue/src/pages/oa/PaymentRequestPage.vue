<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { paymentRequestConfig } from './oaApplicationConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="paymentRequestConfig" />
</template>
