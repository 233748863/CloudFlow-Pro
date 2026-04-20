import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  GitBranch,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common';
import {
  Button,
  Input,
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
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceInlineState,
  WorkspaceSectionCard,
  WorkspaceTableStateRow,
} from '@/components/workspace';
import { addDept, deleteDept, getDeptTree, getUserList, updateDept, updateUser, deleteUser } from '../services/api/auth';
import { cn } from '@/utils/cn';

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

const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';
const subtlePanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';
const nestedPanelClassName =
  'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88';
const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

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

// 保留祖先链路，确保树搜索后仍然能看出部门层级来源。
const filterDeptTree = (depts: DeptItem[], keyword: string): DeptItem[] => {
  if (!keyword.trim()) return depts;

  const normalized = keyword.trim().toLowerCase();

  return depts
    .map((dept) => {
      const children = filterDeptTree(dept.children || [], keyword);
      const matchesSelf =
        dept.deptName.toLowerCase().includes(normalized) ||
        String(dept.deptId).includes(normalized) ||
        String(dept.leader || '').toLowerCase().includes(normalized);

      if (!matchesSelf && children.length === 0) {
        return null;
      }

      return {
        ...dept,
        children,
      };
    })
    .filter((dept): dept is DeptItem => dept !== null);
};

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
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 shadow-sm transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600"
      >
        <span className="truncate">
          {selected?.dept.deptName || (value === 0 && showRoot ? '顶级部门' : placeholder)}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_36px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_24px_48px_rgba(2,6,23,0.46)]">
          {showRoot ? (
            <button
              type="button"
              onClick={() => {
                onChange(0);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center rounded-xl px-3 py-2 text-sm transition',
                value === 0
                  ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200'
                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900',
              )}
            >
              顶级部门
            </button>
          ) : null}

          {flatDepartments.map(({ dept, level }) => (
            <button
              key={dept.deptId}
              type="button"
              onClick={() => {
                onChange(dept.deptId);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center rounded-xl px-3 py-2 text-sm transition',
                value === dept.deptId
                  ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200'
                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900',
              )}
              style={{ paddingLeft: `${level * 18 + 12}px` }}
            >
              {dept.deptName}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

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
      description="统一维护部门名称、层级、负责人和联系方式，让组织结构页回到和其他 System 页面一致的弹层语法。"
      maxWidthClassName="max-w-4xl"
      headerAside={
        <div className="flex flex-wrap gap-2">
          <span className={surfaceChipClassName}>{editing ? '编辑模式' : '新增模式'}</span>
          <span className={surfaceChipClassName}>状态：{form.status === '0' ? '正常' : '停用'}</span>
        </div>
      }
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
            {editing ? '保存修改' : '立即创建'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <section className={subtlePanelClassName}>
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              Hierarchy
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">层级与基础信息</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              先定义父级部门和部门名称，再补充负责人与联系方式，避免组织树层级和部门信息分散维护。
            </div>
          </div>

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
          </div>
        </section>

        <section className={subtlePanelClassName}>
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              Contact
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">负责人和联系方式</div>
          </div>

          <div className={nestedPanelClassName}>
            <div className="grid gap-4 md:grid-cols-3">
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
              <div>
                <label className={fieldLabelClassName}>邮箱</label>
                <Input
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="联系邮箱"
                />
              </div>
            </div>
          </div>
        </section>
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
      description="组织结构页内直接查看账号、归属部门和状态信息，减少跨页跳转。"
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
          <div className={subtlePanelClassName}>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-lg font-semibold text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200">
                {(user.nickName || user.userName || '?')[0]}
              </div>
              <div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {user.nickName || user.userName}
                </div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">用户 ID：{user.userId}</div>
              </div>
            </div>
          </div>

          <div className={nestedPanelClassName}>
            <div className="grid gap-3 md:grid-cols-2">
              {fields.map((field) => (
                <div key={field.label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    {field.label}
                  </div>
                  <div className="mt-1.5 text-sm text-slate-900 dark:text-slate-100">
                    {field.type === 'role' && field.value !== '-' ? (
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200">
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

  useEffect(() => {
    if (!open || !user) return;
    setTargetDeptId(user.deptId);
  }, [open, user]);

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title="调整部门"
      description="直接在组织结构页内调整用户所属部门，确保树结构和成员归属保持一致。"
      maxWidthClassName="max-w-xl"
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
        <div className="space-y-4">
          <div className={subtlePanelClassName}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-sm font-semibold text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200">
                {(user.nickName || user.userName || '?')[0]}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{user.nickName || user.userName}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">当前部门：{user.deptName || '-'}</div>
              </div>
            </div>
          </div>

          <div>
            <label className={fieldLabelClassName}>目标部门</label>
            <DepartmentSelect
              value={targetDeptId}
              onChange={setTargetDeptId}
              deptTree={deptTree}
              showRoot={false}
              placeholder="请选择目标部门"
            />
          </div>
        </div>
      ) : null}
    </BaseDialog>
  );
};

const DeptNode: React.FC<{
  dept: DeptItem;
  level?: number;
  selectedDeptId: number | null;
  onSelect: (dept: DeptItem) => void;
  onEdit: (dept: DeptItem) => void;
  onDelete: (dept: DeptItem) => void;
  onAddChild: (dept: DeptItem) => void;
}> = ({ dept, level = 0, selectedDeptId, onSelect, onEdit, onDelete, onAddChild }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = Boolean(dept.children?.length);
  const isSelected = selectedDeptId === dept.deptId;

  return (
    <div className="select-none">
      <div
        className={cn(
          'group flex items-center gap-2 rounded-xl px-2 py-1.5 transition',
          isSelected
            ? 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/20 dark:text-cyan-200'
            : 'text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-950/78',
        )}
        style={{ paddingLeft: `${level * 18 + 8}px` }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) {
              setExpanded((prev) => !prev);
            }
          }}
          className="flex h-4 w-4 items-center justify-center text-slate-400 dark:text-slate-500"
        >
          {hasChildren ? expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span className="w-3" />}
        </button>

        <button
          type="button"
          onClick={() => onSelect(dept)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Building2 size={15} className={isSelected ? 'text-cyan-600 dark:text-cyan-300' : 'text-slate-400 dark:text-slate-500'} />
          <span className="truncate text-sm font-medium">{dept.deptName}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', getStatusBadgeClassName(dept.status || '0'))}>
            {(dept.status || '0') === '0' ? '正常' : '停用'}
          </span>
        </button>

        <div className="hidden items-center gap-1 opacity-0 transition group-hover:flex group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full"
            onClick={(event) => {
              event.stopPropagation();
              onAddChild(dept);
            }}
            title="新增子部门"
          >
            <Plus size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(dept);
            }}
            title="编辑部门"
          >
            <UserRound size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full text-rose-500 hover:text-rose-600"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(dept);
            }}
            title="删除部门"
          >
            <Trash2 size={13} />
          </Button>
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
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const OrgStructure: React.FC<OrgStructureProps> = ({
  refreshSignal = 0,
  onStatsChange,
}) => {
  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);
  const [deptLoading, setDeptLoading] = useState(true);
  const [deptError, setDeptError] = useState<string | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
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
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <WorkspaceSectionCard
        eyebrow="Departments"
        title="部门树"
        description="统一浏览部门层级、负责人和状态，并在同一入口完成新增、编辑和删除动作。"
        headerAside={
          <div className="flex flex-wrap gap-2">
            <span className={surfaceChipClassName}>部门 {totalDepartments} 个</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingDept(null);
                setDefaultParentId(0);
                setDeptFormOpen(true);
              }}
            >
              <Plus size={14} />
              新增部门
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className={subtlePanelClassName}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  当前视图
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedDept?.deptName || '全部部门'}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  活跃部门
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {activeDepartments} / {totalDepartments}
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              value={deptSearch}
              onChange={(event) => setDeptSearch(event.target.value)}
              className="pl-10"
              placeholder="搜索部门名称或负责人"
            />
          </div>

          <div className={cn(subtlePanelClassName, 'max-h-[72vh] overflow-y-auto')}>
            {deptLoading ? (
              <WorkspaceInlineState
                type="loading"
                icon={<Loader2 className="h-4 w-4 animate-spin" />}
                title="正在加载部门树..."
                className="py-12"
              />
            ) : deptError ? (
              <WorkspaceInlineState
                type="info"
                icon={<Building2 className="h-5 w-5" />}
                title="部门树加载失败"
                description={deptError}
                className="py-12"
              />
            ) : filteredDeptTree.length === 0 ? (
              <WorkspaceInlineState
                icon={<Building2 className="h-5 w-5" />}
                title="暂无匹配部门"
                description={deptSearch ? '请调整部门搜索条件后重试。' : '当前还没有部门数据。'}
                className="py-12"
              />
            ) : (
              <div className="space-y-1">
                {filteredDeptTree.map((dept) => (
                  <DeptNode
                    key={dept.deptId}
                    dept={dept}
                    selectedDeptId={selectedDeptId}
                    onSelect={(item) =>
                      setSelectedDeptId((prev) => (prev === item.deptId ? null : item.deptId))
                    }
                    onEdit={(item) => {
                      setEditingDept(item);
                      setDeptFormOpen(true);
                    }}
                    onDelete={setPendingDeleteDept}
                    onAddChild={(item) => {
                      setEditingDept(null);
                      setDefaultParentId(item.deptId);
                      setDeptFormOpen(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </WorkspaceSectionCard>

      <WorkspaceSectionCard
        eyebrow="Members"
        title={selectedDept ? `${selectedDept.deptName} 成员` : '全部成员'}
        description="右侧统一查看成员信息、归属部门和组织调整动作，保持树结构与成员列表在同一工作区联动。"
        headerAside={
          <div className="flex flex-wrap gap-2">
            <span className={surfaceChipClassName}>当前结果 {filteredUsers.length} 人</span>
            <span className={surfaceChipClassName}>启用成员 {activeUsers} 人</span>
          </div>
        }
      >
        <div className="space-y-4">
          <div className={subtlePanelClassName}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">成员视图概况</div>
                <div className="flex flex-wrap gap-2">
                  <span className={surfaceChipClassName}>范围：{selectedDept?.deptName || '全部用户'}</span>
                  <span className={surfaceChipClassName}>已加载 {users.length} 人</span>
                  <span className={surfaceChipClassName}>筛选后 {filteredUsers.length} 人</span>
                </div>
                <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                  用户详情、部门调整和删除动作已经收口到统一的表格与弹层语法，后续组织与用户相关页面都应沿用这套结构。
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
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
                <WorkspaceTableStateRow
                  colSpan={8}
                  type="loading"
                  title="正在加载成员列表..."
                />
              ) : userError ? (
                <WorkspaceTableStateRow
                  colSpan={8}
                  title="成员列表加载失败"
                  description={userError}
                />
              ) : filteredUsers.length === 0 ? (
                <WorkspaceTableStateRow
                  colSpan={8}
                  title="暂无成员数据"
                  description={userSearch ? '请调整成员搜索条件后重试。' : selectedDept ? '当前部门暂无成员。' : '当前没有可展示的成员数据。'}
                />
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-sm font-semibold text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200">
                          {(user.nickName || user.userName || '?')[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {user.nickName || '-'}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                            {user.createTime || '未记录创建时间'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 text-sm text-slate-700 dark:text-slate-200">{user.userName}</TableCell>
                    <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">{user.deptName || '-'}</TableCell>
                    <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">{user.phonenumber || '-'}</TableCell>
                    <TableCell className="max-w-[220px] truncate py-4 text-sm text-slate-500 dark:text-slate-400" title={user.email || '-'}>
                      {user.email || '-'}
                    </TableCell>
                    <TableCell className="py-4">
                      {user.role ? (
                        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200">
                          {user.role}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400 dark:text-slate-500">-</span>
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
                            tone: 'info',
                          },
                          {
                            label: '调岗',
                            icon: <ArrowRightLeft size={14} />,
                            onClick: () => setChangeDeptUser(user),
                            tone: 'warning',
                          },
                          {
                            label: '删除',
                            icon: <Trash2 size={14} />,
                            onClick: () => setPendingDeleteUser(user),
                            tone: 'danger',
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
      </WorkspaceSectionCard>

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
            ? `确定要删除部门“${pendingDeleteDept.deptName}”吗？该操作不可恢复。`
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
            ? `确定要删除用户“${pendingDeleteUser.nickName || pendingDeleteUser.userName}”吗？该操作不可恢复。`
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
