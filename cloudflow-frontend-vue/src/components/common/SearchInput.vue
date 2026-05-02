<script setup lang="ts">
import Icon from '@/components/icons/Icon.vue'

withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
}>(), {
  placeholder: '搜索'
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="relative">
    <Icon name="search" size="sm" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      :value="modelValue"
      :placeholder="placeholder"
      class="input pl-9"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>
