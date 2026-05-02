<template>
  <ErrorPageShell
    status="404"
    title="页面不存在"
    description="当前地址没有对应的 CloudFlow Vue 路由，页面可能已移动或尚未迁移。"
    icon="circleHelp"
    tone="primary"
    :show-back="true"
  />
</template>

<script setup lang="ts">
import ErrorPageShell from '@/components/common/ErrorPageShell.vue'
</script>
