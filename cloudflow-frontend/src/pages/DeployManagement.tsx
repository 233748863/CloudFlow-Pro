import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle,
  Clock,
  GitBranch,
  Settings,
  ShieldCheck,
} from 'lucide-react';
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

const PanelCard: React.FC<{
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, aside, children }) => (
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
      <div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
      {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
    </div>
    {children}
  </section>
);

const SummaryCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint: string;
}> = ({ icon, label, value, hint }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex items-center justify-between gap-3">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
        {icon}
      </div>
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
        {label}
      </div>
    </div>
    <div className="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>
  </div>
);

const TabButton: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
}> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
      active
        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
        : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100',
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
    <div className="flex flex-col gap-4">
      <PanelCard
        title="发布管理"
        description="把发布窗口、审批、回滚和统计统一收口到同一套轻量复杂页骨架，去掉旧的 Deploy Workspace 大壳层。"
      >
        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-600 shadow-sm dark:border-slate-800 dark:bg-slate-950/90 dark:text-cyan-200">
              <Settings className="h-3.5 w-3.5" />
              Deploy Workspace
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              当前模块：{activeTabMeta.label}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              风险控制：审批 + 回滚
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              交付视角：窗口 + 统计
            </span>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            <SummaryCard
              label="管理模块"
              value={4}
              hint="窗口、审批、回滚、统计四个核心能力"
              icon={<Settings className="h-[18px] w-[18px]" />}
            />
            <SummaryCard
              label="当前焦点"
              value={activeTabMeta.label}
              hint="当前工作区正在展示的管理模块"
              icon={<Clock className="h-[18px] w-[18px]" />}
            />
            <SummaryCard
              label="风险控制"
              value="审批 + 回滚"
              hint="发布前审批与发布后回滚统一在这里处理"
              icon={<ShieldCheck className="h-[18px] w-[18px]" />}
            />
            <SummaryCard
              label="交付视角"
              value="窗口 + 统计"
              hint="兼顾时段治理和发布结果追踪"
              icon={<BarChart3 className="h-[18px] w-[18px]" />}
            />
          </div>
        </div>
      </PanelCard>

      <PanelCard
        title={activeTabMeta.title}
        description={activeTabMeta.description}
        aside={
          <div className="flex flex-wrap gap-2">
            {tabOptions.map((item) => (
              <TabButton
                key={item.key}
                active={activeTab === item.key}
                label={item.label}
                onClick={() => setActiveTab(item.key)}
              />
            ))}
          </div>
        }
      >
        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {activeTabMeta.title}
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {activeTabMeta.description}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                发布治理主线
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-950">
                  <CheckCircle className="h-3.5 w-3.5" />
                  窗口控制
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-950">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  审批治理
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-950">
                  <GitBranch className="h-3.5 w-3.5" />
                  回滚兜底
                </span>
              </div>
            </div>
          </div>

          <div>{renderActivePanel()}</div>
        </div>
      </PanelCard>
    </div>
  );
};

export default DeployManagement;
