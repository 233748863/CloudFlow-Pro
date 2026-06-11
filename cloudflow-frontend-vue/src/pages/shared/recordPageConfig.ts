import type { Component } from 'vue'
import type { SelectOption } from '@/components/common'
import type { ApiRecord } from '@/services/api/page'

export type RecordFieldType = 'text' | 'number' | 'date' | 'datetime-local' | 'select' | 'textarea'
export type RecordTone = 'primary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning'
export type BadgeTone = 'slate' | 'green' | 'red' | 'yellow' | 'cyan'

export interface RecordFieldConfig {
  key: string
  label: string
  type?: RecordFieldType
  required?: boolean
  placeholder?: string
  options?: SelectOption[]
  defaultValue?: string | number | boolean | null
  table?: boolean
  filter?: boolean
  hiddenInForm?: boolean
  readonly?: boolean
  status?: boolean
  widthClass?: string
  formatter?: (value: unknown, row: ApiRecord) => string
}

export interface RecordActionConfig {
  label: string
  tone?: RecordTone
  visible?: (row: ApiRecord) => boolean
  path: (row: ApiRecord) => string
  method?: 'post' | 'put' | 'delete'
  payload?: (row: ApiRecord) => ApiRecord | null
  confirm?: (row: ApiRecord) => string
  permission?: string
  disabled?: (row: ApiRecord) => boolean
}

export interface RecordPageConfig {
  path: string
  title: string
  eyebrow: string
  description: string
  icon: Component
  listPath: string
  createPath?: string
  updatePath?: string
  deletePath?: string
  idKey: string
  primaryKey: string
  searchPlaceholder: string
  fields: RecordFieldConfig[]
  readOnly?: boolean
  updateMode?: 'body' | 'path'
  deleteMode?: 'joined' | 'single'
  actions?: RecordActionConfig[]
}

export const text = (key: string, label: string, extra: Partial<RecordFieldConfig> = {}): RecordFieldConfig => ({
  key,
  label,
  type: 'text',
  table: true,
  ...extra
})

export const number = (key: string, label: string, extra: Partial<RecordFieldConfig> = {}): RecordFieldConfig => ({
  key,
  label,
  type: 'number',
  table: true,
  ...extra
})

export const date = (key: string, label: string, extra: Partial<RecordFieldConfig> = {}): RecordFieldConfig => ({
  key,
  label,
  type: 'date',
  table: true,
  ...extra
})

export const dateTime = (key: string, label: string, extra: Partial<RecordFieldConfig> = {}): RecordFieldConfig => ({
  key,
  label,
  type: 'datetime-local',
  table: true,
  ...extra
})

export const select = (
  key: string,
  label: string,
  options: SelectOption[],
  extra: Partial<RecordFieldConfig> = {}
): RecordFieldConfig => ({
  key,
  label,
  type: 'select',
  options,
  table: true,
  status: true,
  ...extra
})

export const optionLabel = (options: SelectOption[] | undefined, value: unknown) =>
  options?.find((item) => String(item.value) === String(value))?.label || String(value ?? '-')

export const statusTone = (value: unknown): BadgeTone => {
  const status = String(value ?? '').toUpperCase()
  if (['1', 'Y', 'TRUE', 'ACTIVE', 'OPEN', 'NORMAL', 'AVAILABLE', 'APPROVED', 'COMPLETED', 'PUBLISHED', 'WON', 'PAID', 'CONFIRMED', 'CLOSED', 'LOW'].includes(status)) return 'green'
  if (['0', 'DRAFT', 'PENDING', 'PROCESSING', 'RUNNING', 'SCHEDULED', 'IN_PROGRESS', 'SUBMITTED', 'MEDIUM', 'WARNING'].includes(status)) return 'yellow'
  if (['DISABLED', 'INACTIVE', 'REJECTED', 'CANCELLED', 'FAILED', 'EXPIRED', 'LOST', 'CRITICAL', 'HIGH', 'BLOCK'].includes(status)) return 'red'
  if (['CUSTOM', 'MONTHLY', 'WEEKLY', 'PLANNED', 'QUEUE'].includes(status)) return 'cyan'
  return 'slate'
}

export const activeOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'ACTIVE', label: '启用' },
  { value: 'INACTIVE', label: '停用' }
]

export const enabledOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 1, label: '启用' },
  { value: 0, label: '停用' }
]

export const workflowOptions: SelectOption[] = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING', label: '待处理' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已拒绝' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' }
]
