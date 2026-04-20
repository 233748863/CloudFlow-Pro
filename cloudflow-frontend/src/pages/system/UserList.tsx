import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Edit,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceDialogShell,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
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

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const TreeSelect: React.FC<{
  value: number | undefined;
  onChange: (value: number) => void;
  deptTree: DeptItem[];
  placeholder?: string;
}> = ({ value, onChange, deptTree, placeholder = '请选择部门' }) => {
  const [open, setOpen] = useState(false);
  const flat = flattenDepts(deptTree);
  const selected = flat.find((item) => item.dept.deptId === value);

  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 shadow-sm transition hover:border-slate-300 focus:outline-none"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? selected.dept.deptName : placeholder}
        </span>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>

      {open ? (
        <div className="absolute z-[140] mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_36px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/70">
          {flat.map(({ dept, level }) => (
            <button
              key={dept.deptId}
              type="button"
              className={`flex w-full items-center rounded-xl px-3 py-2 text-sm transition ${
                value === dept.deptId
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`}
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
            <div className="px-3 py-2 text-sm text-slate-400">暂无部门</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export const UserList = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
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
    try {
      const response = await getUserList({ userName: searchTerm });
      setUsers(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error(error);
      toast.error('加载用户失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response: any = await getRoleList();
      setRoles(Array.isArray(response) ? response : response?.rows || response?.records || []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchDeptTree = async () => {
    try {
      const response: any = await getDeptTree();
      setDeptTree(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchTenants = async () => {
    try {
      const response: any = await getTenantList();
      setTenants(Array.isArray(response) ? response : response?.rows || response?.records || []);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    await fetchUsers();
  };

  const handleOpenModal = (user?: any) => {
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
      setSelRoles(user.roleIds || []);
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
        const updateData: any = { ...formData, userId: editingUser.userId, roleIds: selRoles };
        if (updateData.password) {
          updateData.password = await hashPassword(updateData.password);
        } else {
          delete updateData.password;
        }
        await updateUser(updateData);
        toast.success('用户更新成功');
      } else {
        const createData: any = { ...formData, roleIds: selRoles };
        createData.password = await hashPassword(createData.password || '123456');
        await addUser(createData);
        toast.success('用户创建成功');
      }

      setIsModalOpen(false);
      await fetchUsers();
    } catch (error) {
      console.error(error);
      toast.error('保存用户失败');
    }
  };

  const handleDelete = async (userId: number) => {
    if (!window.confirm('确认删除该用户吗？')) {
      return;
    }

    try {
      await deleteUser([userId]);
      toast.success('用户删除成功');
      await fetchUsers();
    } catch (error) {
      console.error(error);
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

  const overviewItems = [
    { label: '用户总数', value: `${users.length} 人` },
    { label: '正常账号', value: `${activeCount} 个` },
    { label: '停用账号', value: `${disabledCount} 个` },
    { label: '租户覆盖', value: `${tenantCount} 个` },
  ];
  const heroMetrics = [
    {
      label: '用户规模',
      value: `${users.length}`,
      hint: '当前已接入账号总量',
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
      hint: '需要复核状态或权限',
      icon: <Trash2 size={17} />,
    },
    {
      label: '角色模板',
      value: `${roles.length}`,
      hint: '用于用户授权的角色数量',
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
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <Users size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                {timeLabel}
              </span>
            </div>
          )}
          title="用户管理"
          description="统一管理账号、组织归属、角色分配和租户信息，让系统侧页面也保持和业务申请页一致的工作台结构。"
          actions={(
            <Button size="lg" onClick={() => handleOpenModal()}>
              <Plus size={15} />
              新增用户
            </Button>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        />

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="用户列表"
              total={users.length}
              hasActiveFilters={hasActiveFilters}
              overviewItems={overviewItems}
              headerBadges={(
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
                    已配置 {roles.length} 个角色
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500">
                    覆盖 {tenants.length} 个租户
                  </span>
                </div>
              )}
              quickFilterAside={hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={() => { setSearchTerm(''); void fetchUsers(); }}>
                  清空筛选
                </Button>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400">
                  当前未应用额外筛选
                </span>
              )}
              filterBar={(
                <form onSubmit={handleSearch} className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      className="pl-9"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="按用户名或昵称搜索"
                    />
                  </div>
                  <Button type="submit">
                    <Search size={15} />
                    搜索用户
                  </Button>
                </form>
              )}
            />

            <WorkspaceResultCard
              total={users.length}
              description="统一展示账号、归属部门、角色和状态，操作反馈与业务页保持一致。"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px]">
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
                  <tbody className="divide-y divide-white/60">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={8} type="loading" title="正在加载用户数据..." />
                    ) : users.length === 0 ? (
                      <WorkspaceTableStateRow colSpan={8} title="暂无用户数据" description="可以先创建账号，再分配角色和组织信息。" />
                    ) : (
                      users.map((user) => (
                        <tr key={user.userId} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm text-slate-500">{user.userId}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                                {(user.nickName || user.userName || '?')[0]}
                              </div>
                              <span>{user.userName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{user.nickName || '-'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {tenants.find((tenant) => tenant.tenantId === user.tenantId)?.tenantName || '默认租户'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{user.deptName || '-'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {user.role ? (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                                {user.role}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              user.status === '0'
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                : 'bg-rose-50 text-rose-600 ring-1 ring-rose-100'
                            }`}>
                              {user.status === '0' ? '正常' : '停用'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
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
                                  onClick: () => handleDelete(user.userId),
                                  tone: 'danger',
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </WorkspaceResultCard>
          </div>
        </Card>

        {isModalOpen ? (
          <WorkspaceDialogShell
            title={isEdit ? '编辑用户' : '新增用户'}
            description="按业务页一致的分段表单结构填写基础资料、组织归属和角色授权。"
            onClose={() => setIsModalOpen(false)}
            maxWidthClassName="max-w-4xl"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">基础资料</div>
                  <div className="mt-1 text-sm text-slate-500">先确认用户名、昵称和联系方式，后续再补充组织与授权信息。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      用户昵称 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.nickName}
                      onChange={(event) => setFormData({ ...formData, nickName: event.target.value })}
                      placeholder="用户昵称"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
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
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">初始密码</label>
                      <Input
                        type="password"
                        value={formData.password}
                        onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                        placeholder="留空则默认使用 123456"
                      />
                    </div>
                  ) : null}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">手机号</label>
                    <Input
                      value={formData.phonenumber}
                      onChange={(event) => setFormData({ ...formData, phonenumber: event.target.value })}
                      placeholder="手机号"
                    />
                  </div>
                  <div className={isEdit ? 'md:col-span-2' : ''}>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">邮箱</label>
                    <Input
                      value={formData.email}
                      onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                      placeholder="邮箱"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">组织归属</div>
                  <div className="mt-1 text-sm text-slate-500">将用户放到正确的部门和租户下，保证后续菜单权限和流程范围准确。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">所属部门</label>
                    <TreeSelect
                      value={formData.deptId}
                      onChange={(value) => setFormData({ ...formData, deptId: value })}
                      deptTree={deptTree}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">所属租户</label>
                    <Select
                      value={formData.tenantId ? String(formData.tenantId) : ''}
                      onValueChange={(value) => setFormData({ ...formData, tenantId: value ? Number(value) : undefined })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择租户" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">默认租户</SelectItem>
                        {tenants.map((tenant) => (
                          <SelectItem key={tenant.tenantId} value={String(tenant.tenantId)}>
                            {tenant.tenantName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">性别</label>
                    <div className="flex gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      {[
                        ['0', '男'],
                        ['1', '女'],
                      ].map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            checked={formData.sex === value}
                            onChange={() => setFormData({ ...formData, sex: value })}
                            className="accent-slate-700"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">状态</label>
                    <div className="flex gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      {[
                        ['0', '正常'],
                        ['1', '停用'],
                      ].map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            checked={formData.status === value}
                            onChange={() => setFormData({ ...formData, status: value })}
                            className="accent-slate-700"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">角色授权</div>
                  <div className="mt-1 text-sm text-slate-500">用更清晰的标签式交互分配角色，便于快速识别当前授权组合。</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <button
                      type="button"
                      key={role.roleId}
                      onClick={() => toggleRole(role.roleId)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        selRoles.includes(role.roleId)
                          ? 'border-slate-300 bg-white text-slate-900 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                      }`}
                    >
                      {selRoles.includes(role.roleId) ? <Check size={12} className="mr-1 inline" /> : null}
                      {role.roleName}
                    </button>
                  ))}
                  {roles.length === 0 ? <span className="text-xs text-slate-400">暂无角色</span> : null}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">备注</div>
                  <div className="mt-1 text-sm text-slate-500">保留账号补充说明，方便后续审计和协作交接。</div>
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
      </WorkspacePageContent>
    </div>
  );
};

export default UserList;
