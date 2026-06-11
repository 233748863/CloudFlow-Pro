<script setup lang="ts">
import { ref } from 'vue'
import { Settings } from 'lucide-vue-next'
import { Panel, Button } from '@/components/common'

</script>

<template>
  <Panel title="UserManagement">
    <template #icon><Settings class="h-5 w-5" /></template>
    <template #actions><Button size="sm">新建</Button></template>
    <div class="text-center text-gray-500 py-8">暂无数据</div>
  </Panel>
</template>
