import React, { useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
import { DeployWindowManagement } from '@/components/deploy/DeployWindowManagement';
import { DeployApprovalManagement } from '@/components/deploy/DeployApprovalManagement';
import { VersionRollbackManagement } from '@/components/deploy/VersionRollbackManagement';
import { DeployStatistics } from '@/components/deploy/DeployStatistics';
import { cn } from '@/utils/cn';

type DeployTabKey = 'windows' | 'approvals' | 'rollback' | 'statistics';

const tabOptions: Array<{
  key: DeployTabKey;
  label: string;
  title: string;
  description: string;
}> = [
  {
    key: 'windows',
    label: '发布窗口',
    title: '发布窗口管理',
    description: '管理可发布时段、启停状态以及不同频率的窗口规则。',
  },
  {
    key: 'approvals',
    label: '发布审批',
    title: '发布审批管理',
    description: '查看待审批、已提交记录，并统一处理发布审批流。',
  },
  {
    key: 'rollback',
    label: '版本回滚',
    title: '版本回滚管理',
    description: '按流程查看可回滚版本、影响分析和回滚执行记录。',
  },
  {
    key: 'statistics',
    label: '发布统计',
    title: '发布统计',
    description: '汇总发布次数、成功率、回滚率和当前版本健康度。',
  },
];

const TabSwitchButton: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
}> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      active
        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100',
    )}
  >
    {label}
  </button>
);

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
      case 'statistics':
        return <DeployStatistics />;
      case 'windows':
      default:
        return <DeployWindowManagement />;
    }
  };

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Settings className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Deploy Management
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {activeTabMeta.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          {activeTabMeta.description}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
          {tabOptions.map((item) => (
            <TabSwitchButton
              key={item.key}
              active={activeTab === item.key}
              label={item.label}
              onClick={() => setActiveTab(item.key)}
            />
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">
            当前模块 · {activeTabMeta.label}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">
            审批 + 回滚闭环
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">
            时段 + 统计治理
          </span>
        </div>
      </div>

      <div>{renderActivePanel()}</div>
    </div>
  );
};

export default DeployManagement;
