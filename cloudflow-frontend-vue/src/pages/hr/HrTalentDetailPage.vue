<script setup lang="ts">
import { ref } from 'vue'
import { Users } from 'lucide-vue-next'
import { Panel } from '@/components/common'

const talents = ref([
  { name: '王工', position: '高级工程师', rating: 'A', potential: '高' },
  { name: '李经理', position: '产品经理', rating: 'A', potential: '中' }
])
</script>

<template>
  <Panel title="人才库">
    <template #icon><Users class="h-5 w-5" /></template>
    <div class="space-y-3">
      <div v-for="talent in talents" :key="talent.name" class="flex items-center justify-between rounded-lg border p-4 dark:border-gray-700">
        <div>
          <p class="font-medium">{{ talent.name }}</p>
          <p class="text-sm text-gray-500">{{ talent.position }}</p>
        </div>
        <div class="flex gap-4">
          <div class="text-center">
            <p class="text-sm text-gray-500">绩效</p>
            <p class="font-semibold text-green-600">{{ talent.rating }}</p>
          </div>
          <div class="text-center">
            <p class="text-sm text-gray-500">潜力</p>
            <p class="font-semibold text-cyan-600">{{ talent.potential }}</p>
          </div>
        </div>
      </div>
    </div>
  </Panel>
</template>
