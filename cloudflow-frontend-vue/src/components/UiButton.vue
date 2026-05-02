<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'icon'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  variant: 'primary',
  size: 'md',
  type: 'button'
})
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="btn"
    :class="[
      variant === 'outline' ? 'btn-secondary' : `btn-${variant}`,
      size === 'icon' ? 'btn-icon' : `btn-${size}`
    ]"
  >
    <slot />
  </button>
</template>
