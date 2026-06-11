<script setup lang="ts">
import { DollarSign } from 'lucide-vue-next'
import { Panel } from '@/components/common'
</script>

<template>
  <Panel title="Invoice">
    <template #icon><DollarSign class="h-5 w-5" /></template>
    <div class="text-center text-gray-500 py-8">暂无数据</div>
  </Panel>
</template>
