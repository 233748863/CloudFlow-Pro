<script setup lang="ts">
import { BookOpen } from 'lucide-vue-next'
import { Panel } from '@/components/common'
</script>

<template>
  <Panel title="Tutorial">
    <template #icon><BookOpen class="h-5 w-5" /></template>
    <div class="text-center text-gray-500 py-8">暂无数据</div>
  </Panel>
</template>
