<script setup lang="ts">
withDefaults(defineProps<{
  modelValue?: string | null
  label?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  rows?: number
  error?: string
  hint?: string
}>(), {
  rows: 4,
  disabled: false,
  required: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()
</script>

<template>
  <div class="w-full">
    <label v-if="label" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>
    <textarea
      :value="modelValue ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :rows="rows"
      class="input min-h-[96px] resize-y py-2"
      :class="error ? 'border-red-500 ring-2 ring-red-500/20' : ''"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      @change="emit('change', ($event.target as HTMLTextAreaElement).value)"
    />
    <p v-if="error" class="mt-1.5 text-xs text-red-600">{{ error }}</p>
    <p v-else-if="hint" class="mt-1.5 text-xs text-slate-500">{{ hint }}</p>
  </div>
</template>
