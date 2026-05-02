<script setup lang="ts">
import StatusBadge from './StatusBadge.vue'

defineProps<{ label: string }>()
</script>

<template>
  <StatusBadge :label="label" tone="cyan" />
</template>
