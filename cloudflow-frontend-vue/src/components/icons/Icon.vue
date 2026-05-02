<script setup lang="ts">
import {
  AlertTriangle,
  Archive,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Car,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  CircleUserRound,
  ClipboardList,
  Code2,
  Contact,
  Database,
  FileText,
  FolderTree,
  Gauge,
  Home,
  Inbox,
  Info,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  MoonStar,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shield,
  Stamp,
  SunMedium,
  Trash2,
  Truck,
  User,
  UserCog,
  Users,
  WalletCards,
  Wifi,
  Workflow,
  X
} from 'lucide-vue-next'
import type { Component } from 'vue'

const props = withDefaults(defineProps<{
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number
  strokeWidth?: number
}>(), {
  size: 'md',
  strokeWidth: 2
})

const iconMap: Record<string, Component> = {
  alert: AlertTriangle,
  alertTriangle: AlertTriangle,
  archive: Archive,
  bell: Bell,
  book: BookOpen,
  bookOpen: BookOpen,
  briefcase: Briefcase,
  building: Building2,
  building2: Building2,
  calendar: Calendar,
  car: Car,
  check: Check,
  checkCircle: CheckCircle,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronsLeft: ChevronsLeft,
  chevronsRight: ChevronsRight,
  circleHelp: CircleHelp,
  circleUserRound: CircleUserRound,
  clipboard: ClipboardList,
  clipboardList: ClipboardList,
  code: Code2,
  code2: Code2,
  contact: Contact,
  database: Database,
  dashboard: LayoutDashboard,
  file: FileText,
  fileText: FileText,
  folder: FolderTree,
  folderTree: FolderTree,
  gauge: Gauge,
  home: Home,
  inbox: Inbox,
  info: Info,
  infoCircle: Info,
  key: KeyRound,
  keyRound: KeyRound,
  loader: Loader2,
  loader2: Loader2,
  logout: LogOut,
  logOut: LogOut,
  mail: Mail,
  mapPin: MapPin,
  message: MessageSquare,
  messageSquare: MessageSquare,
  moon: MoonStar,
  moonStar: MoonStar,
  package: Package,
  plus: Plus,
  refresh: RefreshCw,
  refreshCw: RefreshCw,
  save: Save,
  search: Search,
  settings: Settings,
  shield: Shield,
  stamp: Stamp,
  sun: SunMedium,
  sunMedium: SunMedium,
  trash: Trash2,
  trash2: Trash2,
  truck: Truck,
  user: User,
  userCog: UserCog,
  users: Users,
  wallet: WalletCards,
  walletCards: WalletCards,
  wifi: Wifi,
  workflow: Workflow,
  x: X
}

const sizeMap = {
  xs: 12,
  sm: 14,
  md: 18,
  lg: 22,
  xl: 32
}
</script>

<template>
  <component
    :is="iconMap[name] || LayoutDashboard"
    :size="typeof props.size === 'number' ? props.size : sizeMap[props.size]"
    :stroke-width="strokeWidth"
    aria-hidden="true"
  />
</template>
