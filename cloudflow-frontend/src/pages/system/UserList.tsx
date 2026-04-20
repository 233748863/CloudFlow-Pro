import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Edit,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
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
  Textarea,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/common';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceDialogShell,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
} from '@/components/workspace';
import { toast } from 'sonner';
import {
  addUser,
  deleteUser,
  getDeptTree,
  getRoleList,
  getUserList,
  updateUser,
} from '../../services/api/auth';
import { getTenantList } from '../../services/api/tenant';
import { hashPassword } from '../../utils/crypto';
import { useMount } from '../../hooks/useMount';
import { cn } from '@/utils/cn';

interface DeptItem {
  deptId: number;
  parentId: number;
  deptName: string;
  orderNum: number;
  children?: DeptItem[];
}

interface RoleItem {
  roleId: number;
  roleName: string;
  roleKey: string;
  status: string;
}

interface TenantItem {
  tenantId: number;
  tenantName: string;
  status: string;
}

interface UserItem {
  userId: number;
  userName: string;
  nickName: string;
  email?: string;
  phonenumber?: string;
  password?: string;
  sex?: string;
  status: string;
  deptId?: number;
  deptName?: string;
  tenantId?: number;
  remark?: string;
  role?: string;
  roleIds?: number[] | string;
}

const DEFAULT_TENANT_VALUE = '__DEFAULT_TENANT__';
const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';
const subtlePanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';
const sectionPanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';
const nestedPanelClassName =
  'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/78';
const fieldLabelClassName =
  'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';
const radioPanelClassName =
  'flex gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/78';

const flattenDepts = (
  depts: DeptItem[],
  level = 0,
): { dept: DeptItem; level: number }[] => {
  const result: { dept: DeptItem; level: number }[] = [];
  for (const dept of depts) {
    result.push({ dept, level });
    if (dept.children?.length) {
      result.push(...flattenDepts(dept.children, level + 1));
    }
  }
  return result;
};

const normalizeNumberList = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => !Number.isNaN(item));
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => Number.parseInt(item.trim(), 10))
      .filter((item) => !Number.isNaN(item));
  }

  return [];
};

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const getUserStatusClassName = (status: string) =>
  status === '0'
    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
    : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';

