import {
  LayoutDashboard, GitMerge, FileText, Settings, LogOut, Bell, CheckCircle2,
  Users, PlayCircle, ShieldCheck, ChevronRight, ChevronDown, FormInput, Code, Megaphone,
  Calendar, Monitor, Rocket, Briefcase, Building2, Wrench, FolderOpen, Car,
  ClipboardCheck, Package, FileArchive
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
};

// 获取图标组件，如果找不到则返回默认图标
export const getIcon = (iconName: string): React.ElementType => {
  return iconMap[iconName] || LayoutDashboard;
};
