import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Edit3,
  Eye,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog, Pagination } from '@/components/common';
import {
  Button,
  Input,
  SideNavItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { addDept, deleteDept, getDeptTree, getUserList, migrateDeptUsers, updateDept, updateUser, deleteUser } from '../services/api/auth';
import { getConfigIntSync } from '@/hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '@/constants/sysConfig';
import { cn } from '@/utils/cn';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';

// ============================================================
// 类型定义
// ============================================================

interface DeptItem {
  deptId: number;
  parentId: number;
  deptName: string;
  orderNum: number;
  leader: string;
  phone: string;
  email: string;
  status: string;
  ancestors?: string;
  children?: DeptItem[];
}

interface UserItem {
  userId: number;
  userName: string;
  nickName: string;
  email: string;
  phonenumber: string;
  sex: string;
  status: string;
  deptId: number;
  deptName?: string;
  role?: string;
  createTime?: string;
  remark?: string;
}

interface DeptFormState {
  deptId?: number;
  parentId: number;
  deptName: string;
  orderNum: number;
  leader: string;
  phone: string;
  email: string;
  status: string;
}

export interface OrgStructureStats {
  totalDepartments: number;
  filteredDepartments: number;
  activeDepartments: number;
  scopedUsers: number;
  filteredUsers: number;
  activeUsers: number;
  selectedDeptName: string | null;
  deptSearch: string;
  userSearch: string;
}

interface OrgStructureProps {
  refreshSignal?: number;
  onStatsChange?: (stats: OrgStructureStats) => void;
}

// ============================================================
// 工具函数
// ============================================================

const fieldLabelClassName = 'mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400';

const createDeptForm = (defaultParentId = 0): DeptFormState => ({
  parentId: defaultParentId,
  deptName: '',
  orderNum: 0,
  leader: '',
  phone: '',
  email: '',
  status: '0',
});

const getStatusBadgeClassName = (status: string) =>
  status === '0'
    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
    : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';

const countDepartments = (depts: DeptItem[]): number =>
  depts.reduce((count, dept) => count + 1 + countDepartments(dept.children || []), 0);

const countDeptChildren = (dept: DeptItem): number => countDepartments(dept.children || []);

const flattenDepts = (
  depts: DeptItem[],
  level = 0,
  excludeId?: number,
): { dept: DeptItem; level: number }[] =>
  depts.flatMap((dept) => {
    if (excludeId && dept.deptId === excludeId) {
      return [];
    }

    return [
      { dept, level },
      ...flattenDepts(dept.children || [], level + 1, excludeId),
    ];
  });

const findDeptById = (depts: DeptItem[], targetId: number | null): DeptItem | null => {
  if (targetId === null) return null;

  for (const dept of depts) {
    if (dept.deptId === targetId) {
      return dept;
    }
    const match = findDeptById(dept.children || [], targetId);
    if (match) {
      return match;
    }
  }

  return null;
};

const collectDeptIds = (depts: DeptItem[]): number[] =>
  depts.flatMap((dept) => [dept.deptId, ...collectDeptIds(dept.children || [])]);

// 保留祖先链路，确保树搜索后仍然能看出部门层级来源。
const filterDeptTree = (depts: DeptItem[], keyword: string): DeptItem[] => {
  if (!keyword.trim()) return depts;

  const normalized = keyword.trim().toLowerCase();

  return depts.flatMap((dept) => {
      const children = filterDeptTree(dept.children || [], keyword);
      const matchesSelf =
        dept.deptName.toLowerCase().includes(normalized) ||
        String(dept.deptId).includes(normalized) ||
        String(dept.leader || '').toLowerCase().includes(normalized);

      if (!matchesSelf && children.length === 0) {
        return [];
      }

      return [{
        ...dept,
        children,
      }];
    });
};

// ============================================================
// 内部组件
// ============================================================

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  className?: string;
}> = ({ title, description, icon, loading = false, className }) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
    {loading ? (
      <div className="mb-3 h-4 w-4 animate-spin rounded-md border-2 border-slate-400 border-t-transparent dark:border-slate-500" />
    ) : icon ? (
      <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>
    ) : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10">
      <InlineState title={title} description={description} loading={loading} className="py-0" />
    </td>
  </tr>
);

