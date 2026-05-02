<script setup lang="ts" generic="T extends Record<string, unknown>">
import { computed, ref } from 'vue'
import Icon from '@/components/icons/Icon.vue'
import type { Column } from './types'

const props = withDefaults(defineProps<{
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  rowKey?: string | ((row: T) => string | number)
  stickyFirstColumn?: boolean
  stickyActionsColumn?: boolean
  defaultSortKey?: string
  defaultSortOrder?: 'asc' | 'desc'
}>(), {
  loading: false,
  stickyFirstColumn: true,
  stickyActionsColumn: true,
  defaultSortOrder: 'asc'
})

const emit = defineEmits<{
  sort: [key: string, order: 'asc' | 'desc']
}>()

const sortKey = ref(props.defaultSortKey || '')
const sortOrder = ref<'asc' | 'desc'>(props.defaultSortOrder)

const dataColumns = computed(() => props.columns.filter((column) => column.key !== 'actions'))
const hasActionsColumn = computed(() => props.columns.some((column) => column.key === 'actions'))

const resolveRowKey = (row: T, index: number) => {
  if (typeof props.rowKey === 'function') return props.rowKey(row)
  if (typeof props.rowKey === 'string' && props.rowKey) return row[props.rowKey] as string | number
  return (row.id as string | number | undefined) ?? index
}

const handleSort = (key: string) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
  emit('sort', key, sortOrder.value)
}

const sortedData = computed(() => {
  if (!sortKey.value) return props.data
  const key = sortKey.value
  const order = sortOrder.value
  return [...props.data].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    const result = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' })
    return order === 'asc' ? result : -result
  })
})

const getCellValue = (row: T, column: Column<T>) => row[column.key]
const formatValue = (row: T, column: Column<T>) => column.formatter ? column.formatter(getCellValue(row, column), row) : String(getCellValue(row, column) ?? '')
</script>

<template>
  <div class="space-y-3 md:hidden">
    <template v-if="loading">
      <div v-for="i in 5" :key="i" class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div class="space-y-3">
          <div v-for="column in dataColumns" :key="column.key" class="flex justify-between">
            <div class="h-4 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div class="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      </div>
    </template>

    <div v-else-if="!data || data.length === 0" class="rounded-lg border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-950">
      <slot name="empty">
        <div class="flex flex-col items-center">
          <Icon name="inbox" size="xl" class="mb-4 text-slate-400" />
          <p class="text-lg font-medium text-slate-900 dark:text-slate-100">暂无数据</p>
        </div>
      </slot>
    </div>

    <div v-else v-for="(row, index) in sortedData" :key="resolveRowKey(row, index)" class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div class="space-y-3">
        <div v-for="column in dataColumns" :key="column.key" class="flex items-start justify-between gap-4">
          <span class="text-xs font-medium uppercase tracking-wider text-slate-500">{{ column.label }}</span>
          <div class="text-right text-sm text-slate-900 dark:text-slate-100">
            <slot :name="`cell-${column.key}`" :row="row" :value="getCellValue(row, column)">
              {{ formatValue(row, column) }}
            </slot>
          </div>
        </div>
        <div v-if="hasActionsColumn" class="border-t border-slate-200 pt-3 dark:border-slate-800">
          <slot name="cell-actions" :row="row" :value="row.actions" />
        </div>
      </div>
    </div>
  </div>

  <div class="table-wrapper hidden min-h-0 md:block">
    <table class="table min-w-max">
      <thead class="sticky top-0 z-20">
        <tr>
          <th
            v-for="(column, index) in columns"
            :key="column.key"
            scope="col"
            class="text-xs uppercase tracking-wider"
            :class="[column.sortable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-700' : '', column.class, stickyFirstColumn && index === 0 ? 'sticky left-0 z-30' : '', stickyActionsColumn && column.key === 'actions' ? 'sticky right-0 z-30' : '']"
            @click="column.sortable && handleSort(column.key)"
          >
            <slot :name="`header-${column.key}`" :column="column" :sort-key="sortKey" :sort-order="sortOrder">
              <div class="flex items-center gap-1">
                <span>{{ column.label }}</span>
                <Icon v-if="column.sortable" :name="sortKey === column.key && sortOrder === 'desc' ? 'chevronDown' : 'chevronRight'" size="sm" class="text-slate-400" />
              </div>
            </slot>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading" v-for="i in 5" :key="i">
          <td v-for="column in columns" :key="column.key" class="whitespace-nowrap">
            <div class="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </td>
        </tr>
        <tr v-else-if="!data || data.length === 0">
          <td :colspan="columns.length" class="px-4 py-12 text-center text-slate-500">
            <slot name="empty">
              <div class="flex flex-col items-center">
                <Icon name="inbox" size="xl" class="mb-4 text-slate-400" />
                <p class="text-lg font-medium text-slate-900 dark:text-slate-100">暂无数据</p>
              </div>
            </slot>
          </td>
        </tr>
        <tr v-else v-for="(row, rowIndex) in sortedData" :key="resolveRowKey(row, rowIndex)">
          <td
            v-for="(column, colIndex) in columns"
            :key="column.key"
            class="whitespace-nowrap"
            :class="[column.class, stickyFirstColumn && colIndex === 0 ? 'sticky left-0 z-10 bg-white dark:bg-dark-800' : '', stickyActionsColumn && column.key === 'actions' ? 'sticky right-0 z-10 bg-white dark:bg-dark-800' : '']"
          >
            <slot :name="`cell-${column.key}`" :row="row" :value="getCellValue(row, column)">
              {{ formatValue(row, column) }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
