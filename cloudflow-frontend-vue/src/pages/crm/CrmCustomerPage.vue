<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { customerConfig } from './crmPageConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="customerConfig" />
</template>
