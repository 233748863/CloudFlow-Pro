<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { receivableConfig } from './crmPageConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="receivableConfig" />
</template>
