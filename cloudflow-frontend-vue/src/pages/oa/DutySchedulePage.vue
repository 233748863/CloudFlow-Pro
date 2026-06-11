<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { dutyScheduleConfig } from './oaApplicationConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="dutyScheduleConfig" />
</template>
