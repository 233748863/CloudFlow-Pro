import React from 'react';
import { Building2, GitBranch, Shield, Users } from 'lucide-react';
import { OrgStructure } from '../components/OrgStructure';
import { WorkspaceBackdrop } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace/WorkspacePanels';

export const OrgStructurePage = () => {
  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-3">
        <WorkspaceHeroCard
          badge={
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-600 border border-slate-200 shadow-sm">
              <Building2 className="h-3.5 w-3.5" />
              Org Workspace
            </span>
          }
          title="组织架构"
          description="统一浏览部门树、人员归属和组织层级，让组织管理入口也接入同一套工作台视觉语言。"
        >
          <div className="mt-6 grid gap-4 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="组织视图"
              value="部门 + 用户"
              hint="同时覆盖部门树和成员列表"
              aside={<Users className="h-[18px] w-[18px] text-cyan-600" />}
            />
            <WorkspaceMetricCard
              label="结构管理"
              value="增删改"
              hint="部门支持新增、编辑、删除和层级调整"
              aside={<GitBranch className="h-[18px] w-[18px] text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="人员操作"
              value="查看 + 调整"
              hint="支持查看详情和调整成员所属部门"
              aside={<Shield className="h-[18px] w-[18px] text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="页面状态"
              value="工作台入口"
              hint="组织管理页已接入统一页面壳层"
              aside={<Building2 className="h-[18px] w-[18px] text-emerald-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceSectionCard
          title="组织管理区"
          description="保持原有组织架构编辑和用户管理逻辑，只统一页面入口和内容容器风格。"
          eyebrow="Organization"
        >
          <OrgStructure />
        </WorkspaceSectionCard>
      </div>
    </div>
  );
};
