import React from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { AnnouncementType } from '@/types';
import { SearchInput } from '@/components/common/SearchInput';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';

interface AnnouncementManageFilterBarProps {
  searchTitle: string;
  filterType: string;
  filterStatus: string;
  onSearchTitleChange: (value: string) => void;
  onFilterTypeChange: (value: string) => void;
  onFilterStatusChange: (value: string) => void;
  onSearch: (value: string) => void;
  onReset: () => void;
  onRefresh?: () => void;
  onCreate?: () => void;
  loading?: boolean;
}

// 管理区筛选栏按源码的“左侧筛选 + 右侧动作”职责组织，再兼容本项目额外的类型筛选。
export const AnnouncementManageFilterBar: React.FC<AnnouncementManageFilterBarProps> = ({
  searchTitle,
  filterType,
  filterStatus,
  onSearchTitleChange,
  onFilterTypeChange,
  onFilterStatusChange,
  onSearch,
  onReset,
  onRefresh,
  onCreate,
  loading = false,
}) => (
  <div className="flex flex-wrap items-center gap-3">
    <div className="w-full sm:max-w-64">
      <SearchInput
        value={searchTitle}
        placeholder="搜索公告..."
        onChange={onSearchTitleChange}
        onSearch={onSearch}
      />
    </div>

    <div className="w-full sm:w-40">
      <Select value={filterType || 'ALL'} onValueChange={(value) => onFilterTypeChange(value === 'ALL' ? '' : value)}>
        <SelectTrigger className="h-10 rounded-xl">
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">所有类型</SelectItem>
          <SelectItem value={String(AnnouncementType.NOTIFICATION)}>通知</SelectItem>
          <SelectItem value={String(AnnouncementType.ANNOUNCEMENT)}>公告</SelectItem>
          <SelectItem value={String(AnnouncementType.URGENT)}>紧急</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div className="w-full sm:w-40">
      <Select value={filterStatus || 'ALL'} onValueChange={(value) => onFilterStatusChange(value === 'ALL' ? '' : value)}>
        <SelectTrigger className="h-10 rounded-xl">
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">所有状态</SelectItem>
          <SelectItem value="0">草稿</SelectItem>
          <SelectItem value="1">已发布</SelectItem>
          <SelectItem value="2">已撤销</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
      {onRefresh ? (
        <Button variant="outline" onClick={onRefresh} disabled={loading} title="刷新">
          <RotateCcw size={16} className={loading ? 'animate-spin' : ''} />
        </Button>
      ) : null}
      <Button variant="outline" onClick={onReset}>
        重置
      </Button>
      {onCreate ? (
        <Button onClick={onCreate}>
          <Plus size={16} className="mr-2" />
          发布公告
        </Button>
      ) : null}
    </div>
  </div>
);
