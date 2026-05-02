<script setup lang="ts">
defineProps<{
  title?: string
  subtitle?: string
}>()
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
    <div class="pointer-events-none absolute inset-0 bg-mesh-gradient" />
    <main class="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div class="mb-8 text-center">
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl shadow-glow">
          <img src="/icon.svg" alt="CloudFlow Pro" class="h-full w-full object-contain" />
        </div>
        <h1 class="text-3xl font-bold text-slate-900 dark:text-slate-100">{{ title || 'CloudFlow Pro' }}</h1>
        <p v-if="subtitle" class="mt-2 text-sm text-slate-500 dark:text-slate-400">{{ subtitle }}</p>
      </div>
      <slot />
    </main>
  </div>
</template>
