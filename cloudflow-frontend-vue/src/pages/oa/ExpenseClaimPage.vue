<script setup lang="ts">
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { expenseClaimConfig } from './oaApplicationConfigs'
</script>

<template>
  <ConfigurableRecordPage :config="expenseClaimConfig" />
</template>
