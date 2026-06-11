<script setup lang="ts">
import { ref } from 'vue'
import { Shield, AlertTriangle } from 'lucide-vue-next'
import { Panel } from '@/components/common'

const securityEvents = ref([
  { type: 'LOGIN_FAIL', user: 'admin', ip: '192.168.1.100', time: '2024-01-10 10:30' },
  { type: 'PERMISSION_DENY', user: 'user1', ip: '192.168.1.101', time: '2024-01-10 10:25' }
])
</script>

<template>
  <Panel title="安全日志">
    <template #icon><Shield class="h-5 w-5" /></template>
    <div class="space-y-2">
      <div v-for="(event, i) in securityEvents" :key="i" class="flex items-center gap-3 rounded-lg border p-3 dark:border-gray-700">
        <AlertTriangle class="h-5 w-5 text-amber-500" />
        <div class="flex-1">
          <p class="font-medium">{{ event.type }}</p>
          <p class="text-sm text-gray-500">{{ event.user }} · {{ event.ip }}</p>
        </div>
        <span class="text-sm text-gray-500">{{ event.time }}</span>
      </div>
    </div>
  </Panel>
</template>
