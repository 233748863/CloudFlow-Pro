<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { BarChart3, TrendingUp, Clock } from 'lucide-vue-next'
import { Panel, StatCard } from '@/components/common'
import { useToastStore } from '@/stores/toast'
import { getPerformanceStats } from '@/services/api/workflow'

const toast = useToastStore()
const loading = ref(false)
const stats = ref({
  avgDuration: 0,
  completionRate: 0,
  totalProcessed: 0,
  bottleneckNodes: [] as Array<{ nodeName: string; avgDuration: number }>
})

const loadStats = async () => {
  loading.value = true
  try {
    const result = await getPerformanceStats()
    stats.value = {
      avgDuration: (result as any).avgDuration || 0,
      completionRate: (result as any).completionRate || 0,
      totalProcessed: (result as any).totalProcessed || 0,
      bottleneckNodes: (result as any).bottleneckNodes || []
    }
  } catch (error) {
    toast.error('加载性能统计失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadStats()
})
</script>

<template>
  <div class="space-y-6">
    <Panel title="流程性能统计">
      <template #icon><BarChart3 class="h-5 w-5" /></template>

      <div class="grid gap-4 md:grid-cols-3">
        <StatCard title="平均耗时" :value="`${stats.avgDuration}h`">
          <template #icon>
            <Clock class="h-5 w-5 text-primary-600" />
          </template>
        </StatCard>

        <StatCard title="完成率" :value="`${stats.completionRate}%`">
          <template #icon>
            <TrendingUp class="h-5 w-5 text-emerald-600" />
          </template>
        </StatCard>

        <StatCard title="处理总数" :value="stats.totalProcessed">
          <template #icon>
            <BarChart3 class="h-5 w-5 text-cyan-600" />
          </template>
        </StatCard>
      </div>

      <div v-if="stats.bottleneckNodes.length > 0" class="mt-6">
        <h3 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">瓶颈节点</h3>
        <div class="space-y-2">
          <div v-for="node in stats.bottleneckNodes" :key="node.nodeName" class="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-dark-800">
            <span class="text-sm text-gray-900 dark:text-gray-100">{{ node.nodeName }}</span>
            <span class="text-sm font-medium text-amber-600">{{ node.avgDuration }}h</span>
          </div>
        </div>
      </div>
    </Panel>
  </div>
</template>
