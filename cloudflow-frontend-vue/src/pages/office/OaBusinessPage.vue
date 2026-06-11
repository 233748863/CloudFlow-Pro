<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { oaBusinessPageConfigByPath } from './oaBusinessPageConfigs'

const route = useRoute()
const config = computed(() =>
  oaBusinessPageConfigByPath.get(route.path) || oaBusinessPageConfigByPath.get('/office/project')
)
</script>

<template>
  <ConfigurableRecordPage v-if="config" :config="config" />
</template>
