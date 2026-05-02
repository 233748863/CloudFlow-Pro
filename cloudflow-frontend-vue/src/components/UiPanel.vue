<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <section class="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/90">
    <div class="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
      <slot name="icon" />
      <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">{{ title }}</div>
    </div>
    <div class="p-4">
      <slot />
    </div>
  </section>
</template>
