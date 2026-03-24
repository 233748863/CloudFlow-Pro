import {
  LayoutDashboard, GitMerge, FileText, Settings, LogOut, Bell, CheckCircle2,
  Users, PlayCircle, ShieldCheck, ChevronRight, ChevronDown, FormInput, Code, Megaphone,
  Calendar, Monitor, Rocket, Briefcase, Building2, Wrench, FolderOpen, Car,
  ClipboardCheck, Package, FileArchive, MailOpen, ScrollText, ClipboardList,
  ClipboardEdit, Clock, Plane, BookUser, UserCheck, CalendarClock, LogIn,
  Landmark, SlidersHorizontal, DatabaseZap, BookOpen, FolderTree, Layers3, Send
} from 'lucide-react';

// 图标名称到组件的映射
export const iconMap: Record<string, React.ElementType> = {
  'LayoutDashboard': LayoutDashboard,
  'GitMerge': GitMerge,
  'FileText': FileText,
  'Settings': Settings,
  'LogOut': LogOut,
  'Bell': Bell,
  'CheckCircle2': CheckCircle2,
  'Users': Users,
  'PlayCircle': PlayCircle,
  'ShieldCheck': ShieldCheck,
  'ChevronRight': ChevronRight,
  'ChevronDown': ChevronDown,
  'FormInput': FormInput,
  'Code': Code,
  'Megaphone': Megaphone,
  'Calendar': Calendar,
  'Monitor': Monitor,
  'Rocket': Rocket,
  'Briefcase': Briefcase,
  'Building2': Building2,
  'Wrench': Wrench,
  'FolderOpen': FolderOpen,
  'Car': Car,
  'ClipboardCheck': ClipboardCheck,
  'Package': Package,
  'FileArchive': FileArchive,
  'MailOpen': MailOpen,
  'ScrollText': ScrollText,
  'ClipboardList': ClipboardList,
  // OA扩展模块图标
  'ClipboardEdit': ClipboardEdit,
  'Clock': Clock,
  'Plane': Plane,
  'BookUser': BookUser,
  'UserCheck': UserCheck,
  'CalendarClock': CalendarClock,
  'LogIn': LogIn,
  // 系统管理扩展图标
  'Landmark': Landmark,
  'SlidersHorizontal': SlidersHorizontal,
  'DatabaseZap': DatabaseZap,
  'BookOpen': BookOpen,
  'FolderTree': FolderTree,
  'Layers3': Layers3,
  'Send': Send,
};

// 获取图标组件，如果找不到则返回默认图标
export const getIcon = (iconName: string): React.ElementType => {
  return iconMap[iconName] || LayoutDashboard;
};
