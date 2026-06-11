<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { contractConfig } from './crmPageConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="contractConfig" />
</template>
