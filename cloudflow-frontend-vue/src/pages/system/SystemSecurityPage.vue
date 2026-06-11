<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { systemSecurityPageConfigByPath } from './systemSecurityPageConfigs'

const route = useRoute()
const config = computed(() =>
  systemSecurityPageConfigByPath.get(route.path) || systemSecurityPageConfigByPath.get('/system/rules')
)
</script>

<template>
  <ConfigurableRecordPage v-if="config" :config="config" />
</template>
