<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { visitorConfig } from './oaApplicationConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="visitorConfig" />
</template>
