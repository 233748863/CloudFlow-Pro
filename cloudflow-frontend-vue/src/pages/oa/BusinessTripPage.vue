<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { businessTripConfig } from './oaApplicationConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="businessTripConfig" />
</template>
