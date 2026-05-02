<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CheckCircle2,
  ChevronsRight,
  CircleAlert,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle
} from 'lucide-vue-next'
import { checkCaptcha, getCaptcha, type CaptchaResponse } from '@/services/api/auth'

type CaptchaStatus = 'idle' | 'verifying' | 'success' | 'fail'

const props = withDefaults(defineProps<{
  width?: number
  height?: number
}>(), {
  width: 300,
  height: 150
})

const emit = defineEmits<{
  verify: [token: string]
}>()

const BG_ORIGIN_WIDTH = 300
const BG_ORIGIN_HEIGHT = 150
const SLIDER_BTN_WIDTH = 42
const HANDLE_VISUAL_WIDTH = 36
const HANDLE_INSET = (SLIDER_BTN_WIDTH - HANDLE_VISUAL_WIDTH) / 2
const KEYBOARD_STEP = 5

const statusMeta: Record<CaptchaStatus, { label: string; assist: string }> = {
  idle: { label: '拖动滑块完成验证', assist: '支持方向键 / Enter' },
  verifying: { label: '正在校验位置', assist: '请稍候' },
  success: { label: '验证通过', assist: '即将继续当前流程' },
  fail: { label: '位置不准确，正在刷新拼图', assist: '请重新拖动' }
}

const loading = ref(true)
const captchaData = ref<CaptchaResponse | null>(null)
const loadError = ref('')
const sliderLeft = ref(0)
const isDragging = ref(false)
const status = ref<CaptchaStatus>('idle')
const renderWidth = ref(props.width)
const containerRef = ref<HTMLElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)
const startX = ref(0)
const originLeft = ref(0)
const refreshTimer = ref<number | null>(null)
let resizeObserver: ResizeObserver | null = null

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const renderHeight = computed(() => Math.round((renderWidth.value / props.width) * props.height))
const scaleX = computed(() => renderWidth.value / BG_ORIGIN_WIDTH)
const scaleY = computed(() => renderHeight.value / BG_ORIGIN_HEIGHT)
const maxSliderLeft = computed(() => Math.max(renderWidth.value - SLIDER_BTN_WIDTH, 0))
const progressWidth = computed(() => clamp(sliderLeft.value + HANDLE_VISUAL_WIDTH + HANDLE_INSET, HANDLE_VISUAL_WIDTH, renderWidth.value))

const clearRefreshTimer = () => {
  if (refreshTimer.value !== null) {
    window.clearTimeout(refreshTimer.value)
    refreshTimer.value = null
  }
}

const resetSliderState = () => {
  status.value = 'idle'
  sliderLeft.value = 0
  isDragging.value = false
}

const fetchCaptcha = async () => {
  clearRefreshTimer()
  loading.value = true
  loadError.value = ''
  captchaData.value = null
  resetSliderState()
  try {
    captchaData.value = await getCaptcha()
  } catch {
    loadError.value = '拼图加载失败，请重新加载'
  } finally {
    loading.value = false
    void nextTick(() => trackRef.value?.focus())
  }
}

const updateSliderPosition = (clientX: number) => {
  const offset = clientX - startX.value
  sliderLeft.value = clamp(originLeft.value + offset, 0, maxSliderLeft.value)
}

const verifyPosition = async (currentLeft: number) => {
  if (!captchaData.value || loadError.value || status.value === 'verifying' || status.value === 'success' || currentLeft < 5) return
  status.value = 'verifying'
  try {
    const response = await checkCaptcha({
      uuid: captchaData.value.uuid,
      x: Math.round(currentLeft / scaleX.value)
    })
    if (response?.passToken) {
      status.value = 'success'
      refreshTimer.value = window.setTimeout(() => emit('verify', response.passToken), 320)
      return
    }
    status.value = 'fail'
    refreshTimer.value = window.setTimeout(() => void fetchCaptcha(), 960)
  } catch {
    status.value = 'fail'
    refreshTimer.value = window.setTimeout(() => void fetchCaptcha(), 960)
  }
}

const stopDragging = () => {
  if (!isDragging.value) return
  isDragging.value = false
  void verifyPosition(sliderLeft.value)
}