const DepartmentSelect: React.FC<{
  value: number | undefined;
  onChange: (value: number) => void;
  deptTree: DeptItem[];
  excludeId?: number;
  showRoot?: boolean;
  placeholder?: string;
}> = ({
  value,
  onChange,
  deptTree,
  excludeId,
  showRoot = true,
  placeholder = '请选择',
}) => {
  const [open, setOpen] = useState(false);
  const flatDepartments = useMemo(() => flattenDepts(deptTree, 0, excludeId), [deptTree, excludeId]);
  const selected = flatDepartments.find((item) => item.dept.deptId === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="cf-control flex h-10 w-full items-center justify-between rounded-md px-4 text-left text-sm transition"
      >
        <span className="truncate">
          {selected?.dept.deptName || (value === 0 && showRoot ? '顶级部门' : placeholder)}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto border border-slate-200 bg-[var(--cf-surface-strong)] p-1.5 dark:border-slate-800 dark:bg-slate-900">
          {showRoot ? (
            <SideNavItem
              size="sm"
              active={value === 0}
              onClick={() => {
                onChange(0);
                setOpen(false);
              }}
            >
              顶级部门
            </SideNavItem>
          ) : null}

          {flatDepartments.map(({ dept, level }) => (
            <SideNavItem
              key={dept.deptId}
              size="sm"
              active={value === dept.deptId}
              onClick={() => {
                onChange(dept.deptId);
                setOpen(false);
              }}
              style={{ paddingLeft: `${level * 18 + 12}px` }}
            >
              {dept.deptName}
            </SideNavItem>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const DepartmentPickerList: React.FC<{
  deptTree: DeptItem[];
  value?: number;
  onChange: (value: number) => void;
}> = ({ deptTree, value, onChange }) => {
  const [keyword, setKeyword] = useState('');

  const departments = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return flattenDepts(deptTree).filter(({ dept }) => {
      if (!normalized) {
        return true;
      }

      return (
        dept.deptName.toLowerCase().includes(normalized) ||
        String(dept.leader || '').toLowerCase().includes(normalized)
      );
    });
  }, [deptTree, keyword]);

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          className="pl-10"
          placeholder="搜索目标部门"
        />
      </div>

      <div className="max-h-[320px] overflow-y-auto border border-slate-200 bg-[var(--cf-surface-strong)] p-2 dark:border-slate-800 dark:bg-slate-900">
        {departments.length === 0 ? (
          <InlineState title="暂无匹配部门" description="请调整搜索条件后重试。" className="py-10" />
        ) : (
          <div className="space-y-1">
            {departments.map(({ dept, level }) => {
              const selected = value === dept.deptId;
              return (
                <SideNavItem
                  key={dept.deptId}
                  size="sm"
                  active={selected}
                  onClick={() => onChange(dept.deptId)}
                  style={{ paddingLeft: `${level * 18 + 12}px` }}
                >
                  <Building2 size={14} className="shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className="truncate">{dept.deptName}</span>
                  <span className={cn('ml-auto rounded-md px-2 py-0.5 text-[10px] font-medium', getStatusBadgeClassName(dept.status || '0'))}>
                    {(dept.status || '0') === '0' ? '正常' : '停用'}
                  </span>
                </SideNavItem>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// 部门树节点组件
// ============================================================

const DeptNode: React.FC<{
  dept: DeptItem;
  level?: number;
  selectedDeptId: number | null;
  expandedDeptIds: Set<number>;
  forceExpanded?: boolean;
  onSelect: (dept: DeptItem) => void;
  onToggle: (deptId: number) => void;
  onAddChild: (dept: DeptItem) => void;
  onEdit: (dept: DeptItem) => void;
}> = ({
  dept,
  level = 0,
  selectedDeptId,
  expandedDeptIds,
  forceExpanded = false,
  onSelect,
  onToggle,
  onAddChild,
  onEdit,
}) => {
  const hasChildren = Boolean(dept.children?.length);
  const expanded = forceExpanded || expandedDeptIds.has(dept.deptId);
  const isSelected = selectedDeptId === dept.deptId;
  const directChildren = dept.children?.length || 0;
  const childDepartments = countDeptChildren(dept);

  return (
    <div className="select-none relative">
      <div className="group relative">
        {level > 0 ? (
          <>
            {/* 竖向虚线连接线 */}
            <span
              className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-slate-200/80 dark:border-slate-800/60"
              style={{ left: `${(level - 1) * 18 + 20}px`, width: '1px' }}
            />
            {/* 横向折肘虚线 */}
            <span
              className="pointer-events-none absolute top-[18px] border-t border-dashed border-slate-200/80 dark:border-slate-800/60"
              style={{ left: `${(level - 1) * 18 + 20}px`, width: '10px', height: '1px' }}
            />
          </>
        ) : null}

        <div
          className={cn(
            'flex h-9 w-full items-center gap-1.5 border border-transparent px-2 text-left transition-all duration-300',
            isSelected
              ? 'border-[#b8e7f1] bg-[#effbfe] text-[#0b7894] shadow-none dark:border-[#0d95b5]/40 dark:bg-[#0d95b5]/15 dark:text-[#d8f3fa]'
              : 'text-slate-600 hover:bg-[var(--cf-surface-muted)] hover:text-slate-900 dark:text-slate-300 dark:hover:border-slate-800/50 dark:hover:bg-slate-900/40 dark:hover:text-slate-100',
          )}
          style={{ paddingLeft: `${level * 18 + 8}px` }}
        >
          <button
            type="button"
            disabled={!hasChildren}
            title={hasChildren ? (expanded ? '收起部门' : '展开部门') : undefined}
            aria-label={hasChildren ? (expanded ? '收起部门' : '展开部门') : undefined}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(dept.deptId);
            }}
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-800',
              hasChildren ? 'cursor-pointer' : 'cursor-default disabled:opacity-100',
            )}
          >
            {hasChildren ? expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span className="h-1 w-1 rounded-sm bg-slate-300 dark:bg-slate-700" />}
          </button>

          <button
            type="button"
            onClick={() => onSelect(dept)}
            title={dept.deptName}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs',
              isSelected
                ? 'border-[#b8e7f1] bg-[var(--cf-surface-strong)] text-[#0d95b5] dark:border-[#0d95b5]/40 dark:bg-[#0d95b5]/15 dark:text-[#d8f3fa]'
                : 'border-slate-200 bg-[var(--cf-surface-muted)] text-slate-400 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-500',
            )}>
              <Building2 size={13} />
            </span>

            <span className="truncate text-xs font-semibold">{dept.deptName}</span>
          </button>

          <div
            className={cn(
              'ml-auto flex shrink-0 items-center gap-0.5 transition-all duration-300',
              isSelected
                ? 'opacity-100'
                : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="新增子部门"
              aria-label="新增子部门"
              onClick={(event) => {
                event.stopPropagation();
                onAddChild(dept);
              }}
              className="!h-5 !w-5 !rounded-md !p-0 text-slate-400 hover:bg-[#effbfe] hover:text-[#0d95b5] dark:text-slate-400 dark:hover:bg-[#0d95b5]/15"
            >
              <Plus size={12} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="编辑部门"
              aria-label="编辑部门"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(dept);
              }}
              className="!h-5 !w-5 !rounded-md !p-0 text-slate-400 hover:bg-[var(--cf-surface-muted)] hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <Edit3 size={12} />
            </Button>
          </div>
        </div>
      </div>

      {expanded && hasChildren ? (
        <div className="mt-0.5 space-y-0.5">
          {dept.children?.map((child) => (
            <DeptNode
              key={child.deptId}
              dept={child}
              level={level + 1}
              selectedDeptId={selectedDeptId}
              expandedDeptIds={expandedDeptIds}
              forceExpanded={forceExpanded}
              onSelect={onSelect}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

// ============================================================
// 弹窗组件
// ============================================================

const DeptFormDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onSubmit: (data: DeptFormState) => void;
  editing: DeptItem | null;
  deptTree: DeptItem[];
  defaultParentId?: number;
}> = ({ open, onClose, onSubmit, editing, deptTree, defaultParentId = 0 }) => {
  const [form, setForm] = useState<DeptFormState>(createDeptForm(defaultParentId));

  useEffect(() => {
    if (!open) return;

    if (editing) {
      setForm({
        deptId: editing.deptId,
        parentId: editing.parentId ?? 0,
        deptName: editing.deptName,
        orderNum: editing.orderNum ?? 0,
        leader: editing.leader || '',
        phone: editing.phone || '',
        email: editing.email || '',
        status: editing.status || '0',
      });
      return;
    }

    setForm(createDeptForm(defaultParentId));
  }, [defaultParentId, editing, open]);

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title={editing ? '编辑部门' : '新增部门'}
      maxWidthClassName="max-w-3xl"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={() => {
              if (!form.deptName.trim()) {
                toast.error('请输入部门名称');
                return;
              }

              onSubmit({
                ...form,
                deptName: form.deptName.trim(),
                leader: form.leader.trim(),
                phone: form.phone.trim(),
                email: form.email.trim(),
              });
            }}
          >
            {editing ? '保存' : '创建'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={fieldLabelClassName}>上级部门</label>
          <DepartmentSelect
            value={form.parentId}
            onChange={(value) => setForm((prev) => ({ ...prev, parentId: value }))}
            deptTree={deptTree}
            excludeId={editing?.deptId}
          />
        </div>
        <div>
          <label className={fieldLabelClassName}>
            部门名称 <span className="text-red-500">*</span>
          </label>
          <Input
            value={form.deptName}
            onChange={(event) => setForm((prev) => ({ ...prev, deptName: event.target.value }))}
            placeholder="请输入部门名称"
          />
        </div>
        <div>
          <label className={fieldLabelClassName}>排序</label>
          <Input
            type="number"
            value={form.orderNum}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                orderNum: Number.parseInt(event.target.value, 10) || 0,
              }))
            }
          />
        </div>
        <div>
          <label className={fieldLabelClassName}>状态</label>
          <Select
            value={form.status}
            onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
          >
            <SelectTrigger className="rounded-md">
              <SelectValue placeholder="请选择状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">正常</SelectItem>
              <SelectItem value="1">停用</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className={fieldLabelClassName}>负责人</label>
          <Input
            value={form.leader}
            onChange={(event) => setForm((prev) => ({ ...prev, leader: event.target.value }))}
            placeholder="负责人"
          />
        </div>
        <div>
          <label className={fieldLabelClassName}>电话</label>
          <Input
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            placeholder="联系电话"
          />
        </div>
        <div className="md:col-span-2">
          <label className={fieldLabelClassName}>邮箱</label>
          <Input
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="联系邮箱"
          />
        </div>
      </div>
    </BaseDialog>
  );
};

const UserDetailDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  user: UserItem | null;
}> = ({ open, onClose, user }) => {
  const fields = user
    ? [
        { label: '用户账号', value: user.userName || '-' },
        { label: '显示名称', value: user.nickName || '-' },
        { label: '部门', value: user.deptName || '-' },
        { label: '角色', value: user.role || '-', type: 'role' as const },
        { label: '手机', value: user.phonenumber || '-' },
        { label: '邮箱', value: user.email || '-' },
        { label: '性别', value: user.sex === '0' ? '男' : user.sex === '1' ? '女' : '未知' },
        { label: '状态', value: user.status === '0' ? '正常' : '停用', type: 'status' as const },
        { label: '备注', value: user.remark || '-' },
      ]
    : [];

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="用户详情"
      maxWidthClassName="max-w-2xl"
      footer={
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      }
    >
      {user ? (
        <div className="admin-dialog-stack">
          <div className="flex items-center gap-4 border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex h-14 w-14 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] text-lg font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                {(user.nickName || user.userName || '?')[0]}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {user.nickName || user.userName}
                </div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">用户 ID {user.userId}</div>
              </div>
            </div>

          <div className="card overflow-hidden">
            <div className="grid gap-0 md:grid-cols-2">
              {fields.map((field) => (
                <div key={field.label} className="border-b border-slate-200 px-4 py-3 even:md:border-l dark:border-slate-800 dark:even:md:border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                    {field.label}
                  </div>
                  <div className="mt-1.5 text-sm text-slate-900 dark:text-slate-100">
                    {field.type === 'role' && field.value !== '-' ? (
                      <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                        {field.value}
                      </span>
                    ) : field.type === 'status' ? (
                      <span className={cn('rounded-md px-2.5 py-1 text-xs font-medium', getStatusBadgeClassName(user.status || '0'))}>
                        {field.value}
                      </span>
                    ) : (
                      field.value
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </BaseDialog>
  );
};

const ChangeDeptDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onSubmit: (userId: number, deptId: number) => void;
  user: UserItem | null;
  deptTree: DeptItem[];
}> = ({ open, onClose, onSubmit, user, deptTree }) => {
  const [targetDeptId, setTargetDeptId] = useState<number | undefined>(undefined);
  const targetDept = useMemo(
    () => findDeptById(deptTree, targetDeptId ?? null),
    [deptTree, targetDeptId],
  );

  useEffect(() => {
    if (!open || !user) return;
    setTargetDeptId(user.deptId);
  }, [open, user]);

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="调整部门"
      maxWidthClassName="w-full sm:max-w-4xl"
      bodyClassName="pb-10"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={() => {
              if (!user || !targetDeptId) {
                toast.error('请选择目标部门');
                return;
              }

              onSubmit(user.userId, targetDeptId);
            }}
          >
            确认调整
          </Button>
        </div>
      }
    >
      {user ? (
        <div className="admin-dialog-stack">
          <div className="admin-dialog-stack">
            <div className="flex items-center gap-3 border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                {(user.nickName || user.userName || '?')[0]}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{user.nickName || user.userName}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">当前部门 {user.deptName || '-'}</div>
              </div>
            </div>

            <div className="border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                目标部门
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {targetDept?.deptName || '未选择'}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {targetDept?.leader ? `负责人 ${targetDept.leader}` : '从部门列表选择目标部门'}
              </div>
            </div>
          </div>

          <div>
            <label className={fieldLabelClassName}>目标部门</label>
            <DepartmentPickerList
              value={targetDeptId}
              onChange={setTargetDeptId}
              deptTree={deptTree}
            />
          </div>
        </div>
      ) : null}
    </BaseDialog>
  );
};

const MigrateDeptDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onSubmit: (sourceDeptId: number, targetDeptId: number) => void;
  sourceDept: DeptItem | null;
  deptTree: DeptItem[];
}> = ({ open, onClose, onSubmit, sourceDept, deptTree }) => {
  const [targetDeptId, setTargetDeptId] = useState<number | undefined>(undefined);
  const targetDept = useMemo(
    () => findDeptById(deptTree, targetDeptId ?? null),
    [deptTree, targetDeptId],
  );

  useEffect(() => {
    if (!open) {
      setTargetDeptId(undefined);
    }
  }, [open]);

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="部门迁移"
      maxWidthClassName="w-full sm:max-w-4xl"
      bodyClassName="pb-10"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={() => {
              if (!sourceDept?.deptId || !targetDeptId) {
                toast.error('请选择目标部门');
                return;
              }
              if (sourceDept.deptId === targetDeptId) {
                toast.error('源部门和目标部门不能相同');
                return;
              }
              onSubmit(sourceDept.deptId, targetDeptId);
            }}
          >
            确认迁移
          </Button>
        </div>
      }
    >
      {sourceDept ? (
        <div className="admin-dialog-stack">
          <div className="admin-dialog-stack">
            <div className="border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                源部门
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {sourceDept.deptName}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                迁移后该部门下现有成员将整体移动到目标部门。
              </div>
            </div>

            <div className="border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                目标部门
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {targetDept?.deptName || '未选择'}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {targetDept?.leader ? `负责人 ${targetDept.leader}` : '从部门列表选择目标部门'}
              </div>
            </div>
          </div>

          <div>
            <label className={fieldLabelClassName}>目标部门</label>
            <DepartmentPickerList
              value={targetDeptId}
              onChange={setTargetDeptId}
              deptTree={deptTree.filter((dept) => dept.deptId !== sourceDept.deptId)}
            />
          </div>
        </div>
      ) : null}
    </BaseDialog>
  );
};

// ============================================================
// 主组件导出
// ============================================================

export const OrgStructure: React.FC<OrgStructureProps> = ({
  refreshSignal = 0,
  onStatsChange,
}) => {
  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);
  const [deptLoading, setDeptLoading] = useState(true);
  const [deptError, setDeptError] = useState<string | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [expandedDeptIds, setExpandedDeptIds] = useState<Set<number>>(new Set());
  const [deptSearch, setDeptSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(() => getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10));
  const [deptFormOpen, setDeptFormOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DeptItem | null>(null);
  const [defaultParentId, setDefaultParentId] = useState(0);
  const [detailUser, setDetailUser] = useState<UserItem | null>(null);
  const [changeDeptUser, setChangeDeptUser] = useState<UserItem | null>(null);
  const [migrateDeptSource, setMigrateDeptSource] = useState<DeptItem | null>(null);
  const [pendingDeleteDept, setPendingDeleteDept] = useState<DeptItem | null>(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<UserItem | null>(null);

  const selectedDept = useMemo(() => findDeptById(deptTree, selectedDeptId), [deptTree, selectedDeptId]);
  const filteredDeptTree = useMemo(() => filterDeptTree(deptTree, deptSearch), [deptTree, deptSearch]);
  const forceExpandDeptTree = Boolean(deptSearch.trim());
  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const keyword = userSearch.trim();
        if (!keyword) return true;

        return (
          user.nickName?.includes(keyword) ||
          user.userName?.includes(keyword) ||
          user.email?.includes(keyword) ||
          user.phonenumber?.includes(keyword)
        );
      }),
    [userSearch, users],
  );

  const userTotal = filteredUsers.length;
  const userTotalPages = Math.max(1, Math.ceil(userTotal / userPageSize));
  const safeUserPage = Math.min(userPage, userTotalPages);
  const userStartIndex = (safeUserPage - 1) * userPageSize;
  const pagedUsers = filteredUsers.slice(userStartIndex, userStartIndex + userPageSize);

  const totalDepartments = useMemo(() => countDepartments(deptTree), [deptTree]);
  const filteredDepartments = useMemo(() => countDepartments(filteredDeptTree), [filteredDeptTree]);
  const activeDepartments = useMemo(
    () => flattenDepts(deptTree).filter(({ dept }) => (dept.status || '0') === '0').length,
    [deptTree],
  );
  const activeUsers = useMemo(() => users.filter((user) => user.status === '0').length, [users]);

  const fetchDepts = useCallback(async () => {
    setDeptLoading(true);
    setDeptError(null);

    try {
      const response: any = await getDeptTree();
      const nextTree = Array.isArray(response) ? response : [];
      setDeptTree(nextTree);
      setExpandedDeptIds(new Set(collectDeptIds(nextTree)));
    } catch (error) {
      console.error('获取部门树失败:', error);
      const message = '获取部门树失败，请稍后重试';
      setDeptError(message);
      setDeptTree([]);
      toast.error(message);
    } finally {
      setDeptLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async (deptId?: number | null) => {
    setUserLoading(true);
    setUserError(null);

    try {
      const response: any = await getUserList(deptId ? { deptId } : {});
      const nextUsers = Array.isArray(response) ? response : response?.rows || response?.records || [];
      setUsers(nextUsers);
    } catch (error) {
      console.error('获取用户列表失败:', error);
      const message = '获取用户列表失败，请稍后重试';
      setUserError(message);
      setUsers([]);
      toast.error(message);
    } finally {
      setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDepts();
  }, [fetchDepts, refreshSignal]);

  useEffect(() => {
    void fetchUsers(selectedDeptId);
  }, [fetchUsers, refreshSignal, selectedDeptId]);

  useEffect(() => {
    if (selectedDeptId !== null && !findDeptById(deptTree, selectedDeptId)) {
      setSelectedDeptId(null);
    }
  }, [deptTree, selectedDeptId]);

  // 切换部门或搜索关键词后，成员分页回到第一页
  useEffect(() => {
    setUserPage(1);
  }, [selectedDeptId, userSearch]);

  useEffect(() => {
    onStatsChange?.({
      totalDepartments,
      filteredDepartments,
      activeDepartments,
      scopedUsers: users.length,
      filteredUsers: filteredUsers.length,
      activeUsers,
      selectedDeptName: selectedDept?.deptName || null,
      deptSearch,
      userSearch,
    });
  }, [
    activeDepartments,
    activeUsers,
    deptSearch,
    filteredDepartments,
    filteredUsers.length,
    onStatsChange,
    selectedDept?.deptName,
    totalDepartments,
    userSearch,
    users.length,
  ]);

  const handleDeptSubmit = async (data: DeptFormState) => {
    try {
      if (data.deptId) {
        await updateDept(data as any);
        toast.success('部门更新成功');
      } else {
        await addDept(data as any);
        toast.success('部门创建成功');
      }

      setDeptFormOpen(false);
      setEditingDept(null);
      await fetchDepts();
    } catch (error: any) {
      toast.error(error?.message || '部门保存失败');
    }
  };

  const toggleDeptExpand = (deptId: number) => {
    setExpandedDeptIds((current) => {
      const next = new Set(current);
      if (next.has(deptId)) {
        next.delete(deptId);
      } else {
        next.add(deptId);
      }
      return next;
    });
  };

  const expandAllDepartments = () => {
    setExpandedDeptIds(new Set(collectDeptIds(deptTree)));
  };

  const collapseAllDepartments = () => {
    setExpandedDeptIds(new Set());
  };

  const openCreateDeptDialog = (parentDept?: DeptItem | number) => {
    setEditingDept(null);
    setDefaultParentId(typeof parentDept === 'number' ? parentDept : parentDept?.deptId ?? 0);
    setDeptFormOpen(true);
  };

  const openEditDeptDialog = (dept: DeptItem) => {
    setEditingDept(dept);
    setDeptFormOpen(true);
  };

  const handleDeptDelete = async () => {
    if (!pendingDeleteDept) return;

    try {
      await deleteDept(pendingDeleteDept.deptId);
      toast.success('部门删除成功');
      if (selectedDeptId === pendingDeleteDept.deptId) {
        setSelectedDeptId(null);
      }
      setPendingDeleteDept(null);
      await fetchDepts();
    } catch (error: any) {
      toast.error(error?.message || '删除部门失败');
    }
  };

  const handleUserDeptChange = async (userId: number, deptId: number) => {
    try {
      await updateUser({ userId, deptId } as any);
      toast.success('部门调整成功');
      setChangeDeptUser(null);
      await fetchUsers(selectedDeptId);
    } catch (error: any) {
      toast.error(error?.message || '调整部门失败');
    }
  };

  const handleDeptMigrate = async (sourceDeptId: number, targetDeptId: number) => {
    try {
      const moved = await migrateDeptUsers({ sourceDeptId, targetDeptId });
      toast.success(`部门迁移成功，共迁移 ${Number(moved || 0)} 名成员`);
      setMigrateDeptSource(null);
      await Promise.all([fetchDepts(), fetchUsers(selectedDeptId)]);
    } catch (error: any) {
      toast.error(error?.message || '部门迁移失败');
    }
  };

  const handleUserDelete = async () => {
    if (!pendingDeleteUser) return;

    try {
      await deleteUser([pendingDeleteUser.userId]);
      toast.success('用户删除成功');
      setPendingDeleteUser(null);
      await fetchUsers(selectedDeptId);
    } catch (error: any) {
      toast.error(error?.message || '删除用户失败');
    }
  };

  return (
    <>
    <InnerTableSurface
      className="flex min-h-0 flex-1 flex-col"
      wrapperClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
    <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-stretch">
      {/* 部门目录 */}
      <div className="card admin-source-panel no-padding overflow-hidden flex min-h-0 flex-col xl:h-full">
        <div className="p-4 admin-source-section-head flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">部门目录</div>
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs font-semibold" onClick={() => openCreateDeptDialog(0)}>
            <Plus size={14} className="mr-1 text-[#0d95b5] dark:text-[#d8f3fa]" />
            新增根部门
          </Button>
        </div>
        <div className="p-4 flex min-h-0 flex-1 flex-col">
          <div className="admin-dialog-stack !flex min-h-0 flex-1 flex-col">
            <div className="relative flex-shrink-0">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                value={deptSearch}
                onChange={(event) => setDeptSearch(event.target.value)}
                className="h-10 pl-10"
                placeholder="搜索部门名称、负责人..."
              />
            </div>

            <button
              type="button"
              onClick={() => setSelectedDeptId(null)}
              className={cn(
                'flex w-full items-center gap-3 border px-3 py-3 text-left transition-all duration-300 flex-shrink-0',
                selectedDeptId === null
                  ? 'border-[#b8e7f1] bg-[#effbfe] text-[#0b7894] shadow-none dark:border-[#0d95b5]/40 dark:bg-[#0d95b5]/15 dark:text-[#d8f3fa]'
                : 'admin-option-surface border-slate-200 bg-[var(--cf-surface-strong)] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
              )}
            >
              <span className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors",
                selectedDeptId === null
                  ? "border-[#b8e7f1] bg-[var(--cf-surface-strong)] text-[#0d95b5] dark:border-[#0d95b5]/40 dark:bg-[#0d95b5]/15"
                  : "border-slate-200 bg-[var(--cf-surface-muted)] text-slate-400 dark:border-slate-800 dark:bg-slate-900/50"
              )}>
                <Building2 size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">全组织成员</span>
                <span className="mt-0.5 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  {totalDepartments} 部门 / {activeDepartments} 正常运行
                </span>
              </span>
            </button>

            <div className="overflow-hidden border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-900 flex min-h-0 flex-1 flex-col">
              <div className="admin-source-section-head flex items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-slate-800 bg-[var(--cf-surface-strong)] dark:bg-slate-900 flex-shrink-0">
                <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                  {deptSearch ? `搜索到 ${filteredDepartments} 个结果` : `部门层级树`}
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={expandAllDepartments} className="!h-5 !rounded-md !px-2 !py-0.5 !text-[10px] !font-bold !text-[#0d95b5] shadow-none hover:bg-[#effbfe] dark:!text-[#d8f3fa] dark:hover:bg-[#0d95b5]/15">
                    全部展开
                  </Button>
                  <div className="w-px h-2.5 bg-slate-200 dark:bg-slate-800" />
                  <Button type="button" variant="ghost" size="sm" onClick={collapseAllDepartments} className="!h-5 !rounded-md !px-2 !py-0.5 !text-[10px] !font-bold !text-slate-500 shadow-none hover:bg-[var(--cf-surface-muted)] dark:!text-slate-400 dark:hover:bg-slate-900/40">
                    全部折叠
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 hide-scrollbar">
                {deptLoading ? (
                  <InlineState title="正在构筑部门模型..." loading className="py-12 scale-90" />
                ) : deptError ? (
                  <InlineState icon={<Building2 className="h-5 w-5" />} title="模型加载失败" description={deptError} className="py-12 scale-90" />
                ) : filteredDeptTree.length === 0 ? (
                  <InlineState icon={<Building2 className="h-5 w-5" />} title="无匹配项" description={deptSearch ? '请尝试其他关键词。' : '暂无组织数据。'} className="py-12 scale-90" />
                ) : (
                  <div className="space-y-0.5">
                    {filteredDeptTree.map((dept) => (
                      <DeptNode
                        key={dept.deptId}
                        dept={dept}
                        selectedDeptId={selectedDeptId}
                        expandedDeptIds={expandedDeptIds}
                        forceExpanded={forceExpandDeptTree}
                        onSelect={(item) => setSelectedDeptId((prev) => (prev === item.deptId ? null : item.deptId))}
                        onToggle={toggleDeptExpand}
                        onAddChild={(item) => openCreateDeptDialog(item.deptId)}
                        onEdit={openEditDeptDialog}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 成员表格 */}
      <div className="card admin-source-panel no-padding overflow-hidden flex flex-col">
        <div className="p-4 admin-source-section-head flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="min-w-0">
            {selectedDept ? (
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {selectedDept.deptName}
                  </h3>
                  <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium scale-90 origin-left', getStatusBadgeClassName(selectedDept.status || '0'))}>
                    {(selectedDept.status || '0') === '0' ? '正常' : '停用'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                  包含 {countDeptChildren(selectedDept)} 个子部门 · 负责人: <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedDept.leader || '未指定'}</span> {selectedDept.phone ? `· 电话: ${selectedDept.phone}` : ''}
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">组织成员全览</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">展示全组织架构下的所有成员数据</p>
              </div>
            )}
          </div>

          {selectedDept ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 px-3 py-1.5 text-xs font-semibold" onClick={() => openCreateDeptDialog(selectedDept.deptId)}>
                <Plus size={13} className="mr-1 text-[#0d95b5] dark:text-[#d8f3fa]" />
                新增子部门
              </Button>
              <Button variant="outline" size="sm" className="h-9 px-3 py-1.5 text-xs font-semibold" onClick={() => openEditDeptDialog(selectedDept)}>
                <Edit3 size={13} className="mr-1 text-[#0d95b5] dark:text-[#d8f3fa]" />
                编辑部门
              </Button>
              <Button variant="outline" size="sm" className="h-9 px-3 py-1.5 text-xs font-semibold" onClick={() => setMigrateDeptSource(selectedDept)}>
                <ArrowRightLeft size={13} className="mr-1 text-[#0d95b5] dark:text-[#d8f3fa]" />
                迁移成员
              </Button>
              <Button variant="outline" size="sm" className="h-9 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/20" onClick={() => setPendingDeleteDept(selectedDept)}>
                <Trash2 size={13} className="mr-1" />
                删除部门
              </Button>
            </div>
          ) : null}
        </div>
        <div className="p-4 flex flex-col">
          <div className="overflow-hidden border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-900 flex flex-col">
            <div className="admin-source-section-head flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between bg-[var(--cf-surface-strong)] dark:bg-slate-900 flex-shrink-0">
              <div className="relative min-w-0 flex-1 max-w-md">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  className="h-10 pl-10"
                  placeholder="搜索成员姓名、账号、手机号..."
                />
              </div>
              <div className="flex items-center gap-3">
                {userSearch ? (
                  <Button variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100" onClick={() => setUserSearch('')}>
                    清空搜索
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" className="h-9">
                  <Download size={14} className="mr-1.5" />
                  导出数据
                </Button>
              </div>
            </div>

            <div className="admin-horizontal-scroll flex-shrink-0">
              <table className="unity-data-table admin-source-table min-w-[1100px]">
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>账号</th>
                    <th>部门</th>
                    <th>手机</th>
                    <th>邮箱</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th className="w-56 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="">
                  {userLoading ? (
                    <TableStateRow colSpan={8} title="正在加载成员列表..." loading />
                  ) : userError ? (
                    <TableStateRow colSpan={8} title="成员列表加载失败" description={userError} />
                  ) : userTotal === 0 ? (
                    <TableStateRow
                      colSpan={8}
                      title="暂无成员数据"
                      description={userSearch ? '请调整成员搜索条件后重试。' : selectedDept ? '当前部门暂无成员。' : '当前没有可展示的成员数据。'}
                    />
                  ) : (
                    pagedUsers.map((user) => (
                      <tr key={user.userId}>
                        <td>
                          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                              {(user.nickName || user.userName || '?')[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {user.nickName || '-'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="text-sm text-slate-700 dark:text-slate-200">{user.userName}</td>
                        <td className="text-sm text-slate-600 dark:text-slate-300">{user.deptName || '-'}</td>
                        <td className="text-sm text-slate-600 dark:text-slate-300">{user.phonenumber || '-'}</td>
                        <td className="max-w-[220px] truncate text-sm text-slate-500 dark:text-slate-400" title={user.email || '-'}>
                          {user.email || '-'}
                        </td>
                        <td>
                          {user.role ? (
                            <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                              {user.role}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-400 dark:text-slate-500">-</span>
                          )}
                        </td>
                        <td>
                          <span className={cn('rounded-md px-2.5 py-1 text-xs font-medium', getStatusBadgeClassName(user.status || '0'))}>
                            {user.status === '0' ? '正常' : '停用'}
                          </span>
                        </td>
                        <td>
                          <div className="admin-users-row-actions">
                            <button
                              type="button"
                              title="详情"
                              aria-label="详情"
                              onClick={() => setDetailUser(user)}
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              type="button"
                              title="调岗"
                              aria-label="调岗"
                              onClick={() => setChangeDeptUser(user)}
                            >
                              <ArrowRightLeft size={14} />
                            </button>
                            <button
                              type="button"
                              className="danger"
                              title="删除"
                              aria-label="删除"
                              onClick={() => setPendingDeleteUser(user)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {userTotal > 0 ? (
              <div className="border-t border-slate-200 p-3 dark:border-slate-800 flex-shrink-0">
                <Pagination
                  total={userTotal}
                  page={safeUserPage}
                  pageSize={userPageSize}
                  onPageChange={(next) => setUserPage(next)}
                  onPageSizeChange={(size) => {
                    setUserPageSize(size);
                    setUserPage(1);
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
    </InnerTableSurface>

      {/* 弹窗 */}
      <DeptFormDialog
        open={deptFormOpen}
        onClose={() => {
          setDeptFormOpen(false);
          setEditingDept(null);
        }}
        onSubmit={handleDeptSubmit}
        editing={editingDept}
        deptTree={deptTree}
        defaultParentId={defaultParentId}
      />

      <UserDetailDialog
        open={Boolean(detailUser)}
        onClose={() => setDetailUser(null)}
        user={detailUser}
      />

      <ChangeDeptDialog
        open={Boolean(changeDeptUser)}
        onClose={() => setChangeDeptUser(null)}
        onSubmit={handleUserDeptChange}
        user={changeDeptUser}
        deptTree={deptTree}
      />

      <MigrateDeptDialog
        open={Boolean(migrateDeptSource)}
        onClose={() => setMigrateDeptSource(null)}
        onSubmit={handleDeptMigrate}
        sourceDept={migrateDeptSource}
        deptTree={deptTree}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteDept)}
        title="确认删除部门"
        message={
          pendingDeleteDept
            ? `确定要删除部门"${pendingDeleteDept.deptName}"吗？该操作不可恢复。`
            : ''
        }
        confirmText="确认删除"
        cancelText="取消"
        danger={true}
        onCancel={() => setPendingDeleteDept(null)}
        onConfirm={() => void handleDeptDelete()}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteUser)}
        title="确认删除用户"
        message={
          pendingDeleteUser
            ? `确定要删除用户"${pendingDeleteUser.nickName || pendingDeleteUser.userName}"吗？该操作不可恢复。`
            : ''
        }
        confirmText="确认删除"
        cancelText="取消"
        danger={true}
        onCancel={() => setPendingDeleteUser(null)}
        onConfirm={() => void handleUserDelete()}
      />
    </>
  );
};
