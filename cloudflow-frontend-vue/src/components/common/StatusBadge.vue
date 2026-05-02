<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  tone?: 'slate' | 'green' | 'red' | 'yellow' | 'cyan'
}>(), {
  tone: 'slate'
})
</script>

<template>
  <span
    class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium"
    :class="{
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200': tone === 'slate',
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200': tone === 'green',
      'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200': tone === 'red',
      'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200': tone === 'yellow',
      'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200': tone === 'cyan'
    }"
  >
    {{ label }}
  </span>
</template>
