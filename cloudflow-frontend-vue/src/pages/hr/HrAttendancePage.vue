<script setup lang="ts">
import { ref } from 'vue'
import { Calendar } from 'lucide-vue-next'
import { Panel } from '@/components/common'

const attendanceData = ref([
  { date: '2024-01-01', checkIn: '09:00', checkOut: '18:00', status: '正常' },
  { date: '2024-01-02', checkIn: '09:15', checkOut: '18:05', status: '迟到' }
])
</script>

<template>
  <Panel title="考勤记录">
    <template #icon><Calendar class="h-5 w-5" /></template>
    <div class="space-y-2">
      <div v-for="record in attendanceData" :key="record.date" class="flex items-center justify-between rounded-lg border p-3 dark:border-gray-700">
        <div>
          <p class="font-medium">{{ record.date }}</p>
          <p class="text-sm text-gray-500">{{ record.checkIn }} - {{ record.checkOut }}</p>
        </div>
        <span :class="record.status === '正常' ? 'text-green-600' : 'text-amber-600'">{{ record.status }}</span>
      </div>
    </div>
  </Panel>
</template>