const TreeSelect: React.FC<{
  value: number | undefined;
  onChange: (value: number) => void;
  deptTree: DeptItem[];
  placeholder?: string;
}> = ({ value, onChange, deptTree, placeholder = '请选择部门' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const flat = flattenDepts(deptTree);
  const selected = flat.find((item) => item.dept.deptId === value);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:border-slate-800 dark:bg-slate-950/78 dark:text-slate-200 dark:hover:border-slate-700 dark:focus:ring-cyan-950/40"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={selected ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}>
          {selected ? selected.dept.deptName : placeholder}
        </span>
        {open ? (
          <ChevronUp size={16} className="text-slate-400 dark:text-slate-500" />
        ) : (
          <ChevronDown size={16} className="text-slate-400 dark:text-slate-500" />
        )}
      </button>

      {open ? (
        <div className="absolute z-[140] mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_36px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/70 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-800/70">
          {flat.map(({ dept, level }) => (
            <button
              key={dept.deptId}
              type="button"
              className={cn(
                'flex w-full items-center rounded-xl px-3 py-2 text-sm transition',
                value === dept.deptId
                  ? 'bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900/80 dark:hover:text-slate-100',
              )}
              style={{ paddingLeft: `${level * 18 + 14}px` }}
              onClick={() => {
                onChange(dept.deptId);
                setOpen(false);
              }}
            >
              {dept.deptName}
            </button>
          ))}
          {flat.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">暂无部门</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export const UserList = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<UserItem | null>(null);
  const [formData, setFormData] = useState({
    userName: '',
    nickName: '',
    email: '',
    phonenumber: '',
    password: '',
    sex: '0',
    status: '0',
    deptId: undefined as number | undefined,
    tenantId: undefined as number | undefined,
    remark: '',
  });
  const [selRoles, setSelRoles] = useState<number[]>([]);

  useMount(() => {
    void fetchUsers();
    void fetchRoles();
    void fetchDeptTree();
    void fetchTenants();
  });

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response: any = await getUserList({ userName: searchTerm.trim() });
      const nextUsers = Array.isArray(response)
        ? response
        : response?.rows || response?.records || [];
      setUsers(nextUsers);
    } catch (err) {
      console.error(err);
      const message = '加载用户失败，请稍后重试';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response: any = await getRoleList();
      setRoles(Array.isArray(response) ? response : response?.rows || response?.records || []);
    } catch (err) {
      console.error(err);
      toast.error('加载角色失败');
    }
  };

  const fetchDeptTree = async () => {
    try {
      const response: any = await getDeptTree();
      setDeptTree(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error(err);
      toast.error('加载部门失败');
    }
  };

  const fetchTenants = async () => {
    try {
      const response: any = await getTenantList();
      setTenants(Array.isArray(response) ? response : response?.rows || response?.records || []);
    } catch (err) {
      console.error(err);
      toast.error('加载租户失败');
    }
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    await fetchUsers();
  };

  const handleRefresh = () => {
    void fetchUsers();
    void fetchRoles();
    void fetchDeptTree();
    void fetchTenants();
  };

  const handleOpenModal = (user?: UserItem) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        userName: user.userName || '',
        nickName: user.nickName || '',
        email: user.email || '',
        phonenumber: user.phonenumber || '',
        password: '',
        sex: user.sex || '0',
        status: user.status || '0',
        deptId: user.deptId,
        tenantId: user.tenantId,
        remark: user.remark || '',
      });
      setSelRoles(normalizeNumberList(user.roleIds));
    } else {
      setEditingUser(null);
      setFormData({
        userName: '',
        nickName: '',
        email: '',
        phonenumber: '',
        password: '',
        sex: '0',
        status: '0',
        deptId: undefined,
        tenantId: undefined,
        remark: '',
      });
      setSelRoles([]);
    }

    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.nickName.trim()) {
      toast.error('请输入用户昵称');
      return;
    }

    if (!editingUser && !formData.userName.trim()) {
      toast.error('请输入用户名');
      return;
    }

    try {
      if (editingUser) {
        const updateData: any = {
          ...formData,
          userId: editingUser.userId,
          roleIds: selRoles,
        };

        if (updateData.password) {
          updateData.password = await hashPassword(updateData.password);
        } else {
          delete updateData.password;
        }

        await updateUser(updateData);
        toast.success('用户更新成功');
      } else {
        const createData: any = {
          ...formData,
          roleIds: selRoles,
        };
        createData.password = await hashPassword(createData.password || '123456');
        await addUser(createData);
        toast.success('用户创建成功');
      }

      setIsModalOpen(false);
      await fetchUsers();
    } catch (err) {
      console.error(err);
      toast.error('保存用户失败');
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteUser) {
      return;
    }

    try {
      await deleteUser([pendingDeleteUser.userId]);
      toast.success('用户删除成功');
      setPendingDeleteUser(null);
      await fetchUsers();
    } catch (err) {
      console.error(err);
      toast.error('删除用户失败');
    }
  };

  const toggleRole = (roleId: number) => {
    setSelRoles((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  };

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const activeCount = users.filter((user) => user.status === '0').length;
  const disabledCount = users.filter((user) => user.status !== '0').length;
  const tenantCount = new Set(users.map((user) => user.tenantId).filter(Boolean)).size;
  const hasActiveFilters = Boolean(searchTerm.trim());
  const currentSearchLabel = searchTerm.trim() || '未设置';

  const overviewItems = [
    { label: '当前结果', value: `${users.length} 人` },
    { label: '正常账号', value: `${activeCount} 个` },
    { label: '停用账号', value: `${disabledCount} 个` },
    { label: '搜索关键词', value: currentSearchLabel },
  ];
  const heroMetrics = [
    {
      label: '用户规模',
      value: `${users.length}`,
      hint: '当前视图下已接入账号总量',
      icon: <UserRound size={17} />,
    },
    {
      label: '正常账号',
      value: `${activeCount}`,
      hint: '可正常登录和使用系统',
      icon: <ShieldCheck size={17} />,
    },
    {
      label: '停用账号',
      value: `${disabledCount}`,
      hint: '建议复核状态和角色分配',
      icon: <Trash2 size={17} />,
    },
    {
      label: '角色模板',
      value: `${roles.length}`,
      hint: `租户覆盖 ${tenantCount} 个`,
      icon: <Check size={17} />,
    },
  ];

  const isEdit = Boolean(editingUser);

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                <Users size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          )}
          title="用户管理"
          description="统一管理账号、组织归属、角色分配和租户信息，让 System 标准 CRUD 页面也回到和业务页一致的工作台结构。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="lg" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新数据
              </Button>
              <Button size="lg" onClick={() => handleOpenModal()}>
                <Plus size={15} />
                新增用户
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              System 用户工作台
            </span>
            <span className={surfaceChipClassName}>当前关键词：{currentSearchLabel}</span>
            <span className={surfaceChipClassName}>租户 {tenants.length} 个</span>
          </div>
        </WorkspaceHeroMetricsSection>

        <WorkspaceWorkbenchCard
          eyebrow="用户筛选"
          title="用户工作台"
          total={users.length}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          headerBadges={(
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <span className={surfaceChipClassName}>已配置角色 {roles.length} 个</span>
              <span className={surfaceChipClassName}>覆盖租户 {tenants.length} 个</span>
              <span className={surfaceChipClassName}>{hasActiveFilters ? '筛选结果' : '默认视图'}</span>
            </div>
          )}
          quickFilterAside={(
            <div className="flex flex-wrap items-center gap-2">
              {hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    void fetchUsers();
                  }}
                >
                  清空筛选
                </Button>
              ) : (
                <span className={surfaceChipClassName}>当前未应用额外筛选</span>
              )}
            </div>
          )}
          filterBar={(
            <form onSubmit={handleSearch} className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
                <Input
                  className="pl-9"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="按用户名或昵称搜索"
                />
              </div>
              <Button type="submit" className="xl:min-w-[120px]">
                <Search size={15} />
                搜索用户
              </Button>
              <Button type="button" variant="outline" className="xl:min-w-[120px]" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新
              </Button>
            </form>
          )}
        />

        <WorkspaceResultCard
          total={users.length}
          title="当前用户"
          description="统一展示账号、归属部门、角色和状态，操作反馈与业务申请页保持一致。"
        >
          <div className="space-y-4 px-4 py-4">
            {!loading && !error && users.length > 0 ? (
              <div className={subtlePanelClassName}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">用户结果概况</div>
                    <div className="flex flex-wrap gap-2">
                      <span className={surfaceChipClassName}>当前页 {users.length} 人</span>
                      <span className={surfaceChipClassName}>正常 {activeCount} 个</span>
                      <span className={surfaceChipClassName}>停用 {disabledCount} 个</span>
                      <span className={surfaceChipClassName}>租户覆盖 {tenantCount} 个</span>
                    </div>
                    <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                      表格、状态标签和编辑弹层统一使用同一套 System 标准 CRUD 语法，避免再次出现页面私有视觉体系。
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <Table className="min-w-[980px]">
              <TableHeader>
                <tr>
                  <TableHead>ID</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>昵称</TableHead>
                  <TableHead>租户</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableActionHead className="w-52">操作</TableActionHead>
                </tr>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <WorkspaceTableStateRow colSpan={8} type="loading" title="正在加载用户数据..." />
                ) : error ? (
                  <WorkspaceTableStateRow
                    colSpan={8}
                    title="用户数据加载失败"
                    description={error}
                  />
                ) : users.length === 0 ? (
                  <WorkspaceTableStateRow
                    colSpan={8}
                    title="暂无用户数据"
                    description="可以先创建账号，再分配角色和组织信息。"
                  />
                ) : (
                  users.map((user) => (
                    <TableRow key={user.userId}>
                      <TableCell className="py-4 text-sm text-slate-500 dark:text-slate-400">
                        {user.userId}
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                            {(user.nickName || user.userName || '?')[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {user.userName}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                              {user.email || user.phonenumber || '未补充联系方式'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                        {user.nickName || '-'}
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                        <div className="inline-flex items-center gap-2">
                          <Building2 size={14} className="text-slate-400 dark:text-slate-500" />
                          <span>
                            {tenants.find((tenant) => tenant.tenantId === user.tenantId)?.tenantName || '默认租户'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                        {user.deptName || '-'}
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                        {user.role ? (
                          <span className={surfaceChipClassName}>{user.role}</span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getUserStatusClassName(user.status))}>
                          {user.status === '0' ? '正常' : '停用'}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-right whitespace-nowrap">
                        <TableRowActions
                          align="end"
                          actions={[
                            {
                              label: '编辑',
                              icon: <Edit size={14} />,
                              onClick: () => handleOpenModal(user),
                              tone: 'primary',
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
        </WorkspaceResultCard>

        {isModalOpen ? (
          <WorkspaceDialogShell
            title={isEdit ? '编辑用户' : '新增用户'}
            description="按业务页一致的分段表单结构填写基础资料、组织归属和角色授权。"
            onClose={() => setIsModalOpen(false)}
            maxWidthClassName="max-w-4xl"
            headerAside={(
              <div className="flex flex-wrap gap-2">
                <span className={surfaceChipClassName}>{isEdit ? '编辑模式' : '新增模式'}</span>
                <span className={surfaceChipClassName}>已选角色 {selRoles.length} 个</span>
              </div>
            )}
            bodyClassName="space-y-6"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">基础资料</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    先确认用户名、昵称和联系方式，后续再补充组织与授权信息。
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClassName}>
                      用户昵称 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.nickName}
                      onChange={(event) => setFormData({ ...formData, nickName: event.target.value })}
                      placeholder="用户昵称"
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClassName}>
                      用户名 {!isEdit ? <span className="text-red-500">*</span> : null}
                    </label>
                    <Input
                      value={formData.userName}
                      onChange={(event) => setFormData({ ...formData, userName: event.target.value })}
                      placeholder="用户名"
                      disabled={isEdit}
                    />
                  </div>
                  {!isEdit ? (
                    <div>
                      <label className={fieldLabelClassName}>初始密码</label>
                      <Input
                        type="password"
                        value={formData.password}
                        onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                        placeholder="留空则默认使用 123456"
                      />
                    </div>
                  ) : null}
                  <div>
                    <label className={fieldLabelClassName}>手机号</label>
                    <Input
                      value={formData.phonenumber}
                      onChange={(event) => setFormData({ ...formData, phonenumber: event.target.value })}
                      placeholder="手机号"
                    />
                  </div>
                  <div className={isEdit ? 'md:col-span-2' : ''}>
                    <label className={fieldLabelClassName}>邮箱</label>
                    <Input
                      value={formData.email}
                      onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                      placeholder="邮箱"
                    />
                  </div>
                </div>
              </section>

              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">组织归属</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    将用户放到正确的部门和租户下，保证后续菜单权限和流程范围准确。
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClassName}>所属部门</label>
                    <TreeSelect
                      value={formData.deptId}
                      onChange={(value) => setFormData({ ...formData, deptId: value })}
                      deptTree={deptTree}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClassName}>所属租户</label>
                    <Select
                      value={formData.tenantId ? String(formData.tenantId) : DEFAULT_TENANT_VALUE}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          tenantId: value === DEFAULT_TENANT_VALUE ? undefined : Number(value),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择租户" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DEFAULT_TENANT_VALUE}>默认租户</SelectItem>
                        {tenants.map((tenant) => (
                          <SelectItem key={tenant.tenantId} value={String(tenant.tenantId)}>
                            {tenant.tenantName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className={fieldLabelClassName}>性别</label>
                    <div className={radioPanelClassName}>
                      {[
                        ['0', '男'],
                        ['1', '女'],
                      ].map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                          <input
                            type="radio"
                            checked={formData.sex === value}
                            onChange={() => setFormData({ ...formData, sex: value })}
                            className="accent-cyan-600 dark:accent-cyan-400"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={fieldLabelClassName}>状态</label>
                    <div className={radioPanelClassName}>
                      {[
                        ['0', '正常'],
                        ['1', '停用'],
                      ].map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                          <input
                            type="radio"
                            checked={formData.status === value}
                            onChange={() => setFormData({ ...formData, status: value })}
                            className="accent-cyan-600 dark:accent-cyan-400"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">角色授权</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    用更清晰的标签式交互分配角色，便于快速识别当前授权组合。
                  </div>
                </div>
                <div className={nestedPanelClassName}>
                  <div className="flex flex-wrap gap-2">
                    {roles.map((role) => (
                      <button
                        type="button"
                        key={role.roleId}
                        onClick={() => toggleRole(role.roleId)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                          selRoles.includes(role.roleId)
                            ? 'border-cyan-200 bg-cyan-50 text-cyan-700 shadow-sm dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-slate-100',
                        )}
                      >
                        {selRoles.includes(role.roleId) ? <Check size={12} className="mr-1 inline" /> : null}
                        {role.roleName}
                      </button>
                    ))}
                    {roles.length === 0 ? (
                      <span className="text-xs text-slate-400 dark:text-slate-500">暂无角色</span>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">备注</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    保留账号补充说明，方便后续审计和协作交接。
                  </div>
                </div>
                <Textarea
                  rows={3}
                  value={formData.remark}
                  onChange={(event) => setFormData({ ...formData, remark: event.target.value })}
                  placeholder="备注信息"
                />
              </section>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
                  取消
                </Button>
                <Button type="submit">{isEdit ? '保存修改' : '立即创建'}</Button>
              </div>
            </form>
          </WorkspaceDialogShell>
        ) : null}

        <ConfirmDialog
          open={Boolean(pendingDeleteUser)}
          title="确认删除用户"
          message={
            pendingDeleteUser
              ? `确定要删除用户“${pendingDeleteUser.nickName || pendingDeleteUser.userName}”吗？此操作不可恢复。`
              : ''
          }
          confirmText="确认删除"
          cancelText="取消"
          danger={true}
          onCancel={() => setPendingDeleteUser(null)}
          onConfirm={() => void handleDelete()}
        />
      </WorkspacePageContent>
    </div>
  );
};

export default UserList;
