<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { DollarSign } from 'lucide-vue-next'
import { Panel } from '@/components/common'

const salaryData = ref({ basic: 0, bonus: 0, deduction: 0, total: 0 })

const load = async () => {
  // Mock data
  salaryData.value = { basic: 8000, bonus: 2000, deduction: 800, total: 9200 }
}

onMounted(() => { load() })
</script>

<template>
  <Panel title="薪酬福利">
    <template #icon><DollarSign class="h-5 w-5" /></template>
    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-lg border p-4 dark:border-gray-700">
        <p class="text-sm text-gray-500">基本工资</p>
        <p class="mt-2 text-2xl font-semibold">¥{{ salaryData.basic.toLocaleString() }}</p>
      </div>
      <div class="rounded-lg border p-4 dark:border-gray-700">
        <p class="text-sm text-gray-500">实发工资</p>
        <p class="mt-2 text-2xl font-semibold text-green-600">¥{{ salaryData.total.toLocaleString() }}</p>
      </div>
    </div>
  </Panel>
</template>
