<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { sealApplicationConfig } from './oaApplicationConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="sealApplicationConfig" />
</template>
