import React, { useState } from 'react';
import { Building2, CheckCircle2, RefreshCw, Search, Users } from 'lucide-react';
import { Button } from '@/components/common';
import { OrgStructure, type OrgStructureStats } from '../components/OrgStructure';
import { TablePageLayout } from '@/components/layout/TablePageLayout';

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

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">ORGANIZATION STRUCTURE</p>
          <h2>组织架构</h2>
          <span>按部门查看组织层级、成员范围和当前筛选结果</span>
        </div>
        <div className="admin-source-controls">
          <Button type="button" variant="outline" size="sm" onClick={() => setRefreshSignal((value) => value + 1)}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <span className="admin-source-stat-icon"><Building2 size={20} /></span>
          <div className="min-w-0">
            <p>部门</p>
            <strong>{stats.deptSearch ? stats.filteredDepartments : stats.totalDepartments}</strong>
            <span>{stats.deptSearch ? '当前筛选结果' : '全部部门'}</span>
          </div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <span className="admin-source-stat-icon"><CheckCircle2 size={20} /></span>
          <div className="min-w-0">
            <p>启用部门</p>
            <strong>{stats.activeDepartments}</strong>
            <span>组织状态正常</span>
          </div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <span className="admin-source-stat-icon"><Users size={20} /></span>
          <div className="min-w-0">
            <p>成员</p>
            <strong>{stats.userSearch ? stats.filteredUsers : stats.scopedUsers}</strong>
            <span>{currentDeptLabel}</span>
          </div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <span className="admin-source-stat-icon"><Search size={20} /></span>
          <div className="min-w-0">
            <p>启用成员</p>
            <strong>{stats.activeUsers}</strong>
            <span>{stats.userSearch || stats.deptSearch ? '筛选中' : '当前范围'}</span>
          </div>
        </article>
      </section>
    </div>
  );

  const pageFilters = (
      <section className="card admin-users-toolbar">
        <div className="admin-users-toolbar-actions justify-start">
          <span className="admin-users-filter-count">{currentDeptLabel}</span>
          <span className="text-xs text-cf-subtle">部门 {stats.deptSearch ? stats.filteredDepartments : stats.totalDepartments}</span>
          <span className="text-xs text-cf-subtle">成员 {stats.userSearch ? stats.filteredUsers : stats.scopedUsers}</span>
        </div>
      </section>
  );

  const pageContent = (
      <OrgStructure refreshSignal={refreshSignal} onStatsChange={setStats} />
  );

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
      />
    </section>
  );
};
