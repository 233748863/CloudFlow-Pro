<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ConfigurableRecordPage from '@/pages/shared/ConfigurableRecordPage.vue'
import { hrAdvancedPageConfigByPath } from './hrAdvancedPageConfigs'

const route = useRoute()
const config = computed(() => hrAdvancedPageConfigByPath.get(route.path) || hrAdvancedPageConfigByPath.get('/hr/benefit/mine'))
</script>

<template>
  <ConfigurableRecordPage v-if="config" :config="config" />
</template>
