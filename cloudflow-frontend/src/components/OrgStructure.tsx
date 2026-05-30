import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Edit3,
  Eye,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common';
import {
  Button,
  Input,
  SideNavItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { addDept, deleteDept, getDeptTree, getUserList, updateDept, updateUser, deleteUser } from '../services/api/auth';
import { cn } from '@/utils/cn';

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

const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200';

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
      <div className="mb-3 h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent dark:border-gray-500" />
    ) : icon ? (
      <div className="mb-3 text-gray-400 dark:text-gray-500">{icon}</div>
    ) : null}
    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-gray-500 dark:text-gray-400">{description}</div>
    ) : null}
  </div>
);

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <InlineState title={title} description={description} loading={loading} className="py-0" />
    </TableCell>
  </TableRow>
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
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 text-left text-sm text-gray-700 shadow-sm transition hover:border-gray-300 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:border-gray-600"
      >
        <span className="truncate">
          {selected?.dept.deptName || (value === 0 && showRoot ? '顶级部门' : placeholder)}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[0_18px_36px_rgba(15,23,42,0.12)] dark:border-gray-800 dark:bg-gray-950 dark:shadow-[0_24px_48px_rgba(2,6,23,0.46)]">
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
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          className="pl-10"
          placeholder="搜索目标部门"
        />
      </div>

      <div className="max-h-[320px] overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/60 p-2 dark:border-gray-800 dark:bg-gray-900/30">
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
                  <Building2 size={14} className="shrink-0 text-gray-400 dark:text-gray-500" />
                  <span className="truncate">{dept.deptName}</span>
                  <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium', getStatusBadgeClassName(dept.status || '0'))}>
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
    <div className="select-none">
      <div className="group relative">
        {level > 0 ? (
          <span
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-gray-200/70 dark:bg-gray-800"
            style={{ left: `${level * 18 + 15}px` }}
          />
        ) : null}

        <div
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-xl border px-2 py-2 text-left transition',
            isSelected
              ? 'border-primary-200 bg-primary-50 text-primary-900 shadow-sm dark:border-primary-900/70 dark:bg-primary-950/30 dark:text-primary-100'
              : 'border-transparent text-gray-600 hover:border-gray-100 hover:bg-white hover:text-gray-900 dark:text-gray-300 dark:hover:border-dark-700/50 dark:hover:bg-dark-800/50 dark:hover:text-gray-100',
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
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-gray-400 transition',
              hasChildren
                ? 'hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-dark-700 dark:hover:text-gray-200'
                : 'cursor-default disabled:opacity-100',
            )}
          >
            {hasChildren ? expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} /> : <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-700" />}
          </button>

          <button
            type="button"
            onClick={() => onSelect(dept)}
            title={dept.deptName}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border',
              isSelected
                ? 'border-primary-200 bg-white text-primary-700 dark:border-primary-900/70 dark:bg-primary-950/50 dark:text-primary-200'
                : 'border-gray-100 bg-gray-50 text-gray-400 dark:border-dark-700/50 dark:bg-dark-800 dark:text-gray-500',
            )}>
              <Building2 size={15} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold">{dept.deptName}</span>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', getStatusBadgeClassName(dept.status || '0'))}>
                  {(dept.status || '0') === '0' ? '正常' : '停用'}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-gray-400 dark:text-gray-500">
                {childDepartments > 0 ? `${directChildren} 个下级 / 共 ${childDepartments} 个` : dept.leader ? `负责人 ${dept.leader}` : `部门 ID ${dept.deptId}`}
              </span>
            </span>
          </button>

          <div
            className={cn(
              'ml-auto flex shrink-0 items-center gap-1 transition',
              isSelected
                ? 'opacity-100'
                : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
            )}
          >
            <button
              type="button"
              title="新增子部门"
              aria-label="新增子部门"
              onClick={(event) => {
                event.stopPropagation();
                onAddChild(dept);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition hover:bg-primary-50 hover:text-primary-700 dark:text-gray-400 dark:hover:bg-primary-950/30 dark:hover:text-primary-200"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              title="编辑部门"
              aria-label="编辑部门"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(dept);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-gray-100"
            >
              <Edit3 size={14} />
            </button>
          </div>
        </div>
      </div>

      {expanded && hasChildren ? (
        <div className="mt-1 space-y-1">
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
            <SelectTrigger className="h-11 rounded-2xl">
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
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-4 dark:border-dark-700/50 dark:bg-dark-800/50">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-100 bg-white text-lg font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                {(user.nickName || user.userName || '?')[0]}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {user.nickName || user.userName}
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">用户 ID {user.userId}</div>
              </div>
            </div>

          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-dark-700/50 dark:bg-dark-800/50">
            <div className="grid gap-0 md:grid-cols-2">
              {fields.map((field) => (
                <div key={field.label} className="border-b border-gray-100 px-4 py-3 even:md:border-l dark:border-dark-700/50 dark:even:md:border-dark-700/50">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                    {field.label}
                  </div>
                  <div className="mt-1.5 text-sm text-gray-900 dark:text-gray-100">
                    {field.type === 'role' && field.value !== '-' ? (
                      <span className="rounded-full border border-gray-100 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                        {field.value}
                      </span>
                    ) : field.type === 'status' ? (
                      <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getStatusBadgeClassName(user.status || '0'))}>
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
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 dark:border-dark-700/50 dark:bg-dark-800/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                {(user.nickName || user.userName || '?')[0]}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{user.nickName || user.userName}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">当前部门 {user.deptName || '-'}</div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 dark:border-dark-700/50 dark:bg-dark-800/50">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                目标部门
              </div>
              <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {targetDept?.deptName || '未选择'}
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {targetDept?.leader ? `负责人 ${targetDept.leader}` : '从右侧列表选择目标部门'}
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
  const [deptFormOpen, setDeptFormOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DeptItem | null>(null);
  const [defaultParentId, setDefaultParentId] = useState(0);
  const [detailUser, setDetailUser] = useState<UserItem | null>(null);
  const [changeDeptUser, setChangeDeptUser] = useState<UserItem | null>(null);
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
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      {/* 左侧：部门树 */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-dark-700/50 dark:bg-dark-800/50">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-dark-700/50">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">部门</div>
          <Button variant="outline" size="sm" onClick={() => openCreateDeptDialog(0)}>
            <Plus size={14} />
            新增
          </Button>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <Input
                value={deptSearch}
                onChange={(event) => setDeptSearch(event.target.value)}
                className="pl-10"
                placeholder="搜索部门名称或负责人"
              />
            </div>

            <button
              type="button"
              onClick={() => setSelectedDeptId(null)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition',
                selectedDeptId === null
                  ? 'border-primary-200 bg-primary-50 text-primary-900 shadow-sm dark:border-primary-900/70 dark:bg-primary-950/30 dark:text-primary-100'
                  : 'border-gray-100 bg-white text-gray-700 hover:border-gray-200 hover:bg-gray-50 dark:border-dark-700/50 dark:bg-dark-800/50 dark:text-gray-200 dark:hover:border-dark-600 dark:hover:bg-dark-700/50',
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-500 dark:border-dark-700/50 dark:bg-dark-800 dark:text-gray-400">
                <Building2 size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">全部部门</span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                  {totalDepartments} 个部门 / {activeDepartments} 个正常
                </span>
              </span>
            </button>

            {selectedDept ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-3 dark:border-dark-700/50 dark:bg-dark-800/50">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {selectedDept.deptName}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {countDeptChildren(selectedDept)} 个下级部门
                    </div>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', getStatusBadgeClassName(selectedDept.status || '0'))}>
                    {(selectedDept.status || '0') === '0' ? '正常' : '停用'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm" className="px-2" onClick={() => openCreateDeptDialog(selectedDept.deptId)}>
                    <Plus size={14} />
                    子部门
                  </Button>
                  <Button variant="outline" size="sm" className="px-2" onClick={() => openEditDeptDialog(selectedDept)}>
                    <Edit3 size={14} />
                    编辑
                  </Button>
                  <Button variant="outline" size="sm" className="px-2 text-rose-600 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200" onClick={() => setPendingDeleteDept(selectedDept)}>
                    <Trash2 size={14} />
                    删除
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50/50 dark:border-dark-700/50 dark:bg-dark-800/30">
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-dark-700/50">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {deptSearch ? `匹配 ${filteredDepartments} 个部门` : `组织树 ${totalDepartments} 个部门`}
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={expandAllDepartments} className="rounded-lg px-2 py-1 text-xs text-gray-500 transition hover:bg-white hover:text-gray-900 dark:text-gray-400 dark:hover:bg-dark-800 dark:hover:text-gray-100">
                    展开
                  </button>
                  <button type="button" onClick={collapseAllDepartments} className="rounded-lg px-2 py-1 text-xs text-gray-500 transition hover:bg-white hover:text-gray-900 dark:text-gray-400 dark:hover:bg-dark-800 dark:hover:text-gray-100">
                    收起
                  </button>
                </div>
              </div>

              <div className="max-h-[62vh] overflow-y-auto p-2">
                {deptLoading ? (
                  <InlineState title="正在加载部门树..." loading className="py-12" />
                ) : deptError ? (
                  <InlineState icon={<Building2 className="h-5 w-5" />} title="部门树加载失败" description={deptError} className="py-12" />
                ) : filteredDeptTree.length === 0 ? (
                  <InlineState icon={<Building2 className="h-5 w-5" />} title="暂无匹配部门" description={deptSearch ? '请调整部门搜索条件后重试。' : '当前还没有部门数据。'} className="py-12" />
                ) : (
                  <div className="space-y-1">
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

      {/* 右侧：用户表格 */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-dark-700/50 dark:bg-dark-800/50">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-dark-700/50">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {selectedDept ? `${selectedDept.deptName}` : '成员'}
          </div>
        </div>
        <div className="p-4">
          <div className="rounded-xl border border-gray-100 dark:border-dark-700/50">
            <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 dark:border-dark-700/50 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative min-w-0 flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <Input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  className="pl-10"
                  placeholder="搜索成员姓名、账号、邮箱或手机号"
                />
              </div>
              {userSearch ? (
                <Button variant="outline" onClick={() => setUserSearch('')}>
                  清空搜索
                </Button>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>用户</TableHead>
                    <TableHead>账号</TableHead>
                    <TableHead>部门</TableHead>
                    <TableHead>手机</TableHead>
                    <TableHead>邮箱</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>状态</TableHead>
                    <TableActionHead className="w-56">操作</TableActionHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userLoading ? (
                    <TableStateRow colSpan={8} title="正在加载成员列表..." loading />
                  ) : userError ? (
                    <TableStateRow colSpan={8} title="成员列表加载失败" description={userError} />
                  ) : filteredUsers.length === 0 ? (
                    <TableStateRow
                      colSpan={8}
                      title="暂无成员数据"
                      description={userSearch ? '请调整成员搜索条件后重试。' : selectedDept ? '当前部门暂无成员。' : '当前没有可展示的成员数据。'}
                    />
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.userId}>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-gray-50 text-sm font-semibold text-gray-700 dark:border-dark-700/50 dark:bg-dark-800 dark:text-gray-200">
                              {(user.nickName || user.userName || '?')[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {user.nickName || '-'}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-sm text-gray-700 dark:text-gray-200">{user.userName}</TableCell>
                        <TableCell className="py-4 text-sm text-gray-600 dark:text-gray-300">{user.deptName || '-'}</TableCell>
                        <TableCell className="py-4 text-sm text-gray-600 dark:text-gray-300">{user.phonenumber || '-'}</TableCell>
                        <TableCell className="max-w-[220px] truncate py-4 text-sm text-gray-500 dark:text-gray-400" title={user.email || '-'}>
                          {user.email || '-'}
                        </TableCell>
                        <TableCell className="py-4">
                          {user.role ? (
                            <span className="rounded-full border border-gray-100 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-dark-700/50 dark:bg-dark-800 dark:text-gray-200">
                              {user.role}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getStatusBadgeClassName(user.status || '0'))}>
                            {user.status === '0' ? '正常' : '停用'}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          <TableRowActions
                            align="end"
                            actions={[
                              {
                                label: '详情',
                                icon: <Eye size={14} />,
                                onClick: () => setDetailUser(user),
                                tone: 'neutral',
                              },
                              {
                                label: '调岗',
                                icon: <ArrowRightLeft size={14} />,
                                onClick: () => setChangeDeptUser(user),
                                tone: 'neutral',
                              },
                              {
                                label: '删除',
                                icon: <Trash2 size={14} />,
                                onClick: () => setPendingDeleteUser(user),
                                tone: 'neutral',
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
};
