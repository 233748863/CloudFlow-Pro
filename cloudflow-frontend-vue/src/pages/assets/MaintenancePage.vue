<script setup lang="ts">
import { Building2 } from 'lucide-vue-next'
import { Panel } from '@/components/common'
</script>

<template>
  <Panel title="Maintenance">
    <template #icon><Building2 class="h-5 w-5" /></template>
    <div class="text-center text-gray-500 py-8">暂无数据</div>
  </Panel>
</template>
