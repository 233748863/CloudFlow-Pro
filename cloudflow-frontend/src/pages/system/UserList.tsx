import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import {
  Building2,
  Edit,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import {
  Button,
  Input,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import {
  addUser,
  deleteUser,
  getDeptTree,
  getRoleList,
  getUserList,
  resetUserPassword,
  updateUser,
} from '../../services/api/auth';
import { getTenantList } from '../../services/api/tenant';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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

type UserFilters = {
  keyword: string;
  status: string;
  roleId: string;
};

type UserQuery = UserFilters & {
  pageNum: number;
  pageSize: number;
};

const DEFAULT_TENANT_VALUE = '__DEFAULT_TENANT__';
const fieldLabelClassName = 'input-label';

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

const renderDeptOptionLabel = (dept: DeptItem, level: number) => (
  <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${level * 16}px` }}>
    {level > 0 ? <span className="h-px w-3 shrink-0 bg-slate-300 dark:bg-slate-700" /> : null}
    <span className={cn('truncate', level === 0 ? 'font-semibold' : 'font-medium')}>
      {dept.deptName}
    </span>
  </div>
);

const normalizeNumberList = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => !Number.isNaN(item));
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => Number.parseInt(item.trim(), 10))
      .filter((item) => !Number.isNaN(item));
  }

  return [];
};

const checkboxClassName =
  'h-4 w-4 shrink-0 rounded border-slate-300 accent-[#0d95b5] text-[#0d95b5] focus:ring-2 focus:ring-[#0d95b5]/30 focus:ring-offset-0 dark:border-slate-700 dark:bg-slate-950';

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <tr className="hover:bg-transparent dark:hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
    </td>
  </tr>
);

export const UserList = () => {
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<UserFilters>({
    keyword: '',
    status: '',
    roleId: '',
  });
  const [query, setQuery] = useState<UserQuery>({
    keyword: '',
    status: '',
    roleId: '',
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<UserItem | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserItem | null>(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({
    password: '',
    confirmPassword: '',
  });
  const [resettingPassword, setResettingPassword] = useState(false);
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
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);

  const normalizePagedResponse = <T,>(response: any): { rows: T[]; total: number } => {
    if (Array.isArray(response)) {
      return { rows: response as T[], total: response.length };
    }

    const rows = Array.isArray(response?.rows)
      ? response.rows
      : Array.isArray(response?.records)
        ? response.records
        : [];

    return {
      rows,
      total: typeof response?.total === 'number' ? response.total : rows.length,
    };
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getUserList();
      const normalized = normalizePagedResponse<UserItem>(response);
      setAllUsers(normalized.rows);
    } catch (fetchError) {
      console.error(fetchError);
      const message = '加载用户失败，请稍后重试。';
      setError(message);
      setAllUsers([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await getRoleList();
      const normalized = normalizePagedResponse<RoleItem>(response);
      setRoles(normalized.rows);
    } catch (fetchError) {
      console.error(fetchError);
      toast.error(getErrorMessage(fetchError, '加载角色失败'));
    }
  };

  const fetchDeptTree = async () => {
    try {
      const response: any = await getDeptTree();
      setDeptTree(Array.isArray(response) ? response : []);
    } catch (fetchError) {
      console.error(fetchError);
      toast.error(getErrorMessage(fetchError, '加载部门失败'));
    }
  };

  const fetchTenants = async () => {
    try {
      const response = await getTenantList({ pageNum: 1, pageSize: 200 });
      const normalized = normalizePagedResponse<TenantItem>(response);
      setTenants(normalized.rows);
    } catch (fetchError) {
      console.error(fetchError);
      toast.error(getErrorMessage(fetchError, '加载租户失败'));
    }
  };

  useEffect(() => {
    void fetchUsers();
    void fetchRoles();
    void fetchDeptTree();
    void fetchTenants();
  }, []);

  const deptOptions = useMemo(() => flattenDepts(deptTree), [deptTree]);

  const getRoleNames = (user: UserItem) => {
    const ids = normalizeNumberList(user.roleIds);
    const names = roles
      .filter((role) => ids.includes(role.roleId))
      .map((role) => role.roleName);

    if (names.length > 0) {
      return names;
    }

    return user.role ? [user.role] : [];
  };

  const filteredUsers = useMemo(() => {
    const keyword = query.keyword.trim().toLowerCase();

    return allUsers.filter((user) => {
      const matchesKeyword = keyword
        ? [user.userName, user.nickName, user.email, user.phonenumber]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword))
        : true;

      const matchesStatus = query.status ? user.status === query.status : true;

      const roleIds = normalizeNumberList(user.roleIds);
      const matchesRole = query.roleId ? roleIds.includes(Number(query.roleId)) : true;

      return matchesKeyword && matchesStatus && matchesRole;
    });
  }, [allUsers, query.keyword, query.roleId, query.status]);

  const total = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const startIndex = (query.pageNum - 1) * query.pageSize;
  const users = filteredUsers.slice(startIndex, startIndex + query.pageSize);

  const hasActiveFilters = Boolean(query.keyword || query.status || query.roleId);
  const isEdit = Boolean(editingUser);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      keyword: filters.keyword.trim(),
      status: filters.status,
      roleId: filters.roleId,
    }));
  };

  const clearFilters = () => {
    const nextFilters = { keyword: '', status: '', roleId: '' };
    setFilters(nextFilters);
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      keyword: '',
      status: '',
      roleId: '',
    }));
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
      setSelectedRoleIds(normalizeNumberList(user.roleIds));
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
      setSelectedRoleIds([]);
    }

    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
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
    setSelectedRoleIds([]);
  };

  const toggleRole = (roleId: number) => {
    setSelectedRoleIds((current) =>
      current.includes(roleId)
        ? current.filter((id) => id !== roleId)
        : [...current, roleId],
    );
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
          roleIds: selectedRoleIds,
        };
        if (!updateData.password) {
          delete updateData.password;
        }

        await updateUser(updateData);
        toast.success('用户更新成功');
      } else {
        const createData: any = {
          ...formData,
          roleIds: selectedRoleIds,
        };
        if (!createData.password) {
          delete createData.password;
        }
        await addUser(createData);
        toast.success('用户创建成功');
      }

      handleCloseModal();
      await fetchUsers();
    } catch (submitError) {
      console.error(submitError);
      toast.error(getErrorMessage(submitError, '保存用户失败'));
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
    } catch (deleteError) {
      console.error(deleteError);
      toast.error(getErrorMessage(deleteError, '删除用户失败'));
    }
  };

  const handleOpenResetPassword = (user: UserItem) => {
    setResetPasswordUser(user);
    setResetPasswordForm({ password: '', confirmPassword: '' });
  };

  const handleCloseResetPassword = () => {
    if (resettingPassword) {
      return;
    }
    setResetPasswordUser(null);
    setResetPasswordForm({ password: '', confirmPassword: '' });
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetPasswordUser) {
      return;
    }

    const password = resetPasswordForm.password.trim();
    if (password.length < 6) {
      toast.error('新密码至少 6 位');
      return;
    }

    if (password !== resetPasswordForm.confirmPassword.trim()) {
      toast.error('两次输入的新密码不一致');
      return;
    }

    setResettingPassword(true);
    try {
      await resetUserPassword(resetPasswordUser.userId, password);
      toast.success('密码已重置');
      setResetPasswordUser(null);
      setResetPasswordForm({ password: '', confirmPassword: '' });
    } catch (resetError) {
      console.error(resetError);
      toast.error(getErrorMessage(resetError, '重置密码失败'));
    } finally {
      setResettingPassword(false);
    }
  };

  const tenantNameById = (tenantId?: number) =>
    tenants.find((tenant) => tenant.tenantId === tenantId)?.tenantName || '默认租户';

  const stats = useMemo(
    () => [
      {
        label: '总用户',
        value: String(allUsers.length),
        meta: `当前筛选 ${total}`,
        icon: <Users size={18} />,
        tone: 'blue',
      },
      {
        label: '正常用户',
        value: String(allUsers.filter((user) => user.status === '0').length),
        meta: '可登录账号',
        icon: <ShieldCheck size={18} />,
        tone: 'green',
      },
      {
        label: '停用用户',
        value: String(allUsers.filter((user) => user.status !== '0').length),
        meta: '受限账号',
        icon: <UserRound size={18} />,
        tone: 'amber',
      },
      {
        label: '租户范围',
        value: String(Math.max(tenants.length, 1)),
        meta: '含默认租户',
        icon: <Building2 size={18} />,
        tone: 'violet',
      },
    ],
    [allUsers, tenants.length, total],
  );

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">USER MANAGEMENT</p>
          <h2>用户管理</h2>
          <span>管理用户账号、角色、部门、租户和登录状态</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button size="sm" onClick={() => handleOpenModal()}>
            <Plus size={16} />
            新增用户
          </Button>
        </div>
      </header>

      <section className="admin-users-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={cn('card admin-source-stat', `admin-source-tone-${stat.tone}`)}>
            <div className="admin-source-stat-icon">{stat.icon}</div>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form onSubmit={handleSearch} className="admin-users-filter-grid">
        <label className="admin-source-search">
          <span className={fieldLabelClassName}>搜索用户</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.keyword}
              onChange={(event) =>
                setFilters((current) => ({ ...current, keyword: event.target.value }))
              }
              placeholder="用户名、昵称、邮箱或手机号"
              type="search"
            />
          </div>
        </label>

        <label>
          <span className={fieldLabelClassName}>角色</span>
          <Select
            value={filters.roleId}
            onValueChange={(value) =>
              setFilters((current) => ({ ...current, roleId: value }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部角色" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部角色</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role.roleId} value={String(role.roleId)}>
                  {role.roleName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label>
          <span className={fieldLabelClassName}>状态</span>
          <Select
            value={filters.status}
            onValueChange={(value) =>
              setFilters((current) => ({ ...current, status: value }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部状态</SelectItem>
              <SelectItem value="0">正常</SelectItem>
              <SelectItem value="1">停用</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">当前 {total} 项</span>
          <Button type="submit" size="sm">
            查询
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
          >
            重置
          </Button>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="admin-users-table-panel">
      <table className="unity-data-table admin-source-table admin-users-table">
          <thead>
            <tr>
              <th>用户</th>
              <th>ID</th>
              <th>昵称</th>
              <th>租户</th>
              <th>部门</th>
              <th>角色</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={8} title="正在加载用户数据..." loading />
            ) : error ? (
              <TableStateRow colSpan={8} title="用户数据加载失败" description={error} />
            ) : users.length === 0 ? (
              <TableStateRow colSpan={8} title="暂无用户数据" />
            ) : (
              users.map((user) => {
                const roleNames = getRoleNames(user);
                return (
                  <tr key={user.userId}>
                    <td>
                      <div className="admin-users-identity">
                        <span className="admin-users-avatar">
                          {(user.nickName || user.userName || '?')[0]}
                        </span>
                        <div className="admin-users-identity-copy">
                          <strong>{user.userName}</strong>
                          <small>
                            {user.email || user.phonenumber || '未补充联系方式'}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-xs">U-{user.userId}</td>
                    <td>{user.nickName || '-'}</td>
                    <td>{tenantNameById(user.tenantId)}</td>
                    <td>{user.deptName || '-'}</td>
                    <td>
                      {roleNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {roleNames.slice(0, 2).map((roleName) => (
                            <span key={`${user.userId}-${roleName}`} className="badge badge-gray">
                              {roleName}
                            </span>
                          ))}
                          {roleNames.length > 2 ? (
                            <span className="badge badge-gray">+{roleNames.length - 2}</span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="admin-users-muted">无角色</span>
                      )}
                    </td>
                    <td>
                      <span className="admin-users-status">
                        <i className={user.status === '0' ? 'active' : 'disabled'} />
                        {user.status === '0' ? '正常' : '停用'}
                      </span>
                    </td>
                    <td>
                      <div className="admin-users-row-actions">
                        <button type="button" title="编辑用户" onClick={() => handleOpenModal(user)}>
                          <Edit size={15} />
                        </button>
                        <button type="button" title="重置密码" onClick={() => handleOpenResetPassword(user)}>
                          <KeyRound size={15} />
                        </button>
                        <button
                          type="button"
                          className="danger"
                          title="删除用户"
                          onClick={() => setPendingDeleteUser(user)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      total={total}
      page={query.pageNum}
      pageSize={query.pageSize}
      onPageChange={(pageNum) =>
        setQuery((current) => ({ ...current, pageNum }))
      }
      onPageSizeChange={(pageSize) =>
        setQuery((current) => ({
          ...current,
          pageNum: 1,
          pageSize,
        }))
      }
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-users-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={isModalOpen}
        title={isEdit ? '编辑用户' : '新增用户'}
        onClose={handleCloseModal}
        maxWidthClassName="max-w-4xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleCloseModal}>
              取消
            </Button>
            <Button onClick={() => void 0} type="submit" form="user-form">
              {isEdit ? '保存修改' : '创建用户'}
            </Button>
          </div>
        }
      >
        <form id="user-form" onSubmit={handleSubmit} className="admin-source-form-grid">
            <label>
              <span className={fieldLabelClassName}>
                用户名 {!isEdit ? <span className="text-rose-500">*</span> : null}
              </span>
              <Input
                value={formData.userName}
                disabled={isEdit}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, userName: event.target.value }))
                }
                placeholder="请输入用户名"
              />
            </label>

            <label>
              <span className={fieldLabelClassName}>
                用户昵称 <span className="text-rose-500">*</span>
              </span>
              <Input
                value={formData.nickName}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, nickName: event.target.value }))
                }
                placeholder="请输入用户昵称"
              />
            </label>

            <label>
              <span className={fieldLabelClassName}>邮箱</span>
              <Input
                value={formData.email}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="请输入邮箱"
              />
            </label>

            <label>
              <span className={fieldLabelClassName}>手机号</span>
              <Input
                value={formData.phonenumber}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, phonenumber: event.target.value }))
                }
                placeholder="请输入手机号"
              />
            </label>

            <label>
              <span className={fieldLabelClassName}>
                {isEdit ? '重置密码' : '登录密码'}
              </span>
              <Input
                type="password"
                value={formData.password}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, password: event.target.value }))
                }
                placeholder={isEdit ? '留空则不修改密码' : '留空使用系统初始密码'}
              />
            </label>

            <label>
              <span className={fieldLabelClassName}>性别</span>
              <Select
                value={formData.sex}
                onValueChange={(value) =>
                  setFormData((current) => ({ ...current, sex: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择性别" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">男</SelectItem>
                  <SelectItem value="1">女</SelectItem>
                  <SelectItem value="2">未知</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label>
              <span className={fieldLabelClassName}>状态</span>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData((current) => ({ ...current, status: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">正常</SelectItem>
                  <SelectItem value="1">停用</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label>
              <span className={fieldLabelClassName}>所属租户</span>
              <Select
                value={formData.tenantId ? String(formData.tenantId) : DEFAULT_TENANT_VALUE}
                onValueChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    tenantId: value === DEFAULT_TENANT_VALUE ? undefined : Number(value),
                  }))
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
            </label>

            <label>
              <span className={fieldLabelClassName}>归属部门</span>
              <Select
                value={formData.deptId ? String(formData.deptId) : ''}
                onValueChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    deptId: value ? Number(value) : undefined,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择部门" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="">不指定部门</SelectItem>
                  {deptOptions.map(({ dept, level }) => (
                    <SelectItem
                      key={dept.deptId}
                      value={String(dept.deptId)}
                      label={dept.deptName}
                      className={cn(
                        'pl-3',
                        level === 0 ? 'font-semibold' : 'text-slate-600 dark:text-slate-300',
                      )}
                    >
                      {renderDeptOptionLabel(dept, level)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label>
              <span className={fieldLabelClassName}>备注</span>
              <Textarea
                rows={4}
                className="resize-none"
                value={formData.remark}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, remark: event.target.value }))
                }
              />
            </label>

          <div className="admin-source-form-wide">
            <label className={fieldLabelClassName}>角色分配</label>
            <div className="admin-users-group-picker">
              {roles.length > 0 ? (
                <>
                  {roles.map((role) => {
                    const checked = selectedRoleIds.includes(role.roleId);
                    return (
                      <button
                        key={role.roleId}
                        type="button"
                        className={cn(checked && 'active')}
                        aria-pressed={checked}
                        onClick={() => toggleRole(role.roleId)}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRole(role.roleId)}
                          onClick={(event) => event.stopPropagation()}
                          className={checkboxClassName}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{role.roleName}</div>
                          <div className="truncate text-xs opacity-80">{role.roleKey}</div>
                        </div>
                      </button>
                    );
                  })}
                </>
              ) : (
                <div className="px-2 py-4 text-center text-sm text-slate-400 dark:text-slate-500">
                  暂无角色数据
                </div>
              )}
            </div>
          </div>
        </form>
      </BaseDialog>

      <BaseDialog
        open={Boolean(resetPasswordUser)}
        title="重置用户密码"
        description={
          resetPasswordUser
            ? `无需旧密码，直接为“${resetPasswordUser.nickName || resetPasswordUser.userName}”设置新登录密码。`
            : undefined
        }
        onClose={handleCloseResetPassword}
        maxWidthClassName="max-w-md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleCloseResetPassword} disabled={resettingPassword}>
              取消
            </Button>
            <Button type="submit" form="reset-user-password-form" disabled={resettingPassword}>
              {resettingPassword ? '重置中...' : '确认重置'}
            </Button>
          </div>
        }
      >
        <form id="reset-user-password-form" onSubmit={handleResetPassword} className="admin-dialog-stack">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            重置后原密码立即失效，用户下次登录需使用新密码。
          </div>
          <div>
            <label className={fieldLabelClassName}>
              新密码 <span className="text-rose-500">*</span>
            </label>
            <Input
              type="password"
              value={resetPasswordForm.password}
              onChange={(event) =>
                setResetPasswordForm((current) => ({ ...current, password: event.target.value }))
              }
              autoComplete="new-password"
              placeholder="请输入新密码"
              required
            />
          </div>
          <div>
            <label className={fieldLabelClassName}>
              确认新密码 <span className="text-rose-500">*</span>
            </label>
            <Input
              type="password"
              value={resetPasswordForm.confirmPassword}
              onChange={(event) =>
                setResetPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
              }
              autoComplete="new-password"
              placeholder="请再次输入新密码"
              required
            />
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDeleteUser)}
        title="删除用户"
        message={
          pendingDeleteUser
            ? `确定删除用户“${pendingDeleteUser.nickName || pendingDeleteUser.userName}”吗？删除后将无法恢复。`
            : ''
        }
        confirmText="确认删除"
        cancelText="取消"
        danger
        onCancel={() => setPendingDeleteUser(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
};

export default UserList;
