<script setup lang="ts">
import { ref } from 'vue'
import { Settings } from 'lucide-vue-next'
import { Panel, Button, Input } from '@/components/common'

const config = ref({ appName: 'CloudFlow Pro', maxUploadSize: '10MB', sessionTimeout: '30分钟' })
</script>

<template>
  <Panel title="系统配置">
    <template #icon><Settings class="h-5 w-5" /></template>
    <template #actions><Button size="sm">保存</Button></template>
    <div class="space-y-4">
      <Input v-model="config.appName" label="应用名称" />
      <Input v-model="config.maxUploadSize" label="最大上传" />
      <Input v-model="config.sessionTimeout" label="会话超时" />
    </div>
  </Panel>
</template>
