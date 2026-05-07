import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Siren,
  Zap,
} from 'lucide-react';
import type { HotUpdateRecord } from '@/services/api/workflow';
import { formatDateTimeDisplay } from '@/utils/dateFormat';

export type MigrationMode = 'COMPATIBLE' | 'FORCE' | 'RESTART';
export type HotUpdateStatus = 'MIGRATED' | 'SKIPPED' | 'FAILED' | 'RESTARTED';

export const HOT_UPDATE_MODE_OPTIONS: Array<{
  value: MigrationMode;
  label: string;
  summary: string;
  description: string;
  badge: string;
  icon: React.ReactNode;
  accentClassName: string;
  cardClassName: string;
}> = [
  {
    value: 'COMPATIBLE',
    label: '兼容模式',
    summary: '优先稳定迁移',
    description: '仅迁移当前节点在新版本仍可映射的实例，无法映射的实例保留旧版本继续运行。',
    badge: '推荐默认',
    icon: <ShieldCheck size={18} />,
    accentClassName: 'text-emerald-600 dark:text-emerald-300',
    cardClassName:
      'border-emerald-200/80 bg-emerald-50/80 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100',
  },
  {
    value: 'FORCE',
    label: '强制模式',
    summary: '优先版本统一',
    description: '尽可能把运行中实例切到新版本，无法兼容的实例会被终止并记录失败原因。',
    badge: '需确认',
    icon: <Zap size={18} />,
    accentClassName: 'text-amber-600 dark:text-amber-300',
    cardClassName:
      'border-amber-200/80 bg-amber-50/80 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100',
  },
  {
    value: 'RESTART',
    label: '重启模式',
    summary: '优先清空旧实例',
    description: '终止当前所有运行中实例，让后续新发起的流程直接进入新版本定义。',
    badge: '高影响',
    icon: <Siren size={18} />,
    accentClassName: 'text-rose-600 dark:text-rose-300',
    cardClassName:
      'border-rose-200/80 bg-rose-50/80 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100',
  },
];

export const hotUpdateModeMap = Object.fromEntries(
  HOT_UPDATE_MODE_OPTIONS.map((item) => [item.value, item]),
) as Record<MigrationMode, (typeof HOT_UPDATE_MODE_OPTIONS)[number]>;

export const getHotUpdateStatusMeta = (status: HotUpdateStatus) => {
  switch (status) {
    case 'MIGRATED':
      return {
        label: '已迁移',
        icon: <CheckCircle2 size={14} />,
        className:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
      };
    case 'SKIPPED':
      return {
        label: '已跳过',
        icon: <Clock3 size={14} />,
        className:
          'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      };
    case 'FAILED':
      return {
        label: '失败',
        icon: <AlertTriangle size={14} />,
        className:
          'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300',
      };
    case 'RESTARTED':
      return {
        label: '已重启',
        icon: <RefreshCw size={14} />,
        className:
          'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
      };
    default:
      return {
        label: status,
        icon: <Clock3 size={14} />,
        className:
          'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      };
  }
};

export const getHotUpdateRecordSummary = (record: HotUpdateRecord) => {
  const modeMeta = hotUpdateModeMap[(record.migrationMode as MigrationMode) || 'COMPATIBLE'];
  return {
    title: `V${record.fromVersion} -> V${record.toVersion}`,
    modeLabel: modeMeta?.label || record.migrationMode,
    executedAt: formatDateTimeDisplay(record.executedAt),
  };
};
