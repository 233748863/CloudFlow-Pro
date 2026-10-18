import React, { useState } from 'react';
import { Building2, CheckCircle2, RefreshCw } from 'lucide-react';
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

  const currentDeptLabel = stats.selectedDeptName || '全组织';
  const deptCount = stats.deptSearch ? stats.filteredDepartments : stats.totalDepartments;
  const memberCount = stats.userSearch ? stats.filteredUsers : stats.scopedUsers;
  const inactiveDepartments = Math.max(stats.totalDepartments - stats.activeDepartments, 0);
  const inactiveMembers = Math.max(memberCount - stats.activeUsers, 0);

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

      {/* 原来是四张统计卡，撑掉近 200px 首屏，而四个数字（部门/启用部门/成员/启用成员）
          在演示数据下全是 50，信息量极低；下面还有一条 filter 条重复同样的数字。
          压成一条信息带，省下的高度还给部门树 —— 深层级组织最缺的就是垂直空间。
          停用数只在真的有停用时才出现，避免又是一个恒为 0 的噪音数字。 */}
      <section className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-cf-title">
          <Building2 size={14} className="text-[#0d95b5]" />
          {currentDeptLabel}
        </span>
        <span className="text-cf-subtle">
          部门 <strong className="font-semibold tabular-nums text-cf-body">{deptCount}</strong>
          {stats.deptSearch ? <span className="ml-1 text-cf-faint">（筛选中）</span> : null}
        </span>
        <span className="text-cf-subtle">
          成员 <strong className="font-semibold tabular-nums text-cf-body">{memberCount}</strong>
          {stats.userSearch ? <span className="ml-1 text-cf-faint">（筛选中）</span> : null}
        </span>
        {inactiveDepartments > 0 ? (
          <span className="text-cf-subtle">停用部门 <strong className="font-semibold tabular-nums text-amber-600">{inactiveDepartments}</strong></span>
        ) : (
          <span className="inline-flex items-center gap-1 text-cf-subtle">
            <CheckCircle2 size={13} className="text-emerald-500" />
            组织状态正常
          </span>
        )}
        {inactiveMembers > 0 ? (
          <span className="text-cf-subtle">停用成员 <strong className="font-semibold tabular-nums text-amber-600">{inactiveMembers}</strong></span>
        ) : null}
      </section>
    </div>
  );

  const pageContent = (
      <OrgStructure refreshSignal={refreshSignal} onStatsChange={setStats} />
  );

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={pageActions}
        table={pageContent}
      />
    </section>
  );
};
