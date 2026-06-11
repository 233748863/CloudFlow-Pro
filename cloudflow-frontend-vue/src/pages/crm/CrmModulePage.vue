<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { crmPageConfigByPath } from './crmPageConfigs'

const route = useRoute()
const config = computed(() =>
  crmPageConfigByPath[route.path] || crmPageConfigByPath['/crm/customer']
)
</script>

<template>
  <ConfigurableRecordPage v-if="config" :config="config" />
</template>
