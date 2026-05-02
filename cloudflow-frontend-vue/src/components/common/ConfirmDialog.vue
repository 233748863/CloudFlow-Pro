<script setup lang="ts">
import BaseDialog from './BaseDialog.vue'
import Button from './Button.vue'

withDefaults(defineProps<{
  show: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}>(), {
  confirmText: '确认',
  cancelText: '取消',
  danger: false
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <BaseDialog :show="show" :title="title" width="narrow" @close="emit('cancel')">
    <div class="space-y-4">
      <p class="text-sm leading-6 text-slate-600 dark:text-slate-400">{{ message }}</p>
      <slot />
    </div>
    <template #footer>
      <div class="flex justify-end gap-3">
        <Button variant="outline" @click="emit('cancel')">{{ cancelText }}</Button>
        <Button :variant="danger ? 'danger' : 'primary'" @click="emit('confirm')">{{ confirmText }}</Button>
      </div>
    </template>
  </BaseDialog>
</template>
