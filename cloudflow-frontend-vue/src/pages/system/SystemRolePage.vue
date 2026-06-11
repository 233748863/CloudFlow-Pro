<script setup lang="ts">
import { ref } from 'vue'
import { Shield } from 'lucide-vue-next'
import { Panel, Button } from '@/components/common'

const roles = ref([
  { name: '管理员', users: 5, permissions: 50 },
  { name: '普通用户', users: 100, permissions: 10 }
])
</script>

<template>
  <Panel title="角色管理">
    <template #icon><Shield class="h-5 w-5" /></template>
    <template #actions><Button size="sm">新建角色</Button></template>
    <div class="space-y-3">
      <div v-for="role in roles" :key="role.name" class="flex items-center justify-between rounded-lg border p-4 dark:border-gray-700">
        <div>
          <p class="font-medium">{{ role.name }}</p>
          <p class="text-sm text-gray-500">{{ role.users }} 用户 · {{ role.permissions }} 权限</p>
        </div>
        <Button size="sm" variant="outline">编辑</Button>
      </div>
    </div>
  </Panel>
</template>
