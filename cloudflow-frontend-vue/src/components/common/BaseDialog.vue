<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from '@/components/icons/Icon.vue'

type DialogWidth = 'narrow' | 'normal' | 'wide' | 'extra-wide' | 'full'

const props = withDefaults(defineProps<{
  show: boolean
  title: string
  width?: DialogWidth
  closeOnEscape?: boolean
  closeOnClickOutside?: boolean
  hideCloseButton?: boolean
  zIndex?: number
}>(), {
  width: 'normal',
  closeOnEscape: true,
  closeOnClickOutside: false,
  hideCloseButton: false,
  zIndex: 50
})

const emit = defineEmits<{ close: [] }>()

let dialogIdCounter = 0
const dialogId = `cf-dialog-title-${++dialogIdCounter}`
const dialogRef = ref<HTMLElement | null>(null)
let previousActiveElement: HTMLElement | null = null

const zIndexStyle = computed(() => (props.zIndex !== 50 ? { zIndex: props.zIndex } : undefined))
const widthClasses = computed(() => {
  const widths: Record<DialogWidth, string> = {
    narrow: 'max-w-md',
    normal: 'max-w-lg',
    wide: 'w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl',
    'extra-wide': 'w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl',
    full: 'w-full sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl'
  }
  return widths[props.width]
})

const handleClose = () => {
  if (props.closeOnClickOutside) emit('close')
}

const handleEscape = (event: KeyboardEvent) => {
  if (props.show && props.closeOnEscape && event.key === 'Escape') emit('close')
}

watch(
  () => props.show,
  async (isOpen) => {
    if (isOpen) {
      previousActiveElement = document.activeElement as HTMLElement
      document.body.classList.add('modal-open')
      await nextTick()
      dialogRef.value?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus()
    } else {
      document.body.classList.remove('modal-open')
      previousActiveElement?.focus?.()
      previousActiveElement = null
    }
  },
  { immediate: true }
)

onMounted(() => document.addEventListener('keydown', handleEscape))
onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape)
  document.body.classList.remove('modal-open')
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/48 p-4 backdrop-blur-[2px]"
        :style="zIndexStyle"
        :aria-labelledby="dialogId"
        role="dialog"
        aria-modal="true"
        @click.self="handleClose"
      >
        <div ref="dialogRef" class="max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_70px_-30px_rgba(15,23,42,0.34)] dark:border-slate-700 dark:bg-slate-950" :class="widthClasses" @click.stop>
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 :id="dialogId" class="text-base font-semibold text-slate-900 dark:text-slate-100">{{ title }}</h3>
            <button v-if="!hideCloseButton" type="button" class="-mr-2 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="关闭弹窗" @click="emit('close')">
              <Icon name="x" size="md" />
            </button>
          </div>
          <div class="max-h-[calc(90vh-8rem)] overflow-y-auto p-5">
            <slot />
          </div>
          <div v-if="$slots.footer" class="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
body.modal-open {
  overflow: hidden;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.18s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
