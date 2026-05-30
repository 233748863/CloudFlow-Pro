import React, { useState } from 'react';
import { OrgStructure, type OrgStructureStats } from '../components/OrgStructure';

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

  const currentDeptLabel = stats.selectedDeptName || '全部用户';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{currentDeptLabel}</span>
        <span>部门 {stats.deptSearch ? stats.filteredDepartments : stats.totalDepartments}</span>
        <span>成员 {stats.userSearch ? stats.filteredUsers : stats.scopedUsers}</span>
      </div>

      <OrgStructure refreshSignal={refreshSignal} onStatsChange={setStats} />
    </div>
  );
};
