<script setup lang="ts">
const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning'
  size?: 'sm' | 'md' | 'icon'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  variant: 'primary',
  size: 'md',
  type: 'button'
})

const variantClass: Record<NonNullable<typeof props.variant>, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  outline: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  success: 'btn-success',
  warning: 'btn-warning'
}

const sizeClass: Record<NonNullable<typeof props.size>, string> = {
  sm: 'btn-sm',
  md: 'btn-md',
  icon: 'btn-icon'
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="btn"
    :class="[variantClass[variant], sizeClass[size]]"
  >
    <slot />
  </button>
</template>
