<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { contractConfig } from './oaApplicationConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="contractConfig" />
</template>
