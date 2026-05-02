<template>
  <ErrorPageShell
    :status="status"
    title="服务暂时不可用"
    :description="message"
    icon="alertTriangle"
    tone="warning"
    :show-back="false"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ErrorPageShell from '@/components/common/ErrorPageShell.vue'

const route = useRoute()
const status = computed(() => String(route.query.status || '503'))
const message = computed(() => String(route.query.message || '后端服务暂时不可用'))
</script>
