import React, { useState } from 'react';
import { Building2, GitBranch, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  WorkspaceBackdrop,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace';
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
  const hasActiveFilters = Boolean(stats.deptSearch.trim() || stats.userSearch.trim() || stats.selectedDeptName);

  const heroMetrics = [
    {
      label: '部门总数',
      value: `${stats.totalDepartments}`,
      hint: `筛选后 ${stats.filteredDepartments} 个`,
      icon: <Building2 size={17} />,
    },
    {
      label: '当前部门',
      value: currentDeptLabel,
      hint: stats.selectedDeptName ? '右侧成员列表跟随当前部门联动' : '当前为全部用户视图',
      icon: <GitBranch size={17} />,
      valueClassName: 'text-base sm:text-lg',
    },
    {
      label: '当前用户范围',
      value: `${stats.scopedUsers}`,
      hint: `筛选后 ${stats.filteredUsers} 人`,
      icon: <Users size={17} />,
    },
    {
      label: '启用成员',
      value: `${stats.activeUsers}`,
      hint: `启用部门 ${stats.activeDepartments} 个`,
      icon: <ShieldCheck size={17} />,
    },
  ];

  const overviewItems = [
    { label: '当前部门', value: currentDeptLabel },
    { label: '部门搜索', value: stats.deptSearch || '未启用' },
    { label: '成员搜索', value: stats.userSearch || '未启用' },
    { label: '当前结果', value: `${stats.filteredUsers} 人 / ${stats.filteredDepartments} 部门` },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                <Building2 size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          }
          title="组织结构"
          description="统一浏览部门树、成员归属和组织调整动作，让组织管理页回到和 System 其他复杂工作台一致的层级与密度。"
          actions={
            <Button variant="outline" size="lg" onClick={handleRefresh}>
              <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
              刷新组织
            </Button>
          }
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              System 组织工作台
            </span>
            <span className={surfaceChipClassName}>当前部门：{currentDeptLabel}</span>
            <span className={surfaceChipClassName}>部门筛选：{stats.deptSearch || '未启用'}</span>
            <span className={surfaceChipClassName}>成员筛选：{stats.userSearch || '未启用'}</span>
          </div>
        </WorkspaceHeroMetricsSection>

        <WorkspaceWorkbenchCard
          eyebrow="组织筛选"
          title="组织工作台"
          total={stats.totalDepartments}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          headerBadges={
            <div className="flex flex-wrap gap-2">
              <span className={surfaceChipClassName}>部门 {stats.totalDepartments} 个</span>
              <span className={surfaceChipClassName}>启用部门 {stats.activeDepartments} 个</span>
              <span className={surfaceChipClassName}>当前用户范围 {stats.scopedUsers} 人</span>
            </div>
          }
          quickFilterAside={
            <div className="flex flex-wrap items-center gap-2">
              {hasActiveFilters ? (
                <span className={surfaceChipClassName}>当前工作区存在筛选或部门联动</span>
              ) : (
                <span className={surfaceChipClassName}>当前为默认组织视图</span>
              )}
            </div>
          }
        />

        <WorkspaceResultCard
          total={stats.filteredUsers}
          title="组织结构工作区"
          description="下方统一展示部门树、成员表格和组织调整弹层，避免组织页继续保留旧后台私有视觉语法。"
        >
          <div className="p-4">
            <OrgStructure refreshSignal={refreshSignal} onStatsChange={setStats} />
          </div>
        </WorkspaceResultCard>
      </WorkspacePageContent>
    </div>
  );
};
