import React, { useMemo, useState } from 'react';
import {
  Activity,
  CalendarRange,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { DeployWindowManagement } from '@/components/deploy/DeployWindowManagement';
import { DeployApprovalManagement } from '@/components/deploy/DeployApprovalManagement';
import { VersionRollbackManagement } from '@/components/deploy/VersionRollbackManagement';
import { DeployStatistics } from '@/components/deploy/DeployStatistics';
import { HotUpdatePanel } from '@/components/deploy/HotUpdatePanel';
import { SegmentedControl, SegmentedControlItem } from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';

type DeployTabKey = 'windows' | 'approvals' | 'rollback' | 'hotupdate' | 'statistics';

const tabOptions: Array<{
  key: DeployTabKey;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'windows',
    label: '发布窗口',
    description: '控制发布时段与冻结窗口',
    icon: <CalendarRange size={15} />,
  },
  {
    key: 'approvals',
    label: '发布审批',
    description: '集中处理上线审批链路',
    icon: <ShieldCheck size={15} />,
  },
  {
    key: 'rollback',
    label: '版本回滚',
    description: '异常发布后快速恢复',
    icon: <RotateCcw size={15} />,
  },
  {
    key: 'hotupdate',
    label: '热更新',
    description: '运行中实例迁移到最新版本',
    icon: <RefreshCw size={15} />,
  },
  {
    key: 'statistics',
    label: '发布统计',
    description: '发布行为汇总与复盘',
    icon: <Activity size={15} />,
  },
];

export const DeployManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DeployTabKey>('windows');

  const activeTabMeta = useMemo(
    () => tabOptions.find((item) => item.key === activeTab) || tabOptions[0],
    [activeTab],
  );

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'approvals':
        return <DeployApprovalManagement />;
      case 'rollback':
        return <VersionRollbackManagement />;
      case 'hotupdate':
        return <HotUpdatePanel />;
      case 'statistics':
        return <DeployStatistics />;
      case 'windows':
      default:
        return <DeployWindowManagement />;
    }
  };

  return (
    <div className="space-y-4">
      <TableSurfaceCard>
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-100">
              {activeTabMeta.label}
            </div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {activeTabMeta.description}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-1 dark:border-slate-700 dark:bg-slate-900/70">
            <SegmentedControl className="min-h-9 flex-wrap !bg-transparent !p-0">
              {tabOptions.map((item) => (
                <SegmentedControlItem
                  key={item.key}
                  size="sm"
                  active={activeTab === item.key}
                  onClick={() => setActiveTab(item.key)}
                  className="gap-1.5"
                >
                  {item.icon}
                  {item.label}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>
        </div>
      </TableSurfaceCard>

      {renderActivePanel()}
    </div>
  );
};

export default DeployManagement;
