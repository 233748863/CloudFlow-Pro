<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from '@/components/icons/Icon.vue'
import type { SelectOption } from './types'

const props = withDefaults(defineProps<{
  modelValue?: string | number | boolean | null
  options: SelectOption[] | Array<Record<string, unknown>>
  placeholder?: string
  disabled?: boolean
  error?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  emptyText?: string
  valueKey?: string
  labelKey?: string
  triggerClass?: string
}>(), {
  disabled: false,
  error: false,
  searchable: false,
  valueKey: 'value',
  labelKey: 'label',
  placeholder: '请选择',
  searchPlaceholder: '搜索',
  emptyText: '无可选项',
  triggerClass: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number | boolean | null]
  change: [value: string | number | boolean | null, option: SelectOption | null]
}>()

const isOpen = ref(false)
const searchQuery = ref('')
const focusedIndex = ref(-1)
const containerRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const optionsListRef = ref<HTMLElement | null>(null)
const triggerRect = ref<DOMRect | null>(null)
const dropdownPosition = ref<'bottom' | 'top'>('bottom')
const instanceId = `select-${Math.random().toString(36).slice(2, 9)}`

const getRecord = (option: unknown) => typeof option === 'object' && option !== null ? option as Record<string, unknown> : null
const getOptionValue = (option: unknown) => getRecord(option)?.[props.valueKey] ?? option
const getOptionLabel = (option: unknown) => {
  const record = getRecord(option)
  return record ? String(record[props.labelKey] ?? '') : String(option ?? '')
}
const getOptionDescription = (option: unknown) => {
  const record = getRecord(option)
  return record?.description == null ? '' : String(record.description)
}
const isOptionDisabled = (option: unknown) => Boolean(getRecord(option)?.disabled)
const isGroupHeaderOption = (option: unknown) => getRecord(option)?.kind === 'group'
const isSelected = (option: unknown) => getOptionValue(option) === props.modelValue

const selectedOption = computed(() => props.options.find((opt) => isSelected(opt)) || null)
const selectedLabel = computed(() => selectedOption.value ? getOptionLabel(selectedOption.value) : props.placeholder)
const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!props.searchable || !query) return props.options
  return props.options.filter((opt) => {
    const label = getOptionLabel(opt).toLowerCase()
    const description = getOptionDescription(opt).toLowerCase()
    return label.includes(query) || description.includes(query)
  })
})

const updateTriggerRect = () => {
  if (containerRef.value) triggerRect.value = containerRef.value.getBoundingClientRect()
}

const dropdownStyle = computed(() => {
  if (!triggerRect.value) return {}
  const rect = triggerRect.value
  const style: Record<string, string> = {
    position: 'fixed',
    left: `${rect.left}px`,
    minWidth: `${rect.width}px`,
    zIndex: '100000020'
  }
  if (dropdownPosition.value === 'top') {
    style.bottom = `${window.innerHeight - rect.top + 4}px`
  } else {
    style.top = `${rect.bottom + 4}px`
  }
  return style
})

const calculateDropdownPosition = () => {
  updateTriggerRect()
  nextTick(() => {
    if (!dropdownRef.value || !triggerRect.value) return
    const dropdownHeight = dropdownRef.value.offsetHeight || 240
    const spaceBelow = window.innerHeight - triggerRect.value.bottom
    const spaceAbove = triggerRect.value.top
    dropdownPosition.value = spaceBelow < dropdownHeight && spaceAbove > dropdownHeight ? 'top' : 'bottom'
  })
}

const findNextEnabledIndex = (startIndex: number) => {
  const opts = filteredOptions.value
  if (opts.length === 0) return -1
  for (let offset = 0; offset < opts.length; offset += 1) {
    const index = (startIndex + offset) % opts.length
    if (!isOptionDisabled(opts[index]) && !isGroupHeaderOption(opts[index])) return index
  }
  return -1
}

const findPrevEnabledIndex = (startIndex: number) => {
  const opts = filteredOptions.value
  if (opts.length === 0) return -1
  for (let offset = 0; offset < opts.length; offset += 1) {
    const index = (startIndex - offset + opts.length) % opts.length
    if (!isOptionDisabled(opts[index]) && !isGroupHeaderOption(opts[index])) return index
  }
  return -1
}

