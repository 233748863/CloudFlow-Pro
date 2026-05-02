<script setup lang="ts">
defineProps<{
  modelValue: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    :class="modelValue ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform" :class="modelValue ? 'translate-x-5' : 'translate-x-0.5'" />
  </button>
</template>
