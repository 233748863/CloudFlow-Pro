<script setup lang="ts">
import Icon from '@/components/icons/Icon.vue'
import { useNetworkStore } from '@/stores/network'

const network = useNetworkStore()
</script>

<template>
  <transition name="offline-banner">
    <div v-if="!network.online" class="fixed inset-x-0 top-0 z-[10000] border-b border-amber-200 bg-amber-50 px-4 py-2 text-amber-800 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/80 dark:text-amber-200">
      <div class="mx-auto flex max-w-6xl items-center justify-center gap-2 text-sm">
        <Icon name="wifi" size="sm" />
        网络连接已断开，恢复后页面会继续使用当前会话。
      </div>
    </div>
  </transition>
</template>

<style scoped>
.offline-banner-enter-active,
.offline-banner-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.offline-banner-enter-from,
.offline-banner-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>
