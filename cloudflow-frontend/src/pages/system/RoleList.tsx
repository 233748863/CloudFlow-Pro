import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit,
  FolderTree,
  Plus,
  Shield,
  SlidersHorizontal,
  Trash2,
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
  addRole,
  deleteRole,
  getDeptTree,
  getMenuList,
  getRoleList,
  updateRole,
} from '../../services/api/auth';
import { getTenantList } from '../../services/api/tenant';
import { useMount } from '../../hooks/useMount';

type TreeNode = {
  menuId: number;
  parentId: number;
  menuName: string;
  orderNum: number;
  children?: TreeNode[];
};

const buildTree = (items: TreeNode[], parentId: number = 0): TreeNode[] => {
  return items
    .filter((item) => item.parentId === parentId)
    .map((item) => ({
      ...item,
      children: buildTree(items, item.menuId),
    }))
    .sort((a, b) => a.orderNum - b.orderNum);
};

const parseIds = (value?: string): number[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => parseInt(item.trim(), 10))
    .filter((item) => !Number.isNaN(item));
};

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const dsTypeMap: Record<number, string> = {
  0: '全部数据',
  1: '自定义数据',
  2: '本部门及下级',
  3: '本部门数据',
  4: '仅本人数据',
};

export const RoleList = () => {
  const [roles, setRoles] = useState<any[]>([]);
  const [menuTree, setMenuTree] = useState<TreeNode[]>([]);
  const [flatMenus, setFlatMenus] = useState<TreeNode[]>([]);
  const [deptTree, setDeptTree] = useState<TreeNode[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [formData, setFormData] = useState({
    roleName: '',
    roleKey: '',
    roleSort: 0,
    status: '0',
    menuIds: [] as number[],
    dsType: 1,
    dsScope: '',
    tenantId: undefined as number | undefined,
  });
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const [expandedDeptKeys, setExpandedDeptKeys] = useState<number[]>([]);

  useMount(() => {
    void fetchRoles();
    void fetchMenus();
    void fetchDepts();
    void fetchTenants();
  });

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const response = await getRoleList();
      setRoles(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error(error);
      toast.error('加载角色失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchMenus = async () => {
    try {
      const response = await getMenuList();
      if (Array.isArray(response)) {
        setFlatMenus(response);
        setMenuTree(buildTree(response, 0));
        setExpandedKeys(response.filter((item) => item.parentId === 0).map((item) => item.menuId));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchDepts = async () => {
    try {
      const response = await getDeptTree();
      if (Array.isArray(response)) {
        const normalized: TreeNode[] = response.map((item) => ({
          ...item,
          menuId: item.deptId,
          parentId: item.parentId || 0,
          menuName: item.deptName,
          orderNum: item.orderNum || 0,
        }));
        setDeptTree(buildTree(normalized, 0));
        setExpandedDeptKeys(normalized.filter((item) => item.parentId === 0).map((item) => item.menuId));
      }
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

  const filteredRoles = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return roles;
    return roles.filter((role) =>
      [role.roleName, role.roleKey]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(keyword)),
    );
  }, [roles, searchTerm]);

  const activeCount = filteredRoles.filter((role) => role.status === '0').length;
  const customScopeCount = filteredRoles.filter((role) => Number(role.dsType) === 1).length;
  const tenantCoverage = new Set(filteredRoles.map((role) => role.tenantId).filter(Boolean)).size;

  const handleOpenModal = (role?: any) => {
    if (role) {
      setEditingRole(role);
      setFormData({
        roleName: role.roleName,
        roleKey: role.roleKey,
        roleSort: role.roleSort,
        status: role.status,
        menuIds: role.menuIds || [],
        dsType: role.dsType ?? 1,
        dsScope: role.dsScope || '',
        tenantId: role.tenantId,
      });
    } else {
      setEditingRole(null);
      setFormData({
        roleName: '',
        roleKey: '',
        roleSort: 0,
        status: '0',
        menuIds: [],
        dsType: 1,
        dsScope: '',
        tenantId: undefined,
      });
    }
    setIsModalOpen(true);
  };

  const collectChildIds = (id: number): number[] => {
    const children = flatMenus.filter((item) => item.parentId === id);
    let ids = children.map((item) => item.menuId);
    children.forEach((child) => {
      ids = [...ids, ...collectChildIds(child.menuId)];
    });
    return ids;
  };

  const toggleMenuCheck = (menuId: number) => {
    const isChecked = formData.menuIds.includes(menuId);
    const relatedIds = [menuId, ...collectChildIds(menuId)];

    // 统一做“父子联动”处理。
    // 例如勾选目录时，目录下已有子菜单会一起带上，减少逐项点击。
    setFormData((prev) => ({
      ...prev,
      menuIds: isChecked
        ? prev.menuIds.filter((id) => !relatedIds.includes(id))
        : Array.from(new Set([...prev.menuIds, ...relatedIds])),
    }));
  };

  const toggleDeptCheck = (deptId: number) => {
    const currentIds = parseIds(formData.dsScope);
    const nextIds = currentIds.includes(deptId)
      ? currentIds.filter((id) => id !== deptId)
      : [...currentIds, deptId];

    setFormData((prev) => ({ ...prev, dsScope: nextIds.join(',') }));
  };

  const toggleExpand = (id: number) => {
    setExpandedKeys((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleDeptExpand = (id: number) => {
    setExpandedDeptKeys((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const renderTreeNodes = (nodes: TreeNode[]) => {
    return nodes.map((node) => (
      <div key={node.menuId} className="ml-3">
        <div className="flex items-center gap-2 py-1.5">
          {node.children && node.children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.menuId)}
              className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              {expandedKeys.includes(node.menuId) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-6" />
          )}

          <input
            type="checkbox"
            checked={formData.menuIds.includes(node.menuId)}
            onChange={() => toggleMenuCheck(node.menuId)}
            className="accent-slate-700"
          />
          <span className="text-sm text-slate-700">{node.menuName}</span>
        </div>
        {expandedKeys.includes(node.menuId) && node.children?.length ? renderTreeNodes(node.children) : null}
      </div>
    ));
  };

  const renderDeptTreeNodes = (nodes: TreeNode[]) => {
    const selectedIds = parseIds(formData.dsScope);

    return nodes.map((node) => (
      <div key={node.menuId} className="ml-3">
        <div className="flex items-center gap-2 py-1.5">
          {node.children && node.children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggleDeptExpand(node.menuId)}
              className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              {expandedDeptKeys.includes(node.menuId) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-6" />
          )}

          <input
            type="checkbox"
            checked={selectedIds.includes(node.menuId)}
            onChange={() => toggleDeptCheck(node.menuId)}
            className="accent-slate-700"
          />
          <span className="text-sm text-slate-700">{node.menuName}</span>
        </div>
        {expandedDeptKeys.includes(node.menuId) && node.children?.length ? renderDeptTreeNodes(node.children) : null}
      </div>
    ));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.roleName.trim() || !formData.roleKey.trim()) {
      toast.error('请完整填写角色名称和权限字符');
      return;
    }

    try {
      if (editingRole) {
        await updateRole({ ...formData, roleId: editingRole.roleId });
        toast.success('角色更新成功');
      } else {
        await addRole(formData);
        toast.success('角色创建成功');
      }
      setIsModalOpen(false);
      await fetchRoles();
    } catch (error) {
      console.error(error);
      toast.error('保存角色失败');
    }
  };

  const handleDelete = async (roleId: number) => {
    if (!window.confirm('确认删除该角色吗？')) {
      return;
    }

    try {
      await deleteRole([roleId]);
      toast.success('角色删除成功');
      await fetchRoles();
    } catch (error) {
      console.error(error);
      toast.error('删除角色失败');
    }
  };

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const overviewItems = [
    { label: '当前结果', value: `${filteredRoles.length} 个角色` },
    { label: '正常状态', value: `${activeCount} 个` },
    { label: '自定义范围', value: `${customScopeCount} 个` },
    { label: '租户覆盖', value: `${tenantCoverage} 个` },
  ];
  const heroMetrics = [
    {
      label: '角色总数',
      value: `${filteredRoles.length}`,
      hint: '当前视图下可见角色数量',
      icon: <Shield size={17} />,
    },
    {
      label: '正常角色',
      value: `${activeCount}`,
      hint: '状态为正常，可用于授权',
      icon: <CheckCircle2 size={17} />,
    },
    {
      label: '菜单资源',
      value: `${flatMenus.length}`,
      hint: '角色可分配的菜单与按钮总量',
      icon: <FolderTree size={17} />,
    },
    {
      label: '部门树',
      value: `${deptTree.length}`,
      hint: '自定义数据范围可引用的根部门数量',
      icon: <Users size={17} />,
    },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <Shield size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{timeLabel}</span>
            </div>
          )}
          title="角色管理"
          description="把系统管理页也统一到业务工作台结构，角色配置、数据范围和菜单授权不再是传统后台的零散表单。"
          actions={(
            <Button size="lg" onClick={() => handleOpenModal()}>
              <Plus size={15} />
              新增角色
            </Button>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        />

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="角色清单"
              total={filteredRoles.length}
              hasActiveFilters={Boolean(searchTerm.trim())}
              overviewItems={overviewItems}
              headerBadges={(
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
                    菜单节点 {flatMenus.length} 个
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500">
                    租户 {tenants.length} 个
                  </span>
                </div>
              )}
              quickFilterAside={searchTerm ? (
                <Button variant="outline" size="sm" onClick={() => setSearchTerm('')}>
                  清空筛选
                </Button>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400">
                  当前未应用搜索条件
                </span>
              )}
              filterBar={(
                <div className="relative">
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="按角色名称或权限字符搜索"
                    className="pl-10"
                  />
                  <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                </div>
              )}
            />

            <WorkspaceResultCard
              total={filteredRoles.length}
              description="角色信息、数据范围和状态统一收口展示，操作反馈与业务申请页一致。"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px]">
                  <TableHeader>
                    <tr>
                      <TableHead>ID</TableHead>
                      <TableHead>角色名称</TableHead>
                      <TableHead>权限字符</TableHead>
                      <TableHead>所属租户</TableHead>
                      <TableHead>排序</TableHead>
                      <TableHead>数据范围</TableHead>
                      <TableHead>状态</TableHead>
                      <TableActionHead className="w-52">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={8} type="loading" title="正在加载角色数据..." />
                    ) : filteredRoles.length === 0 ? (
                      <WorkspaceTableStateRow colSpan={8} title="暂无角色数据" description="可以先新建角色，再配置菜单和数据范围。" />
                    ) : (
                      filteredRoles.map((role) => (
                        <tr key={role.roleId} className="border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-3 text-sm text-slate-500">{role.roleId}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                                <Shield size={16} />
                              </div>
                              <span>{role.roleName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{role.roleKey}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            <div className="inline-flex items-center gap-2">
                              <Building2 size={14} className="text-slate-400" />
                              <span>{tenants.find((tenant) => tenant.tenantId === role.tenantId)?.tenantName || '默认租户'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{role.roleSort}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              Number(role.dsType) === 1
                                ? 'border border-amber-200 bg-amber-50 text-amber-700'
                                : 'border border-slate-200 bg-white text-slate-600'
                            }`}>
                              {dsTypeMap[Number(role.dsType)] || '未设置'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              role.status === '0'
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                : 'bg-rose-50 text-rose-600 ring-1 ring-rose-100'
                            }`}>
                              {role.status === '0' ? '正常' : '停用'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <TableRowActions
                              align="end"
                              actions={[
                                {
                                  label: '编辑',
                                  icon: <Edit size={14} />,
                                  onClick: () => handleOpenModal(role),
                                  tone: 'primary',
                                },
                                {
                                  label: '删除',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => handleDelete(role.roleId),
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
            title={editingRole ? '编辑角色' : '新增角色'}
            description="把角色基础信息、数据范围和资源授权拆成分段表单，方便集中维护。"
            onClose={() => setIsModalOpen(false)}
            maxWidthClassName="max-w-5xl"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">基础信息</div>
                  <div className="mt-1 text-sm text-slate-500">先确认角色名称、权限字符、排序与租户归属，再继续配置范围和菜单授权。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      角色名称 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.roleName}
                      onChange={(event) => setFormData({ ...formData, roleName: event.target.value })}
                      placeholder="如：系统管理员"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      权限字符 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.roleKey}
                      onChange={(event) => setFormData({ ...formData, roleKey: event.target.value })}
                      placeholder="如：ADMIN"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">显示排序</label>
                    <Input
                      type="number"
                      value={formData.roleSort}
                      onChange={(event) => setFormData({ ...formData, roleSort: parseInt(event.target.value, 10) || 0 })}
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
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">状态与数据范围</div>
                  <div className="mt-1 text-sm text-slate-500">角色状态决定是否可被分配，自定义数据范围可进一步限定角色查看的数据集合。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">状态</label>
                    <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="请选择状态" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">正常</SelectItem>
                        <SelectItem value="1">停用</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">数据权限范围</label>
                    <Select
                      value={String(formData.dsType)}
                      onValueChange={(value) => {
                        const nextType = parseInt(value, 10);
                        setFormData((prev) => ({
                          ...prev,
                          dsType: nextType,
                          dsScope: nextType === 1 ? prev.dsScope : '',
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择数据范围" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">全部数据权限</SelectItem>
                        <SelectItem value="1">自定义数据权限</SelectItem>
                        <SelectItem value="2">本部门及下级</SelectItem>
                        <SelectItem value="3">本部门数据</SelectItem>
                        <SelectItem value="4">仅本人数据</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-3 text-xs leading-6 text-slate-500">
                  当前选择：{dsTypeMap[formData.dsType] || '未设置'}
                </div>

                {formData.dsType === 1 ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 text-sm font-medium text-slate-700">自定义部门范围</div>
                    <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                      {renderDeptTreeNodes(deptTree)}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">菜单权限</div>
                  <div className="mt-1 text-sm text-slate-500">目录与子节点做联动勾选，减少逐项点选带来的维护成本。</div>
                </div>
                <div className="max-h-[28rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  {renderTreeNodes(menuTree)}
                </div>
              </section>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
                  取消
                </Button>
                <Button type="submit">{editingRole ? '保存修改' : '立即创建'}</Button>
              </div>
            </form>
          </WorkspaceDialogShell>
        ) : null}
      </WorkspacePageContent>
    </div>
  );
};

export default RoleList;
