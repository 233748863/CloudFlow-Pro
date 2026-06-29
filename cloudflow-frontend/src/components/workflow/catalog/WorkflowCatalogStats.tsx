import React from 'react';
import { Filter, FolderOpen, FormInput, GitMerge } from 'lucide-react';

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
  <div className="admin-source-stat-grid">
    <article className="card admin-source-stat admin-source-tone-blue">
      <span className="admin-source-stat-icon"><GitMerge size={20} /></span>
      <div className="min-w-0">
        <p>已发布流程</p>
        <strong>{workflowCount.toLocaleString()}</strong>
        <span>按流程 key 保留最新可发起版本</span>
      </div>
    </article>
    <article className="card admin-source-stat admin-source-tone-amber">
      <span className="admin-source-stat-icon"><Filter size={20} /></span>
      <div className="min-w-0">
        <p>当前筛选</p>
        <strong>{filteredCount.toLocaleString()}</strong>
        <span>{hasActiveFilters ? '已应用搜索、分类或标签条件' : '当前显示全部可发起流程'}</span>
      </div>
    </article>
    <article className="card admin-source-stat admin-source-tone-green">
      <span className="admin-source-stat-icon"><FormInput size={20} /></span>
      <div className="min-w-0">
        <p>已绑表单</p>
        <strong>{boundFormCount.toLocaleString()}</strong>
        <span>支持直接拉起表单发起流程</span>
      </div>
    </article>
    <article className="card admin-source-stat admin-source-tone-violet">
      <span className="admin-source-stat-icon"><FolderOpen size={20} /></span>
      <div className="min-w-0">
        <p>流程分类</p>
        <strong>{categoryCount.toLocaleString()}</strong>
        <span>用于目录归类与快速定位</span>
      </div>
    </article>
  </div>
);
