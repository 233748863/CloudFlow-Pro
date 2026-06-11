<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { leadConfig } from './crmPageConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="leadConfig" />
</template>
