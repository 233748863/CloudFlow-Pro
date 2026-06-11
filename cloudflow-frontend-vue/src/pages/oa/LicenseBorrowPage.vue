<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { licenseBorrowConfig } from './oaApplicationConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="licenseBorrowConfig" />
</template>
