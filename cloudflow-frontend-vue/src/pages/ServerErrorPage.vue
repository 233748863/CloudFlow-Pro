<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ErrorPageShell from '@/components/common/ErrorPageShell.vue'

const route = useRoute()
const message = computed(() => String(route.query.message || '页面运行时出现异常，刷新后仍失败请联系管理员。'))
</script>

<template>
  <ErrorPageShell
    status="500"
    title="页面运行异常"
    :description="message"
    icon="alertTriangle"
    tone="danger"
    :show-back="true"
  />
</template>
