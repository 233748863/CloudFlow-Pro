<script setup lang="ts">
import { ref } from 'vue'
import { Users } from 'lucide-vue-next'
import { Panel, Button } from '@/components/common'

const users = ref([
  { username: 'admin', realName: '管理员', email: 'admin@example.com', status: '启用' },
  { username: 'user1', realName: '张三', email: 'user1@example.com', status: '启用' }
])
</script>

<template>
  <Panel title="用户管理">
    <template #icon><Users class="h-5 w-5" /></template>
    <template #actions><Button size="sm">新建用户</Button></template>
    <div class="space-y-2">
      <div v-for="user in users" :key="user.username" class="flex items-center justify-between rounded-lg border p-3 dark:border-gray-700">
        <div>
          <p class="font-medium">{{ user.realName }}</p>
          <p class="text-sm text-gray-500">{{ user.username }} · {{ user.email }}</p>
        </div>
        <Button size="sm" variant="outline">编辑</Button>
      </div>
    </div>
  </Panel>
</template>
