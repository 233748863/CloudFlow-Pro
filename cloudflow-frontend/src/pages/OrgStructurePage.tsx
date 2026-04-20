import React, { useState } from 'react';
import { Building2, GitBranch, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui';
import { OrgStructure, type OrgStructureStats } from '../components/OrgStructure';
import { cn } from '@/utils/cn';

const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';

const createInitialStats = (): OrgStructureStats => ({
  totalDepartments: 0,
  filteredDepartments: 0,
  activeDepartments: 0,
  scopedUsers: 0,
  filteredUsers: 0,
  activeUsers: 0,
  selectedDeptName: null,
  deptSearch: '',
  userSearch: '',
});

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const SummaryCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
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
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
      {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
    </div>
    {children}
  </section>
);

export const OrgStructurePage = () => {
  const [stats, setStats] = useState<OrgStructureStats>(createInitialStats);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setRefreshSignal((prev) => prev + 1);
    window.setTimeout(() => setRefreshing(false), 450);
  };

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const currentDeptLabel = stats.selectedDeptName || '全部用户';

  return (
    <div className="flex flex-col gap-4">
      <PanelCard
        title="组织结构"
        description="把组织树、成员归属和组织调整动作收回到更接近源码后台的轻量复杂页语法，去掉额外 Hero / Workbench 壳层。"
        aside={
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
            刷新组织
          </Button>
        }
      >
        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              <Building2 size={14} />
              {todayLabel}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              {timeLabel}
            </span>
            <span className={surfaceChipClassName}>当前部门：{currentDeptLabel}</span>
            <span className={surfaceChipClassName}>部门筛选：{stats.deptSearch || '未启用'}</span>
            <span className={surfaceChipClassName}>成员筛选：{stats.userSearch || '未启用'}</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            <SummaryCard
              icon={<Building2 size={18} />}
              label="部门总数"
              value={`${stats.totalDepartments}`}
              hint={`筛选后 ${stats.filteredDepartments} 个`}
            />
            <SummaryCard
              icon={<GitBranch size={18} />}
              label="当前部门"
              value={currentDeptLabel}
              hint={stats.selectedDeptName ? '成员列表跟随部门联动' : '当前为全部用户视图'}
            />
            <SummaryCard
              icon={<Users size={18} />}
              label="当前用户范围"
              value={`${stats.scopedUsers}`}
              hint={`筛选后 ${stats.filteredUsers} 人`}
            />
            <SummaryCard
              icon={<ShieldCheck size={18} />}
              label="启用成员"
              value={`${stats.activeUsers}`}
              hint={`启用部门 ${stats.activeDepartments} 个`}
            />
          </div>
        </div>
      </PanelCard>

      <PanelCard
        title="组织工作区"
        description="下方直接承载部门树、成员列表和组织调整弹层，不再额外包一层私有工作台卡。"
      >
        <div className="p-4">
          <OrgStructure refreshSignal={refreshSignal} onStatsChange={setStats} />
        </div>
      </PanelCard>
    </div>
  );
};
