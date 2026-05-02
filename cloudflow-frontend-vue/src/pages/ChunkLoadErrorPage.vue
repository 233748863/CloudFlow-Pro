<template>
  <ErrorPageShell
    status="LOAD"
    title="页面资源加载失败"
    description="当前前端资源可能已更新，重新加载后会获取最新页面文件。"
    icon="refresh"
    tone="primary"
    retry-label="重新加载"
    :show-back="false"
  />
</template>

<script setup lang="ts">
import ErrorPageShell from '@/components/common/ErrorPageShell.vue'
</script>
