<template>
  <ErrorPageShell
    status="403"
    title="权限不足"
    description="当前账号没有访问这个页面的权限，请切换到有权限的租户或联系管理员调整角色。"
    icon="shield"
    tone="warning"
    :show-back="true"
  />
</template>

<script setup lang="ts">
import ErrorPageShell from '@/components/common/ErrorPageShell.vue'
</script>
