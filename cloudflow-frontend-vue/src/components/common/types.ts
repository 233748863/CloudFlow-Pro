export interface Column<T = Record<string, unknown>> {
  key: string
  label: string
  sortable?: boolean
  class?: string
  formatter?: (value: unknown, row: T) => string
}

export interface SelectOption {
  value: string | number | boolean | null
  label: string
  disabled?: boolean
  [key: string]: unknown
}
