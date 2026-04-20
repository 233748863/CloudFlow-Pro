import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Search,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { AnnouncementScope } from '@/types';
import { getRoleList } from '@/services/api/auth';
import { Input } from '@/components/ui';
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
          className="group flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-cyan-50/60 dark:hover:bg-cyan-950/20"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <button
            type="button"
            onClick={() => toggleExpand(node.deptId)}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
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
              isSelected ? 'border-cyan-500 bg-cyan-500' : 'border-slate-300 hover:border-cyan-300 dark:border-slate-700 dark:hover:border-cyan-800',
            )}
          >
            {isSelected ? <div className="h-2 w-2 rounded-full bg-white" /> : null}
          </button>

          <Building2 size={14} className="ml-1 shrink-0 text-amber-500 dark:text-amber-300" />
          <span
            className="flex-1 truncate text-sm font-medium text-slate-700 select-none dark:text-slate-200"
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
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-200/70 dark:border-slate-800 dark:bg-slate-950/88 dark:ring-slate-800/70">
      {selectedDepts.length > 0 ? (
        <div className="border-b border-slate-100 bg-cyan-50/80 p-3 dark:border-slate-800 dark:bg-cyan-950/20">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-600">
            已选部门
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedDepts.map((dept) => (
              <span
                key={dept.deptId}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-cyan-700 ring-1 ring-cyan-100 dark:bg-slate-950 dark:text-cyan-200 dark:ring-cyan-900"
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

      <div className="border-b border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            className="h-10 rounded-xl pl-9 text-sm"
            placeholder="搜索部门..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto p-2">
        {deptTree.length === 0 ? (
          <WorkspaceInlineState title="暂无部门数据" className="py-6" />
        ) : (
          deptTree.map((node) => renderDeptNode(node, 0))
        )}
      </div>

      <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
        已选择 <span className="font-medium text-cyan-600 dark:text-cyan-200">{selectedDepts.length}</span> 个部门
      </div>
    </div>
  );
};

const RoleListPicker: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const [search, setSearch] = useState('');
  const [roles, setRoles] = useState<any[]>([]);

  useEffect(() => {
    getRoleList()
      .then((response: any) => {
        setRoles(Array.isArray(response) ? response : response?.rows || response?.records || []);
      })
      .catch(console.error);
  }, []);

  const selectedIds = value ? value.split(',').filter(Boolean) : [];
  const getRoleIdentifier = (role: any) => String(role.roleId || role.id || role.roleKey);

  const toggleRole = (id: string) => {
    const nextIds = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    onChange(nextIds.join(','));
  };

  const selectedRoles = roles.filter((role) => selectedIds.includes(getRoleIdentifier(role)));
  const filteredRoles = roles.filter((role) => {
    if (!search) {
      return true;
    }

    const keyword = search.toLowerCase();
    return (role.roleName || '').toLowerCase().includes(keyword)
      || (role.name || '').toLowerCase().includes(keyword);
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-200/70 dark:border-slate-800 dark:bg-slate-950/88 dark:ring-slate-800/70">
      {selectedRoles.length > 0 ? (
        <div className="border-b border-slate-100 bg-cyan-50/80 p-3 dark:border-slate-800 dark:bg-cyan-950/20">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-600">
            已选角色
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedRoles.map((role) => {
              const id = getRoleIdentifier(role);

              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-cyan-700 ring-1 ring-cyan-100 dark:bg-slate-950 dark:text-cyan-200 dark:ring-cyan-900"
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

      <div className="border-b border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            className="h-10 rounded-xl pl-9 text-sm"
            placeholder="搜索角色..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto p-2">
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
                className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-cyan-50/60 dark:hover:bg-cyan-950/20"
                onClick={() => toggleRole(id)}
              >
                <button
                  type="button"
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                    isSelected
                      ? 'border-cyan-500 bg-cyan-500'
                      : 'border-slate-300 group-hover:border-cyan-300 dark:border-slate-700 dark:group-hover:border-cyan-800',
                  )}
                >
                  {isSelected ? <div className="h-2 w-2 rounded-full bg-white" /> : null}
                </button>
                <Shield size={14} className="shrink-0 text-emerald-500 dark:text-emerald-300" />
                <span className="flex-1 truncate text-sm font-medium text-slate-700 select-none dark:text-slate-200">
                  {role.roleName || role.name}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
        已选择 <span className="font-medium text-cyan-600 dark:text-cyan-200">{selectedRoles.length}</span> 个角色
      </div>
    </div>
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
      description: '不限制范围，公告发布后全体员工都可查看。',
      icon: <Users size={16} />,
    },
    {
      value: AnnouncementScope.DEPT,
      title: '按部门定向',
      description: '只面向指定部门发布，适合组织通知和部门公告。',
      icon: <Building2 size={16} />,
    },
    {
      value: AnnouncementScope.ROLE,
      title: '按角色定向',
      description: '只面向指定角色发布，适合岗位制度和权限提醒。',
      icon: <Shield size={16} />,
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">发布范围</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {scopeType === AnnouncementScope.ALL ? '当前为全员可见。' : '当前为定向发布，请继续选择目标对象。'}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {cards.map((card) => {
          const active = scopeType === card.value;

          return (
            <button
              key={card.value}
              type="button"
              onClick={() => {
                onScopeTypeChange(card.value);
                if (card.value === AnnouncementScope.ALL) {
                  onScopeValueChange('');
                }
              }}
              className={cn(
                'rounded-xl border px-4 py-4 text-left transition-all',
                active
                  ? 'border-cyan-500 bg-cyan-50/60 shadow-sm ring-1 ring-cyan-200 dark:border-cyan-700 dark:bg-cyan-950/20 dark:ring-cyan-900'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700',
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-xl', active ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400')}>
                  {card.icon}
                </span>
                {card.title}
              </div>
              <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{card.description}</div>
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
