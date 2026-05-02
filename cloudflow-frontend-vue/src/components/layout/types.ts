import type { Component } from 'vue'

export interface SidebarItem {
  id: string
  label: string
  icon?: string | Component
  path?: string
  children?: SidebarItem[]
  groupLabel?: string
}
