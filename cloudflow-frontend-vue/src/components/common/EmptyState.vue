<script setup lang="ts">
import Icon from '@/components/icons/Icon.vue'

withDefaults(defineProps<{
  title?: string
  description?: string
  icon?: string
}>(), {
  title: '暂无数据',
  description: '',
  icon: 'inbox'
})
</script>

<template>
  <div class="empty-state rounded-xl border border-dashed border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800/50">
    <Icon :name="icon" size="xl" class="empty-state-icon" />
    <p class="empty-state-title">{{ title }}</p>
    <p v-if="description" class="empty-state-description">{{ description }}</p>
    <div v-if="$slots.default" class="mt-5">
      <slot />
    </div>
  </div>
</template>