const scrollToFocused = () => {
  nextTick(() => {
    const list = optionsListRef.value
    if (!list || focusedIndex.value < 0) return
    const focusedEl = list.children[focusedIndex.value] as HTMLElement | undefined
    if (!focusedEl) return
    if (focusedEl.offsetTop < list.scrollTop) {
      list.scrollTop = focusedEl.offsetTop
    } else if (focusedEl.offsetTop + focusedEl.offsetHeight > list.scrollTop + list.offsetHeight) {
      list.scrollTop = focusedEl.offsetTop + focusedEl.offsetHeight - list.offsetHeight
    }
  })
}

const selectOption = (option: unknown) => {
  if (isOptionDisabled(option) || isGroupHeaderOption(option)) return
  const value = (getOptionValue(option) ?? null) as string | number | boolean | null
  emit('update:modelValue', value)
  emit('change', value, getRecord(option) as SelectOption | null)
  isOpen.value = false
  triggerRef.value?.focus()
}

const toggle = () => {
  if (!props.disabled) isOpen.value = !isOpen.value
}

const onTriggerKeyDown = () => {
  if (!isOpen.value) isOpen.value = true
}

const onDropdownKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusedIndex.value = findNextEnabledIndex(focusedIndex.value + 1)
    scrollToFocused()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusedIndex.value = findPrevEnabledIndex(focusedIndex.value - 1)
    scrollToFocused()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const option = filteredOptions.value[focusedIndex.value]
    if (option) selectOption(option)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    isOpen.value = false
    triggerRef.value?.focus()
  } else if (event.key === 'Tab') {
    isOpen.value = false
  }
}

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  const isInDropdown = Boolean(target.closest(`.${instanceId}`))
  const isInTrigger = containerRef.value?.contains(target)
  if (!isInDropdown && !isInTrigger) isOpen.value = false
}

watch(isOpen, (open) => {
  if (open) {
    calculateDropdownPosition()
    const selectedIndex = filteredOptions.value.findIndex((opt) => isSelected(opt))
    focusedIndex.value = selectedIndex >= 0 ? selectedIndex : findNextEnabledIndex(0)
    if (props.searchable) void nextTick(() => searchInputRef.value?.focus())
    window.addEventListener('scroll', updateTriggerRect, { capture: true, passive: true })
    window.addEventListener('resize', calculateDropdownPosition)
  } else {
    searchQuery.value = ''
    focusedIndex.value = -1
    window.removeEventListener('scroll', updateTriggerRect, { capture: true })
    window.removeEventListener('resize', calculateDropdownPosition)
  }
})

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', updateTriggerRect, { capture: true })
  window.removeEventListener('resize', calculateDropdownPosition)
})
</script>

<template>
  <div ref="containerRef" class="relative">
    <button
      ref="triggerRef"
      type="button"
      class="select-trigger"
      :class="[isOpen && 'select-trigger-open', error && 'select-trigger-error', disabled && 'select-trigger-disabled', triggerClass]"
      :disabled="disabled"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      aria-label="选择选项"
      @click="toggle"
      @keydown.down.prevent="onTriggerKeyDown"
      @keydown.up.prevent="onTriggerKeyDown"
    >
      <span v-if="$slots.prefix" class="select-prefix">
        <slot name="prefix" />
      </span>
      <span class="select-value">
        <slot name="selected" :option="selectedOption">{{ selectedLabel }}</slot>
      </span>
      <span class="select-icon">
        <Icon name="chevronDown" size="md" class="transition-transform duration-200" :class="isOpen ? 'rotate-180' : ''" />
      </span>
    </button>

    <Teleport to="body">
      <Transition name="select-dropdown">
        <div
          v-if="isOpen"
          ref="dropdownRef"
          class="select-dropdown-portal"
          :class="instanceId"
          :style="dropdownStyle"
          role="listbox"
          @click.stop
          @mousedown.stop
          @keydown="onDropdownKeyDown"
        >
          <div v-if="searchable" class="select-search">
            <Icon name="search" size="sm" class="text-slate-400" />
            <input ref="searchInputRef" v-model="searchQuery" type="text" :placeholder="searchPlaceholder" class="select-search-input" @click.stop />
          </div>
          <div ref="optionsListRef" class="select-options">
            <button
              v-for="(option, index) in filteredOptions"
              :key="`${typeof getOptionValue(option)}:${String(getOptionValue(option) ?? '')}`"
              type="button"
              class="select-option"
              :class="[isGroupHeaderOption(option) && 'select-option-group', isSelected(option) && 'select-option-selected', isOptionDisabled(option) && !isGroupHeaderOption(option) && 'select-option-disabled', focusedIndex === index && !isGroupHeaderOption(option) && 'select-option-focused']"
              :disabled="isOptionDisabled(option)"
              role="option"
              :aria-selected="isSelected(option)"
              @mouseenter="!isOptionDisabled(option) && !isGroupHeaderOption(option) && (focusedIndex = index)"
              @click="selectOption(option)"
            >
              <slot name="option" :option="option" :selected="isSelected(option)">
                <span class="select-option-label">{{ getOptionLabel(option) }}</span>
                <Icon v-if="isSelected(option)" name="check" size="sm" class="text-teal-600" />
              </slot>
            </button>
            <div v-if="filteredOptions.length === 0" class="select-empty">{{ emptyText }}</div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.select-trigger {
  position: relative;
  display: flex;
  min-height: 2.75rem;
  width: 100%;
  cursor: pointer;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-radius: 0.75rem;
  border: 1px solid rgb(226 232 240);
  background: white;
  padding: 0.5rem 0.75rem;
  text-align: left;
  color: rgb(15 23 42);
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.select-trigger.cf-auth-select-trigger {
  min-height: 2.875rem;
  border-radius: 0.9rem;
  padding-left: 2.75rem;
  padding-right: 0.95rem;
  font-size: 0.95rem;
}

.select-trigger:hover {
  border-color: rgb(203 213 225);
}

.select-trigger:focus,
.select-trigger-open {
  border-color: rgb(20 184 166);
  box-shadow: 0 0 0 3px rgb(20 184 166 / 0.14);
}

.select-trigger-error {
  border-color: rgb(239 68 68);
  box-shadow: 0 0 0 3px rgb(239 68 68 / 0.16);
}

.select-trigger-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.select-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  color: rgb(148 163 184);
}

