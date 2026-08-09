import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Search,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { AnnouncementScope } from '@/types';
import { getRoleOptions } from '@/services/api/auth';
import { Input } from '@/components/common';
import { InnerTableSurface } from '@/components/layout';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import { cn } from '@/utils/cn';

export interface DeptItem {
  deptId: number;
  parentId: number;
  deptName: string;
  orderNum: number;
  children?: DeptItem[];
}

interface AnnouncementTargetingEditorProps {
  scopeType: AnnouncementScope;
  scopeValue: string;
  deptTree: DeptItem[];
  onScopeTypeChange: (scopeType: AnnouncementScope) => void;
  onScopeValueChange: (scopeValue: string) => void;
}

const selectedTargetListClass = 'flex max-h-20 flex-wrap gap-1 overflow-y-auto pr-1';
const targetOptionListClass = 'max-h-32 overflow-y-auto p-2';

const flattenDepts = (
  depts: DeptItem[],
  level = 0,
): Array<{ dept: DeptItem; level: number }> => {
  const result: Array<{ dept: DeptItem; level: number }> = [];

  for (const dept of depts) {
    result.push({ dept, level });
    if (dept.children?.length) {
      result.push(...flattenDepts(dept.children, level + 1));
    }
  }

  return result;
};

const DeptTreePicker: React.FC<{
  value: string;
  onChange: (value: string) => void;
  deptTree: DeptItem[];
}> = ({ value, onChange, deptTree }) => {
  const [search, setSearch] = useState('');
  const [expandedDepts, setExpandedDepts] = useState<Set<number>>(new Set());

  const selectedIds = value ? value.split(',').filter(Boolean).map(Number) : [];
  const flat = useMemo(() => flattenDepts(deptTree), [deptTree]);
  const selectedDepts = flat
    .filter((item) => selectedIds.includes(item.dept.deptId))
    .map((item) => item.dept);

  const toggleDept = (id: number) => {
    const nextIds = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    onChange(nextIds.join(','));
  };

  const toggleExpand = (deptId: number) => {
    setExpandedDepts((previous) => {
      const next = new Set(previous);
      if (next.has(deptId)) {
        next.delete(deptId);
      } else {
        next.add(deptId);
      }
      return next;
    });
  };

  const nodeMatchesSearch = (node: DeptItem, keyword: string): boolean => {
    if (!keyword) {
      return true;
    }

    const normalized = keyword.toLowerCase();
    if (node.deptName.toLowerCase().includes(normalized)) {
      return true;
    }

    return Boolean(node.children?.some((child) => nodeMatchesSearch(child, keyword)));
  };

  const renderDeptNode = (node: DeptItem, depth = 0): React.ReactNode => {
    if (search && !nodeMatchesSearch(node, search)) {
      return null;
    }

    const isExpanded = expandedDepts.has(node.deptId) || Boolean(search);
    const hasChildren = Boolean(node.children?.length);
    const isSelected = selectedIds.includes(node.deptId);

    return (
      <div key={node.deptId}>
        <div
          className={cn(
            'group flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
            isSelected
              ? 'border border-cyan-200 bg-[var(--cf-surface-strong)] text-cyan-900 dark:border-cyan-900 dark:bg-slate-950 dark:text-cyan-100'
              : 'hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/70',
          )}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <button
            type="button"
            onClick={() => toggleExpand(node.deptId)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-cf-faint hover:bg-[var(--cf-surface-strong)] hover:text-cf-muted dark:hover:bg-slate-950"
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span className="w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => toggleDept(node.deptId)}
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
              isSelected
                ? 'border-cyan-500 bg-cyan-500 text-white'
                : 'border-slate-300 bg-[var(--cf-surface-strong)] hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-cyan-800',
            )}
          >
            {isSelected ? <Check size={11} strokeWidth={3} /> : null}
          </button>

          <Building2 size={14} className="shrink-0 text-cf-faint" />
          <span
            className="flex-1 truncate text-sm font-medium select-none"
            onClick={() => toggleExpand(node.deptId)}
          >
            {node.deptName}
          </span>
        </div>
        {isExpanded && node.children?.map((child) => renderDeptNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <InnerTableSurface className="admin-targeting-picker overflow-hidden" wrapperClassName="flex flex-col">
      {selectedDepts.length > 0 ? (
        <div className="border-b border-slate-200 bg-[var(--cf-surface-muted)] p-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-2 text-xs font-medium text-cyan-700 dark:text-cyan-200">
            已选部门
          </div>
          <div className={selectedTargetListClass}>
            {selectedDepts.map((dept) => (
              <span
                key={dept.deptId}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs text-cyan-700 dark:border-cyan-900 dark:bg-slate-950 dark:text-cyan-200"
              >
                {dept.deptName}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleDept(dept.deptId);
                  }}
                  className="text-cyan-300 hover:text-cyan-600 dark:text-cyan-700 dark:hover:text-cyan-200"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="admin-targeting-picker-section p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cf-faint" />
          <Input
            type="text"
            className="h-10 rounded-md pl-9 text-sm"
            placeholder="搜索部门"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className={targetOptionListClass}>
        {deptTree.length === 0 ? (
          <WorkspaceInlineState title="暂无部门数据" className="py-6" />
        ) : (
          deptTree.map((node) => renderDeptNode(node, 0))
        )}
      </div>

      <div className="admin-targeting-picker-section px-4 py-2 text-xs text-cf-subtle">
        已选择 <span className="font-medium text-cyan-600 dark:text-cyan-200">{selectedDepts.length}</span> 个部门
      </div>
    </InnerTableSurface>
  );
};

const RoleListPicker: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const [search, setSearch] = useState('');
  const [roles, setRoles] = useState<any[]>([]);

  useEffect(() => {
    getRoleOptions()
      .then((response: any) => {
        setRoles(Array.isArray(response) ? response : response?.rows || response?.records || []);
      })
      .catch(console.error);
  }, []);

  const selectedIds = value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
  const getRoleIdentifier = (role: any) => String(role.roleKey || role.id || role.roleId);
  const getRoleIdentifiers = (role: any) => [
    role.roleKey,
    role.id,
    role.roleId,
  ].filter((item) => item !== undefined && item !== null).map(String);

  const toggleRole = (id: string) => {
    const nextIds = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    onChange(nextIds.join(','));
  };

  const selectedRoles = roles.filter((role) => getRoleIdentifiers(role).some((id) => selectedIds.includes(id)));
  const filteredRoles = roles.filter((role) => {
    if (!search) {
      return true;
    }

    const keyword = search.toLowerCase();
    return (role.roleName || '').toLowerCase().includes(keyword)
      || (role.name || '').toLowerCase().includes(keyword)
      || (role.roleKey || '').toLowerCase().includes(keyword);
  });

  return (
    <InnerTableSurface className="admin-targeting-picker overflow-hidden" wrapperClassName="flex flex-col">
      {selectedRoles.length > 0 ? (
        <div className="border-b border-slate-200 bg-[var(--cf-surface-muted)] p-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-2 text-xs font-medium text-cyan-700 dark:text-cyan-200">
            已选角色
          </div>
          <div className={selectedTargetListClass}>
            {selectedRoles.map((role) => {
              const id = getRoleIdentifier(role);

              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs text-cyan-700 dark:border-cyan-900 dark:bg-slate-950 dark:text-cyan-200"
                >
                  {role.roleName || role.name}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleRole(id);
                    }}
                    className="text-cyan-300 hover:text-cyan-600 dark:text-cyan-700 dark:hover:text-cyan-200"
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="admin-targeting-picker-section p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cf-faint" />
          <Input
            type="text"
            className="h-10 rounded-md pl-9 text-sm"
            placeholder="搜索角色"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className={targetOptionListClass}>
        {roles.length === 0 ? (
          <WorkspaceInlineState title="加载中或暂无角色数据" className="py-6" />
        ) : filteredRoles.length === 0 ? (
          <WorkspaceInlineState title="未找到匹配的角色" className="py-6" />
        ) : (
          filteredRoles.map((role) => {
            const id = getRoleIdentifier(role);
            const isSelected = selectedIds.includes(id);

            return (
              <div
                key={id}
                className={cn(
                  'group flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                  isSelected
                    ? 'border border-cyan-200 bg-[var(--cf-surface-strong)] text-cyan-900 dark:border-cyan-900 dark:bg-slate-950 dark:text-cyan-100'
                    : 'hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/70',
                )}
                onClick={() => toggleRole(id)}
              >
                <button
                  type="button"
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                    isSelected
                      ? 'border-cyan-500 bg-cyan-500 text-white'
                      : 'border-slate-300 bg-[var(--cf-surface-strong)] group-hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-950 dark:group-hover:border-cyan-800',
                  )}
                >
                  {isSelected ? <Check size={11} strokeWidth={3} /> : null}
                </button>
                <Shield size={14} className="shrink-0 text-cf-faint" />
                <span className="flex-1 truncate text-sm font-medium select-none">
                  {role.roleName || role.name}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="admin-targeting-picker-section px-4 py-2 text-xs text-cf-subtle">
        已选择 <span className="font-medium text-cyan-600 dark:text-cyan-200">{selectedRoles.length}</span> 个角色
      </div>
    </InnerTableSurface>
  );
};

export const AnnouncementTargetingEditor: React.FC<AnnouncementTargetingEditorProps> = ({
  scopeType,
  scopeValue,
  deptTree,
  onScopeTypeChange,
  onScopeValueChange,
}) => {
  const cards = [
    {
      value: AnnouncementScope.ALL,
      title: '全员可见',
      description: '全体员工可查看',
      icon: <Users size={16} />,
    },
    {
      value: AnnouncementScope.DEPT,
      title: '按部门定向',
      description: '仅指定部门可查看',
      icon: <Building2 size={16} />,
    },
    {
      value: AnnouncementScope.ROLE,
      title: '按角色定向',
      description: '仅指定角色可查看',
      icon: <Shield size={16} />,
    },
  ];
  const activeCard = cards.find((card) => card.value === scopeType) || cards[0];
  const targetCount = scopeType === AnnouncementScope.ALL
    ? 0
    : scopeValue.split(',').filter(Boolean).length;
  const statusText = scopeType === AnnouncementScope.ALL
    ? '全员'
    : `${targetCount} 个目标`;

  return (
    <div className="admin-targeting-editor max-h-[calc(90vh-10rem)] overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-cyan-200 bg-[var(--cf-surface-strong)] text-cyan-700 dark:border-cyan-900 dark:bg-slate-950 dark:text-cyan-200">
            {activeCard.icon}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-cf-title">发布范围</div>
            <div className="mt-1 truncate text-xs text-cf-subtle">
              {activeCard.title} · {statusText}
            </div>
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs font-medium text-cf-muted dark:border-slate-800 dark:bg-slate-950">
          {statusText}
        </span>
      </div>

      <div className="admin-targeting-option-list mt-4 overflow-hidden">
        {cards.map((card) => {
          const active = scopeType === card.value;

          return (
            <button
              key={card.value}
              type="button"
              onClick={() => onScopeTypeChange(card.value)}
              className={cn(
                'flex w-full items-center gap-3 border-b border-slate-200 px-3 py-3 text-left transition-colors last:border-b-0 dark:border-slate-800',
                active
                  ? 'bg-[var(--cf-surface-muted)] dark:bg-slate-900/70'
                  : 'hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/70',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                  active
                    ? 'border-cyan-200 bg-[var(--cf-surface-strong)] text-cyan-700 dark:border-cyan-900 dark:bg-slate-950 dark:text-cyan-200'
                    : 'border-slate-200 bg-[var(--cf-surface-strong)] text-cf-subtle dark:border-slate-800 dark:bg-slate-950',
                )}
              >
                {card.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-cf-title">{card.title}</div>
                <div className="mt-0.5 text-xs text-cf-subtle">{card.description}</div>
              </div>
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                  active
                    ? 'border-cyan-500 bg-cyan-500 text-white'
                    : 'border-slate-300 bg-[var(--cf-surface-strong)] dark:border-slate-700 dark:bg-slate-950',
                )}
              >
                {active ? <Check size={12} strokeWidth={3} /> : null}
              </span>
            </button>
          );
        })}
      </div>

      {scopeType === AnnouncementScope.DEPT ? (
        <div className="mt-4">
          <DeptTreePicker value={scopeValue} onChange={onScopeValueChange} deptTree={deptTree} />
        </div>
      ) : null}

      {scopeType === AnnouncementScope.ROLE ? (
        <div className="mt-4">
          <RoleListPicker value={scopeValue} onChange={onScopeValueChange} />
        </div>
      ) : null}
    </div>
  );
};
