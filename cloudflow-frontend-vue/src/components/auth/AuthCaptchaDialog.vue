<script setup lang="ts">
import { X } from 'lucide-vue-next'
import SliderCaptcha from './SliderCaptcha.vue'

defineProps<{
  open: boolean
  title: string
  description: string
}>()

const emit = defineEmits<{
  close: []
  verify: [token: string]
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="fixed inset-0 z-[100000010] grid place-items-center bg-black/48 p-3 backdrop-blur-[2px] sm:p-4" role="dialog" aria-modal="true" aria-labelledby="auth-captcha-title" aria-describedby="auth-captcha-description" @click.self="emit('close')">
        <div class="relative w-full max-w-[21.5rem]">
          <h2 id="auth-captcha-title" class="sr-only">{{ title }}</h2>
          <p id="auth-captcha-description" class="sr-only">{{ description }}</p>
          <button type="button" class="absolute -right-3 -top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:hover:text-slate-200" aria-label="关闭验证弹层" @click="emit('close')">
            <X :size="16" />
          </button>
          <div class="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white p-3 shadow-[0_28px_70px_-30px_rgba(15,23,42,0.34)] dark:border-slate-700 dark:bg-slate-900">
            <SliderCaptcha :width="320" :height="160" @verify="emit('verify', $event)" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