.select-prefix {
  pointer-events: none;
  position: absolute;
  left: 0.75rem;
  top: 50%;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  color: rgb(148 163 184);
  transform: translateY(-50%);
}

.select-value {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.dark) .select-trigger {
  border-color: rgb(51 65 85);
  background: rgb(2 6 23 / 0.72);
  color: rgb(248 250 252);
}
</style>

<style>
.select-dropdown-portal {
  width: max-content;
  min-width: 200px;
  overflow: hidden;
  border-radius: 0.75rem;
  border: 1px solid rgb(226 232 240);
  background: white;
  box-shadow: 0 18px 40px rgb(15 23 42 / 0.16);
  pointer-events: auto !important;
}

.dark .select-dropdown-portal {
  border-color: rgb(51 65 85);
  background: rgb(15 23 42);
  box-shadow: 0 22px 44px rgb(2 6 23 / 0.42);
}

.select-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid rgb(241 245 249);
  padding: 0.5rem 0.75rem;
}

.dark .select-search {
  border-bottom-color: rgb(30 41 59);
}

.select-search-input {
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  font-size: 0.875rem;
  color: rgb(15 23 42);
  outline: none;
}

.dark .select-search-input {
  color: rgb(248 250 252);
}

.select-options {
  max-height: 15rem;
  overflow-y: auto;
  padding: 0.25rem 0;
}

.select-option {
  display: flex;
  width: 100%;
  cursor: pointer;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border: 0;
  background: transparent;
  padding: 0.625rem 1rem;
  text-align: left;
  font-size: 0.875rem;
  color: rgb(51 65 85);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.select-option:hover,
.select-option-focused {
  background: rgb(248 250 252);
}

.select-option-selected {
  background: rgb(240 253 250);
  color: rgb(15 118 110);
}

.select-option-disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.select-option-group {
  cursor: default;
  background: rgb(248 250 252);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgb(100 116 139);
}

.select-option-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-empty {
  padding: 2rem 1rem;
  text-align: center;
  font-size: 0.875rem;
  color: rgb(100 116 139);
}

.dark .select-option {
  color: rgb(203 213 225);
}

.dark .select-option:hover,
.dark .select-option-focused {
  background: rgb(30 41 59);
}

.dark .select-option-selected {
  background: rgb(20 184 166 / 0.16);
  color: rgb(94 234 212);
}

.dark .select-option-group {
  background: rgb(15 23 42);
  color: rgb(148 163 184);
}

.select-dropdown-enter-active,
.select-dropdown-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.select-dropdown-enter-from,
.select-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
