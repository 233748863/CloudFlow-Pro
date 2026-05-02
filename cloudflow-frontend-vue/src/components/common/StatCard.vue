<script setup lang="ts">
defineProps<{
  title: string
  value: string | number
  description?: string
}>()
</script>

<template>
  <section class="card p-4">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-sm text-slate-500 dark:text-slate-400">{{ title }}</p>
        <p class="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{{ value }}</p>
        <p v-if="description" class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ description }}</p>
      </div>
      <slot name="icon" />
    </div>
  </section>
</template>
