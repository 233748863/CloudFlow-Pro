<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/icons/Icon.vue'
import { useAnnouncementStore } from '@/stores/announcement'

const announcementStore = useAnnouncementStore()
const current = computed(() => announcementStore.currentPopup)

const contentText = computed(() => {
  const html = current.value?.content || ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
})
</script>

<template>
  <Teleport to="body">
    <transition name="modal">
      <div v-if="current" class="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[8vh] backdrop-blur-md">
        <section class="w-full max-w-[620px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-dark-800 dark:ring-white/10">
          <header class="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 dark:border-dark-700">
            <div class="min-w-0">
              <div class="mb-2 inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-600 dark:bg-primary-900/20 dark:text-primary-300">
                <Icon name="bell" size="sm" />
                公告提醒
              </div>
              <h2 class="text-xl font-semibold leading-8 text-gray-900 dark:text-white">{{ current.title }}</h2>
            </div>
            <button type="button" class="btn btn-ghost btn-icon" aria-label="关闭公告" @click="announcementStore.dismissPopup">
              <Icon name="x" size="md" />
            </button>
          </header>

          <div class="max-h-[52vh] overflow-y-auto px-6 py-5 text-sm leading-7 text-gray-600 dark:text-gray-300">
            <div v-if="current.content" v-html="current.content" />
            <p v-else>{{ contentText || '暂无公告内容' }}</p>
          </div>

          <footer class="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-4 dark:border-dark-700 dark:bg-dark-900/40">
            <span class="mr-auto text-xs text-gray-500 dark:text-dark-400">查看后将同步为已读状态</span>
            <button type="button" class="btn btn-primary btn-sm" @click="announcementStore.dismissPopup">我知道了</button>
          </footer>
        </section>
      </div>
    </transition>
  </Teleport>
</template>
