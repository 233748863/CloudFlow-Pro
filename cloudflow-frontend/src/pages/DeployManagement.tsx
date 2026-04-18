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
import { WorkspaceBackdrop, WorkspacePageContent } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';

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
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={
            <span className="inline-flex items-center gap-2 rounded-full bg-white/82 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500 ring-1 ring-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <Settings className="h-3.5 w-3.5" />
              Deploy Workspace
            </span>
          }
          title="发布管理"
          description="把发布窗口、审批、回滚和统计统一收口到同一套工作台视图，入口层和业务申请页保持一致。"
        >
          <div className="mt-6 grid gap-4 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="管理模块"
              value={4}
              hint="窗口、审批、回滚、统计四个核心能力"
              aside={<Settings className="h-[18px] w-[18px] text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="当前焦点"
              value={activeTabMeta.label}
              hint="当前工作台正在展示的管理模块"
              aside={<Clock className="h-[18px] w-[18px] text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="风险控制"
              value="审批 + 回滚"
              hint="发布前审批与发布后回滚统一在这里处理"
              aside={<ShieldCheck className="h-[18px] w-[18px] text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="交付视角"
              value="窗口 + 统计"
              hint="兼顾时段治理和发布结果追踪"
              aside={<BarChart3 className="h-[18px] w-[18px] text-emerald-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          eyebrow="发布工作台"
          title="发布流程与风险控制"
          total={tabOptions.length}
          hasActiveFilters={activeTab !== 'windows'}
          overviewItems={[
            { label: '默认模块', value: '发布窗口' },
            { label: '审批联动', value: '发布审批' },
            { label: '恢复手段', value: '版本回滚' },
            { label: '健康监控', value: '发布统计' },
          ]}
          quickFilters={tabOptions.map((item) => ({
            label: item.label,
            value: item.key,
          }))}
          activeQuickFilter={activeTab}
          onQuickFilterChange={(value) => setActiveTab(value as DeployTabKey)}
          filterBar={
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="text-sm font-medium text-slate-600">{activeTabMeta.title}</div>
              <div className="text-xs text-slate-400">{activeTabMeta.description}</div>
            </div>
          }
        />

        <WorkspaceResultCard
          total={tabOptions.length}
          title={activeTabMeta.title}
          description={activeTabMeta.description}
        >
          <div className="p-4 sm:p-5">{renderActivePanel()}</div>
        </WorkspaceResultCard>
      </WorkspacePageContent>
    </div>
  );
};

export default DeployManagement;
