<script setup lang="ts">
import Icon from '@/components/icons/Icon.vue'

const props = withDefaults(defineProps<{
  id?: number
  type?: 'success' | 'error' | 'warning' | 'info'
  title?: string
  message: string
  duration?: number
}>(), {
  type: 'info'
})

const emit = defineEmits<{ close: [id?: number] }>()

const iconName = {
  success: 'checkCircle',
  error: 'alertTriangle',
  warning: 'alertTriangle',
  info: 'infoCircle'
} as const

const iconColor = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-primary-500'
} as const

const progressColor = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-primary-500'
} as const
</script>

<template>
  <div class="pointer-events-auto min-w-[320px] max-w-md overflow-hidden rounded-xl border-l-4 bg-white shadow-lg dark:bg-dark-800" :class="`toast-${type}`">
    <div class="p-4">
      <div class="flex items-start gap-3">
        <Icon :name="iconName[type]" size="md" :class="iconColor[type]" />
        <div class="min-w-0 flex-1">
          <p v-if="title" class="text-sm font-semibold text-gray-900 dark:text-white">{{ title }}</p>
          <p class="text-sm leading-relaxed" :class="title ? 'mt-1 text-gray-600 dark:text-gray-300' : 'text-gray-900 dark:text-white'">
            {{ message }}
          </p>
        </div>
        <button
          type="button"
          class="-m-1 shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-dark-700 dark:hover:text-gray-300"
          aria-label="关闭通知"
          @click="emit('close', props.id)"
        >
          <Icon name="x" size="sm" />
        </button>
      </div>
    </div>

    <div v-if="duration" class="h-1 bg-gray-100 dark:bg-dark-700">
      <div class="toast-progress h-full" :class="progressColor[type]" :style="{ animationDuration: `${duration}ms` }" />
    </div>
  </div>
</template>

<style scoped>
.toast-progress {
  width: 100%;
  animation-name: toast-progress-shrink;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

@keyframes toast-progress-shrink {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}
</style>
