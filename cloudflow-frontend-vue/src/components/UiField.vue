<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <label class="space-y-2">
    <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">{{ label }}</span>
    <slot />
  </label>
</template>
