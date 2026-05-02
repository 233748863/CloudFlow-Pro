<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from '@/components/icons/Icon.vue'

const STORAGE_KEY = 'cf-locale'

const availableLocales = [
  { code: 'zh', name: '中文', flag: 'CN' },
  { code: 'en', name: 'English', flag: 'EN' }
]

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)
const currentLocaleCode = ref(localStorage.getItem(STORAGE_KEY) || 'zh')

const currentLocale = computed(() =>
  availableLocales.find((locale) => locale.code === currentLocaleCode.value) || availableLocales[0]
)

function toggleDropdown() {
  isOpen.value = !isOpen.value
}

function selectLocale(code: string) {
  currentLocaleCode.value = code
  localStorage.setItem(STORAGE_KEY, code)
  isOpen.value = false
}

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div ref="dropdownRef" class="relative">
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
      :title="currentLocale.name"
      @click.stop="toggleDropdown"
    >
      <span class="text-xs font-semibold">{{ currentLocale.flag }}</span>
      <span class="hidden sm:inline">{{ currentLocale.code.toUpperCase() }}</span>
      <Icon name="chevronDown" size="xs" class="text-gray-400 transition-transform duration-200" :class="{ 'rotate-180': isOpen }" />
    </button>

    <transition name="dropdown">
      <div v-if="isOpen" class="absolute right-0 z-50 mt-1 w-32 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-dark-700 dark:bg-dark-800">
        <button
          v-for="locale in availableLocales"
          :key="locale.code"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-700"
          :class="locale.code === currentLocaleCode ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400' : ''"
          @click="selectLocale(locale.code)"
        >
          <span class="w-5 text-xs font-semibold">{{ locale.flag }}</span>
          <span>{{ locale.name }}</span>
          <Icon v-if="locale.code === currentLocaleCode" name="check" size="sm" class="ml-auto text-primary-500" />
        </button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}
</style>