const handleMouseMove = (event: MouseEvent) => updateSliderPosition(event.clientX)
const handleTouchMove = (event: TouchEvent) => {
  const touch = event.touches[0]
  if (touch) updateSliderPosition(touch.clientX)
}

const handleStart = (clientX: number) => {
  if (loading.value || loadError.value || status.value !== 'idle') return
  startX.value = clientX
  originLeft.value = sliderLeft.value
  trackRef.value?.focus()
  isDragging.value = true
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (loading.value || loadError.value || status.value !== 'idle') return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    sliderLeft.value = clamp(sliderLeft.value - KEYBOARD_STEP, 0, maxSliderLeft.value)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    sliderLeft.value = clamp(sliderLeft.value + KEYBOARD_STEP, 0, maxSliderLeft.value)
  } else if (event.key === 'Home') {
    event.preventDefault()
    sliderLeft.value = 0
  } else if (event.key === 'End') {
    event.preventDefault()
    sliderLeft.value = maxSliderLeft.value
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    void verifyPosition(sliderLeft.value)
  }
}

const pieceStyle = computed(() => {
  if (!captchaData.value) return {}
  return {
    top: `${(captchaData.value.y || 0) * scaleY.value}px`,
    left: `${sliderLeft.value}px`,
    width: `${(captchaData.value.sliderWidth || 52) * scaleX.value}px`,
    height: `${(captchaData.value.sliderHeight || 52) * scaleY.value}px`,
    transition: isDragging.value ? 'none' : 'left 120ms ease'
  }
})

const statusToneClass = computed(() => {
  if (status.value === 'success') return 'text-emerald-600 dark:text-emerald-300'
  if (status.value === 'fail') return 'text-rose-600 dark:text-rose-300'
  if (status.value === 'verifying') return 'text-slate-700 dark:text-slate-300'
  return 'text-slate-500 dark:text-slate-400'
})

const trackProgressClass = computed(() => {
  if (status.value === 'success') return 'from-emerald-500/20 via-emerald-400/10 to-transparent'
  if (status.value === 'fail') return 'from-rose-500/20 via-rose-400/10 to-transparent'
  return 'from-teal-500/16 via-teal-400/10 to-transparent'
})

const handleClass = computed(() => {
  if (status.value === 'success') return 'border-emerald-500 bg-emerald-500 text-white'
  if (status.value === 'fail') return 'border-rose-500 bg-rose-500 text-white'
  if (isDragging.value || status.value === 'verifying') return 'border-teal-500 bg-teal-500 text-white'
  return 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
})

const trackText = computed(() => loadError.value ? '加载失败，请先重新加载' : status.value === 'idle' ? '向右拖动滑块' : statusMeta[status.value].label)

watch(isDragging, (dragging) => {
  if (dragging) {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopDragging)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', stopDragging)
  } else {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', stopDragging)
    window.removeEventListener('touchmove', handleTouchMove)
    window.removeEventListener('touchend', stopDragging)
  }
})

watch(maxSliderLeft, () => {
  sliderLeft.value = clamp(sliderLeft.value, 0, maxSliderLeft.value)
})

onMounted(() => {
  void fetchCaptcha()
  if (containerRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = Math.min(props.width, Math.floor(entries[0]?.contentRect.width || props.width))
      if (nextWidth > 0) renderWidth.value = nextWidth
    })
    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  clearRefreshTimer()
  resizeObserver?.disconnect()
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', stopDragging)
  window.removeEventListener('touchmove', handleTouchMove)
  window.removeEventListener('touchend', stopDragging)
})
</script>

