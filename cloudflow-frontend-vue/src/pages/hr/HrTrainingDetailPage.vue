<script setup lang="ts">
import { ref } from 'vue'
import { BookOpen } from 'lucide-vue-next'
import { Panel, Button } from '@/components/common'

const courses = ref([
  { name: 'Vue 3 进阶', instructor: '张老师', students: 45, progress: 60 },
  { name: 'TypeScript 实战', instructor: '李老师', students: 38, progress: 80 }
])
</script>

<template>
  <Panel title="培训课程">
    <template #icon><BookOpen class="h-5 w-5" /></template>
    <template #actions><Button size="sm">创建课程</Button></template>
    <div class="space-y-3">
      <div v-for="course in courses" :key="course.name" class="rounded-lg border p-4 dark:border-gray-700">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">{{ course.name }}</p>
            <p class="text-sm text-gray-500">讲师：{{ course.instructor }} · {{ course.students }} 人学习</p>
          </div>
          <div class="text-right">
            <p class="text-2xl font-semibold text-primary-600">{{ course.progress }}%</p>
            <p class="text-xs text-gray-500">完成度</p>
          </div>
        </div>
      </div>
    </div>
  </Panel>
</template>
