<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { opportunityConfig } from './crmPageConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="opportunityConfig" />
</template>
