/**
 * UI 组件统一导出文件
 * 
 * 使用方式：
 * import { Button, Label, Input } from '@/components/ui'
 * 
 * 这个文件提供了所有 UI 组件的统一导出入口，
 * 可以减少 import 语句的数量，提高代码可读性。
 */

// ============================================
// 基础组件
// ============================================

/**
 * Button - 按钮组件
 * 支持多种变体：default, outline, ghost, link, secondary, destructive
 * 支持多种尺寸：default, sm, lg, icon
 */
export { Button } from './button'
export type { ButtonProps } from './button'

/**
 * Label - 标签组件
 * 用于表单字段的标签显示
 */
export { Label } from './label'

/**
 * Input - 输入框组件
 * 标准的文本输入组件
 */
export { Input } from './input'

/**
 * Textarea - 多行文本输入组件
 * 用于多行文本输入
 */
export { Textarea } from './textarea'
export type { TextareaProps } from './textarea'

/**
 * Switch - 开关组件
 * 用于布尔值的切换
 */
export { Switch } from './switch'
export type { SwitchProps } from './switch'

// ============================================
// 容器组件
// ============================================

/**
 * Card - 卡片组件
 * 包含：Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
 */
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card'

/**
 * Dialog - 对话框组件
 * 包含：Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
 */
export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog'

// ============================================
// 表单组件
// ============================================

/**
 * Select - 下拉选择组件
 * 包含：Select, SelectTrigger, SelectValue, SelectContent, SelectItem
 */
export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './select'

/**
 * Tabs - 标签页组件
 * 包含：Tabs, TabsList, TabsTrigger, TabsContent
 */
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'

// ============================================
// 数据展示组件
// ============================================

/**
 * Table - 表格组件
 * 包含：Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption
 */
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableActionHead, TableRow, TableCell, TableCaption } from './table'

// ============================================
// 扩展组件
// ============================================

export * from './ConfirmDialog'
export * from './ConflictResolutionDialog'
export * from './date-picker'
export * from './EmptyState'
export * from './ErrorBoundary'
export * from './PermissionGuard'
export * from './RoleSelector'
export * from './RouteGuard'
export * from './Skeleton'
export * from './UserSelector'
export * from './VirtualList'
export * from './WarningConfirmDialog'
