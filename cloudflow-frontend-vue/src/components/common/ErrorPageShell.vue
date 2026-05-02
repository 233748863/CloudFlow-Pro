<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/icons/Icon.vue'

const props = withDefaults(defineProps<{
  status: string
  title: string
  description: string
  icon?: string
  tone?: 'primary' | 'warning' | 'danger'
  retryLabel?: string
  homeLabel?: string
  showBack?: boolean
}>(), {
  icon: 'alertTriangle',
  tone: 'primary',
  retryLabel: '重试',
  homeLabel: '返回首页',
  showBack: true
})

const route = useRoute()
const router = useRouter()

const toneClass = computed(() => {
  if (props.tone === 'danger') return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
  if (props.tone === 'warning') return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
  return 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300'
})

function retry() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  if (redirect && redirect !== route.fullPath) {
    router.replace(redirect)
    return
  }
  window.location.reload()
}

function goBack() {
  router.back()
}
</script>

<template>
  <main class="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 px-4 py-10 dark:bg-dark-950">
    <div class="pointer-events-none fixed inset-0 bg-mesh-gradient dark:opacity-60" />

    <section class="card relative w-full max-w-2xl overflow-hidden p-8 text-center sm:p-10">
      <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl" :class="toneClass">
        <Icon :name="icon" size="xl" />
      </div>
      <div class="mt-6 text-sm font-semibold uppercase tracking-[0.3em]" :class="tone === 'danger' ? 'text-red-600 dark:text-red-300' : tone === 'warning' ? 'text-amber-600 dark:text-amber-300' : 'text-primary-600 dark:text-primary-300'">
        {{ status }}
      </div>
      <h1 class="mt-4 text-2xl font-bold text-gray-900 dark:text-white">{{ title }}</h1>
      <p class="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-500 dark:text-dark-400">
        {{ description }}
      </p>

      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button type="button" class="btn btn-primary btn-md" @click="retry">
          <Icon name="refresh" size="sm" />
          {{ retryLabel }}
        </button>
        <button v-if="showBack" type="button" class="btn btn-secondary btn-md" @click="goBack">
          <Icon name="chevronLeft" size="sm" />
          返回上一页
        </button>
        <RouterLink to="/" class="btn btn-secondary btn-md">
          <Icon name="home" size="sm" />
          {{ homeLabel }}
        </RouterLink>
      </div>
    </section>
  </main>
</template>
