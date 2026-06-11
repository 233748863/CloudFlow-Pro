<script setup lang="ts">
import { BarChart3 } from 'lucide-vue-next'
import { Panel } from '@/components/common'
</script>

<template>
  <Panel title="Customer Report">
    <template #icon><BarChart3 class="h-5 w-5" /></template>
    <div class="text-center text-gray-500 py-8">报表数据加载中...</div>
  </Panel>
</template>
