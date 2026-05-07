<template>
  <NavigationProgress :active="navigation.loading" />
  <OfflineBanner />
  <RouterView v-slot="{ Component, route }">
    <Transition name="page-fade" mode="out-in">
      <component :is="Component" :key="route.matched[0]?.path || route.path" />
    </Transition>
  </RouterView>
  <ToastHost />
  <AnnouncementPopup />
  <ForcePasswordChangeDialog
    :open="Boolean(auth.user?.forcePasswordChange)"
    @changed="auth.refreshUser"
    @logout="auth.logout"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import ToastHost from '@/components/ToastHost.vue'
import ForcePasswordChangeDialog from '@/components/auth/ForcePasswordChangeDialog.vue'
import NavigationProgress from '@/components/common/NavigationProgress.vue'
import AnnouncementPopup from '@/components/common/AnnouncementPopup.vue'
import OfflineBanner from '@/components/common/OfflineBanner.vue'
import { updateFavicon } from '@/router/title'
import { useAnnouncementStore } from '@/stores/announcement'
import { useAuthStore } from '@/stores/auth'
import { useNavigationStore } from '@/stores/navigation'

const route = useRoute()
const auth = useAuthStore()
const announcementStore = useAnnouncementStore()
const navigation = useNavigationStore()

updateFavicon()

function onVisibilityChange() {
  if (document.visibilityState === 'visible' && auth.isAuthenticated) {
    void announcementStore.fetchAnnouncements()
  }
}

watch(
  () => auth.isAuthenticated,
  (isAuthenticated, oldValue) => {
    if (isAuthenticated) {
      if (oldValue === false) {
        window.setTimeout(() => announcementStore.fetchAnnouncements(true), 3000)
      } else {
        void announcementStore.fetchAnnouncements()
      }
      document.addEventListener('visibilitychange', onVisibilityChange)
      return
    }

    announcementStore.reset()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  },
  { immediate: true }
)

watch(
  () => route.fullPath,
  () => {
    if (auth.isAuthenticated && !auth.user?.forcePasswordChange) {
      void announcementStore.fetchAnnouncements()
    }
  }
)

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<style scoped>
.page-fade-enter-active,
.page-fade-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .page-fade-enter-active,
  .page-fade-leave-active {
    transition: opacity 0.01s linear;
  }

  .page-fade-enter-from,
  .page-fade-leave-to {
    transform: none;
  }
}
</style>
