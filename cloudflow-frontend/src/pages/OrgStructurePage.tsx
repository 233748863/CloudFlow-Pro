import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/common';
import { OrgStructure, type OrgStructureStats } from '../components/OrgStructure';
import { cn } from '@/utils/cn';

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

export const OrgStructurePage = () => {
  const [stats, setStats] = useState<OrgStructureStats>(createInitialStats);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setRefreshSignal((prev) => prev + 1);
    window.setTimeout(() => setRefreshing(false), 450);
  };

  const currentDeptLabel = stats.selectedDeptName || '全部用户';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{currentDeptLabel}</span>
          <span>部门 {stats.deptSearch ? stats.filteredDepartments : stats.totalDepartments}</span>
          <span>成员 {stats.userSearch ? stats.filteredUsers : stats.scopedUsers}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
            刷新组织
          </Button>
        </div>
      </div>

      <OrgStructure refreshSignal={refreshSignal} onStatsChange={setStats} />
    </div>
  );
};
