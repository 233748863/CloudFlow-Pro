<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/icons/Icon.vue'
import Select from './Select.vue'

const props = withDefaults(defineProps<{
  total: number
  page: number
  pageSize: number
  pageSizeOptions?: number[]
  showPageSizeSelector?: boolean
  showJump?: boolean
}>(), {
  pageSizeOptions: () => [10, 20, 50, 100],
  showPageSizeSelector: true,
  showJump: false
})

const emit = defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [pageSize: number]
}>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const fromItem = computed(() => props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1)
const toItem = computed(() => Math.min(props.page * props.pageSize, props.total))
const jumpPage = ref('')

const pageSizeSelectOptions = computed(() =>
  Array.from(new Set([...props.pageSizeOptions, props.pageSize]))
    .sort((a, b) => a - b)
    .map((size) => ({ value: size, label: String(size) }))
)

const visiblePages = computed(() => {
  const pages: (number | string)[] = []
  const total = totalPages.value
  if (total <= 7) {
    for (let i = 1; i <= total; i += 1) pages.push(i)
    return pages
  }
  pages.push(1)
  const start = Math.max(2, props.page - 2)
  const end = Math.min(total - 1, props.page + 2)
  if (start > 2) pages.push('...')
  for (let i = start; i <= end; i += 1) pages.push(i)
  if (end < total - 1) pages.push('...')
  pages.push(total)
  return pages
})

const goToPage = (newPage: number) => {
  if (newPage >= 1 && newPage <= totalPages.value && newPage !== props.page) emit('update:page', newPage)
}

const submitJump = () => {
  const pageNum = Number.parseInt(jumpPage.value, 10)
  if (Number.isNaN(pageNum)) return
  jumpPage.value = ''
  goToPage(Math.min(Math.max(pageNum, 1), totalPages.value))
}
</script>

<template>
  <div class="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-6">
    <div class="flex flex-1 items-center justify-between sm:hidden">
      <button type="button" class="btn btn-secondary btn-sm" :disabled="page === 1" @click="goToPage(page - 1)">上一页</button>
      <span class="text-sm text-slate-700 dark:text-slate-300">{{ page }} / {{ totalPages }}</span>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="page === totalPages" @click="goToPage(page + 1)">下一页</button>
    </div>

    <div class="hidden flex-1 items-center justify-between sm:flex">
      <div class="flex items-center gap-4">
        <p class="text-sm text-slate-700 dark:text-slate-300">
          显示 <span class="font-medium">{{ fromItem }}</span> 到 <span class="font-medium">{{ toItem }}</span>，共 <span class="font-medium">{{ total }}</span> 条
        </p>
        <div v-if="showPageSizeSelector" class="flex items-center gap-2">
          <span class="text-sm text-slate-700 dark:text-slate-300">每页</span>
          <div class="w-24">
            <Select :model-value="pageSize" :options="pageSizeSelectOptions" @update:model-value="(value) => typeof value === 'number' && emit('update:pageSize', value)" />
          </div>
        </div>
        <div v-if="showJump" class="flex items-center gap-2">
          <span class="text-sm text-slate-700 dark:text-slate-300">跳至</span>
          <input v-model="jumpPage" type="number" min="1" :max="totalPages" class="input h-9 min-h-0 w-20 text-sm" @keyup.enter="submitJump" />
          <button type="button" class="btn btn-ghost btn-sm" @click="submitJump">跳转</button>
        </div>
      </div>

      <nav class="relative z-0 inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
        <button type="button" class="relative inline-flex items-center rounded-l-md border border-slate-300 bg-white px-2 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800" :disabled="page === 1" aria-label="上一页" @click="goToPage(page - 1)">
          <Icon name="chevronLeft" size="md" />
        </button>
        <button
          v-for="(pageNum, index) in visiblePages"
          :key="`${pageNum}-${index}`"
          type="button"
          :disabled="typeof pageNum !== 'number'"
          class="relative inline-flex items-center border px-4 py-2 text-sm font-medium"
          :class="pageNum === page ? 'z-10 border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'"
          :aria-current="pageNum === page ? 'page' : undefined"
          @click="typeof pageNum === 'number' && goToPage(pageNum)"
        >
          {{ pageNum }}
        </button>
        <button type="button" class="relative inline-flex items-center rounded-r-md border border-slate-300 bg-white px-2 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800" :disabled="page === totalPages" aria-label="下一页" @click="goToPage(page + 1)">
          <Icon name="chevronRight" size="md" />
        </button>
      </nav>
    </div>
  </div>
</template>
