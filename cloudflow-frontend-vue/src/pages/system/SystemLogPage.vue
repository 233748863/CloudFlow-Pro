<script setup lang="ts">
import { ref } from 'vue'
import { FileText } from 'lucide-vue-next'
import { Panel } from '@/components/common'

const logs = ref([
  { level: 'INFO', message: '系统启动成功', time: '2024-01-10 10:00' },
  { level: 'ERROR', message: '数据库连接失败', time: '2024-01-10 09:58' }
])
</script>

<template>
  <Panel title="系统日志">
    <template #icon><FileText class="h-5 w-5" /></template>
    <div class="space-y-2 font-mono text-sm">
      <div v-for="(log, i) in logs" :key="i" class="rounded border p-2 dark:border-gray-700" :class="log.level === 'ERROR' ? 'border-red-200 bg-red-50 dark:bg-red-950' : ''">
        <span :class="log.level === 'ERROR' ? 'text-red-600' : 'text-green-600'">[{{ log.level }}]</span>
        <span class="ml-2 text-gray-600">{{ log.time }}</span>
        <p class="mt-1">{{ log.message }}</p>
      </div>
    </div>
  </Panel>
</template>
