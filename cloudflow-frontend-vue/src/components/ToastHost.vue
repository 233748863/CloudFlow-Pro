<script setup lang="ts">
import { computed } from 'vue'
import Toast from '@/components/common/Toast.vue'
import { useToastStore } from '@/stores/toast'

const toastStore = useToastStore()
const items = computed(() => toastStore.items)
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed right-4 top-4 z-[9999] space-y-3" aria-live="polite" aria-atomic="true">
      <TransitionGroup
        enter-active-class="transition ease-out duration-300"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition ease-in duration-200"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
      >
        <Toast
          v-for="item in items"
          :id="item.id"
          :key="item.id"
          :type="item.type"
          :title="item.title"
          :message="item.message"
          :duration="item.duration"
          @close="item.id && toastStore.remove(item.id)"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>
