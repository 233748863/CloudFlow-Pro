<script setup lang="ts">
import Icon from '@/components/icons/Icon.vue'

defineProps<{ text: string }>()
</script>

<template>
  <span class="group relative inline-flex">
    <Icon name="circleHelp" size="sm" class="text-slate-400" />
    <span class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-5 text-white shadow-lg group-hover:block">
      {{ text }}
    </span>
  </span>
</template>
