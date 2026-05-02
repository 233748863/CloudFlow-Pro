<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="space-y-4">
    <header class="page-header flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="page-title">{{ title }}</h1>
        <p v-if="description" class="page-description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex flex-wrap gap-2">
        <slot name="actions" />
      </div>
    </header>
    <slot name="filters" />
    <section class="card overflow-hidden">
      <slot />
    </section>
  </div>
</template>