<template>
  <div ref="containerRef" class="w-full">
    <div class="w-full" :style="{ maxWidth: `${width}px` }">
      <div class="relative overflow-hidden rounded-[1.2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" :style="{ width: `${renderWidth}px`, height: `${renderHeight}px` }">
        <button type="button" class="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" :disabled="loading || status === 'verifying'" title="刷新验证码" @click="fetchCaptcha">
          <RefreshCw :size="14" :class="loading ? 'animate-spin' : ''" />
        </button>

        <template v-if="captchaData">
          <img :src="captchaData.bgImage" alt="captcha background" class="absolute inset-0 h-full w-full object-cover" draggable="false" />
          <img :src="captchaData.sliderImage" alt="captcha puzzle piece" class="pointer-events-none absolute z-[2] drop-shadow-[0_8px_16px_rgba(15,23,42,0.22)] will-change-[left]" :style="pieceStyle" draggable="false" />
        </template>

        <div v-if="loading" class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white/90 text-sm text-slate-500 backdrop-blur-sm dark:bg-slate-950/90 dark:text-slate-400">
          <Loader2 :size="18" class="animate-spin" />
          <span>正在加载拼图...</span>
        </div>

        <div v-if="loadError" class="absolute inset-0 z-30 flex items-center justify-center bg-white/90 p-4 backdrop-blur-sm dark:bg-slate-950/90">
          <div class="w-full max-w-[16rem] rounded-2xl border border-rose-200 bg-white p-4 text-center shadow-sm dark:border-rose-900/60 dark:bg-slate-900">
            <CircleAlert :size="18" class="mx-auto text-rose-500" />
            <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{{ loadError }}</p>
            <button type="button" class="btn btn-secondary btn-sm mt-4 w-full" @click="fetchCaptcha">
              <RotateCcw :size="14" />
              重新加载
            </button>
          </div>
        </div>
      </div>

      <div class="mt-4 rounded-[1.2rem] border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/55">
        <div class="mb-3 flex items-center justify-between gap-3 px-1">
          <div class="inline-flex min-w-0 items-center gap-2 text-sm font-medium" :class="statusToneClass">
            <Loader2 v-if="status === 'verifying'" :size="14" class="animate-spin" />
            <CheckCircle2 v-else-if="status === 'success'" :size="14" />
            <XCircle v-else-if="status === 'fail'" :size="14" />
            <span v-else class="h-2.5 w-2.5 rounded-full bg-slate-400 dark:bg-slate-500" />
            <span class="truncate">{{ statusMeta[status].label }}</span>
          </div>
          <span class="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{{ loadError ? '需要重新加载' : statusMeta[status].assist }}</span>
        </div>

        <div
          ref="trackRef"
          class="relative h-14 overflow-hidden rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:bg-slate-900"
          :class="status === 'success' ? 'border-emerald-200 dark:border-emerald-900/40' : status === 'fail' ? 'border-rose-200 dark:border-rose-900/40' : 'border-slate-200 dark:border-slate-700'"
          :tabindex="loadError ? -1 : 0"
          role="slider"
          :aria-valuemin="0"
          :aria-valuemax="maxSliderLeft"
          :aria-valuenow="Math.round(sliderLeft)"
          :aria-valuetext="statusMeta[status].label"
          aria-label="拖动滑块完成验证，也可以使用方向键"
          @keydown="handleKeyDown"
        >
          <div class="absolute inset-y-0 left-0 bg-gradient-to-r transition-[width] duration-200" :class="trackProgressClass" :style="{ width: `${progressWidth}px` }" />
          <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-14 text-center text-xs font-medium transition-opacity duration-200" :class="statusToneClass" :style="{ opacity: sliderLeft > maxSliderLeft * 0.48 ? 0.32 : 1 }">
            {{ trackText }}
          </div>
          <button
            type="button"
            class="absolute bottom-[5px] top-[5px] z-20 inline-flex items-center justify-center rounded-xl border transition"
            :class="handleClass"
            :style="{ left: `${sliderLeft + HANDLE_INSET}px`, width: `${HANDLE_VISUAL_WIDTH}px` }"
            :disabled="loading || Boolean(loadError) || status === 'verifying' || status === 'success'"
            aria-hidden="true"
            @mousedown.prevent="handleStart($event.clientX)"
            @touchstart="handleStart($event.touches[0].clientX)"
          >
            <Loader2 v-if="status === 'verifying'" :size="15" class="animate-spin" />
            <CheckCircle2 v-else-if="status === 'success'" :size="15" />
            <XCircle v-else-if="status === 'fail'" :size="15" />
            <ChevronsRight v-else :size="16" />
          </button>
        </div>
        <div class="sr-only" aria-live="polite">{{ loadError || statusMeta[status].label }}</div>
      </div>
    </div>
  </div>
</template>
