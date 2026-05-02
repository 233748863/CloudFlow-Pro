<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string | number | null
  type?: string
  label?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  readonly?: boolean
  error?: string
  hint?: string
  id?: string
  autocomplete?: string
}>(), {
  type: 'text',
  disabled: false,
  required: false,
  readonly: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
  blur: [event: FocusEvent]
  focus: [event: FocusEvent]
  enter: [event: KeyboardEvent]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const placeholderText = computed(() => props.placeholder || '')

const onInput = (event: Event) => {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

defineExpose({
  focus: () => inputRef.value?.focus(),
  select: () => inputRef.value?.select()
})
</script>

<template>
  <div class="w-full">
    <label v-if="label" :for="id" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>
    <div class="relative">
      <div v-if="$slots.prefix" class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
        <slot name="prefix" />
      </div>
      <input
        :id="id"
        ref="inputRef"
        :type="type"
        :value="modelValue ?? ''"
        :disabled="disabled"
        :required="required"
        :placeholder="placeholderText"
        :autocomplete="autocomplete"
        :readonly="readonly"
        class="input transition-all duration-200"
        :class="[$slots.prefix ? 'pl-11' : '', $slots.suffix ? 'pr-11' : '', error ? 'border-red-500 ring-2 ring-red-500/20' : '', disabled ? 'cursor-not-allowed opacity-60' : '']"
        @input="onInput"
        @change="emit('change', ($event.target as HTMLInputElement).value)"
        @blur="emit('blur', $event as FocusEvent)"
        @focus="emit('focus', $event as FocusEvent)"
        @keyup.enter="emit('enter', $event)"
      />
      <div v-if="$slots.suffix" class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
        <slot name="suffix" />
      </div>
    </div>
    <p v-if="error" class="mt-1.5 text-xs text-red-600">{{ error }}</p>
    <p v-else-if="hint" class="mt-1.5 text-xs text-slate-500">{{ hint }}</p>
  </div>
</template>
