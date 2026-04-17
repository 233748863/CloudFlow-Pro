import React from 'react';
import { Filter, FolderOpen, FormInput, GitMerge } from 'lucide-react';
import { StatCard } from '@/components/common';

interface WorkflowCatalogStatsProps {
  workflowCount: number;
  filteredCount: number;
  boundFormCount: number;
  categoryCount: number;
  hasActiveFilters: boolean;
}

export const WorkflowCatalogStats: React.FC<WorkflowCatalogStatsProps> = ({
  workflowCount,
  filteredCount,
  boundFormCount,
  categoryCount,
  hasActiveFilters,
}) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard
      title="已发布流程"
      value={workflowCount.toLocaleString()}
      icon={<GitMerge size={20} />}
      iconVariant="primary"
      meta="按流程 key 保留最新版本"
    />
    <StatCard
      title="当前筛选"
      value={filteredCount.toLocaleString()}
      icon={<Filter size={20} />}
      iconVariant="warning"
      meta={hasActiveFilters ? '已应用搜索、分类或标签' : '当前展示全部流程'}
    />
    <StatCard
      title="已绑表单"
      value={boundFormCount.toLocaleString()}
      icon={<FormInput size={20} />}
      iconVariant="success"
      meta="支持直接拉起表单"
    />
    <StatCard
      title="流程分类"
      value={categoryCount.toLocaleString()}
      icon={<FolderOpen size={20} />}
      iconVariant="gray"
      meta="用于入口归类"
    />
  </div>
);
