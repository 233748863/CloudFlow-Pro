<script setup lang="ts">
import { Home, MessageSquare, PlayCircle, User } from 'lucide-vue-next'
import { useRoute } from 'vue-router'

const route = useRoute()
const tabs = [
  { path: '/dashboard', label: '首页', icon: Home },
  { path: '/workplace', label: '工作台', icon: PlayCircle },
  { path: '/messages', label: '消息', icon: MessageSquare },
  { path: '/profile', label: '我的', icon: User }
]
</script>

<template>
  <div class="flex h-screen flex-col bg-slate-50 dark:bg-slate-950">
    <div class="flex-1 overflow-y-auto pb-16">
      <RouterView v-slot="{ Component, route: childRoute }">
        <Transition name="mobile-content-fade" mode="out-in">
          <component :is="Component" :key="childRoute.fullPath" />
        </Transition>
      </RouterView>
    </div>
    <nav class="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" aria-label="主导航">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.path"
        :to="tab.path"
        class="flex h-full w-full flex-col items-center justify-center text-slate-500"
        :class="route.path === tab.path ? 'text-teal-600 dark:text-teal-300' : ''"
      >
        <component :is="tab.icon" class="mb-1 h-6 w-6" />
        <span class="text-[10px] font-medium">{{ tab.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.mobile-content-fade-enter-active,
.mobile-content-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.mobile-content-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.mobile-content-fade-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

@media (prefers-reduced-motion: reduce) {
  .mobile-content-fade-enter-active,
  .mobile-content-fade-leave-active {
    transition: opacity 0.01s linear;
  }

  .mobile-content-fade-enter-from,
  .mobile-content-fade-leave-to {
    transform: none;
  }
}
</style>
