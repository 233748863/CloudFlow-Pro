import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit,
  FolderTree,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
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
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { ConfirmDialog } from '@/components/common';
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
  addRole,
  deleteRole,
  getDeptTree,
  getMenuList,
  getRoleList,
  updateRole,
} from '../../services/api/auth';
import { getTenantList } from '../../services/api/tenant';
import { useMount } from '../../hooks/useMount';
import { cn } from '@/utils/cn';

type TreeNode = {
  menuId: number;
  parentId: number;
  menuName: string;
  orderNum: number;
  children?: TreeNode[];
};

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

const buildTree = (items: TreeNode[], parentId = 0): TreeNode[] =>
  items
    .filter((item) => item.parentId === parentId)
    .map((item) => ({
      ...item,
      children: buildTree(items, item.menuId),
    }))
    .sort((a, b) => a.orderNum - b.orderNum);

const parseIds = (value?: string): number[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => !Number.isNaN(item));
};

const normalizeNumberList = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => !Number.isNaN(item));
  }

  if (typeof value === 'string') {
    return parseIds(value);
  }

  return [];
};

const normalizeScopeValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.join(',');
  }

  return '';
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

const getRoleStatusClassName = (status: string) =>
  status === '0'
    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
    : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';

const getDsTypeClassName = (dsType: number) =>
  dsType === 1
    ? 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200'
    : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';

export const RoleList = () => {
  const [roles, setRoles] = useState<any[]>([]);
  const [menuTree, setMenuTree] = useState<TreeNode[]>([]);
  const [flatMenus, setFlatMenus] = useState<TreeNode[]>([]);
  const [deptTree, setDeptTree] = useState<TreeNode[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [pendingDeleteRole, setPendingDeleteRole] = useState<any>(null);
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
    setError(null);
    try {
      const response: any = await getRoleList();
      setRoles(Array.isArray(response) ? response : response?.rows || response?.records || []);
    } catch (err) {
      console.error(err);
      const message = '加载角色失败，请稍后重试';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMenus = async () => {
    try {
      const response: any = await getMenuList();
      const nextMenus = Array.isArray(response) ? response : response?.rows || response?.records || [];
      setFlatMenus(nextMenus);
      setMenuTree(buildTree(nextMenus, 0));
      setExpandedKeys(nextMenus.filter((item: TreeNode) => item.parentId === 0).map((item: TreeNode) => item.menuId));
    } catch (err) {
      console.error(err);
      toast.error('加载菜单失败');
    }
  };

  const fetchDepts = async () => {
    try {
      const response: any = await getDeptTree();
      const nextDepts = Array.isArray(response) ? response : [];
      const normalized: TreeNode[] = nextDepts.map((item: any) => ({
        ...item,
        menuId: item.deptId,
        parentId: item.parentId || 0,
        menuName: item.deptName,
        orderNum: item.orderNum || 0,
      }));
      setDeptTree(buildTree(normalized, 0));
      setExpandedDeptKeys(normalized.filter((item) => item.parentId === 0).map((item) => item.menuId));
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

  const handleRefresh = () => {
    void fetchRoles();
    void fetchMenus();
    void fetchDepts();
    void fetchTenants();
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearchTerm(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchTerm('');
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
        roleName: role.roleName || '',
        roleKey: role.roleKey || '',
        roleSort: Number(role.roleSort || 0),
        status: role.status || '0',
        menuIds: normalizeNumberList(role.menuIds),
        dsType: Number(role.dsType ?? 1),
        dsScope: normalizeScopeValue(role.dsScope),
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

    // 统一做父子联动，减少菜单授权时的重复点选。
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

  const renderTreeNodes = (nodes: TreeNode[]) =>
    nodes.map((node) => {
      const checked = formData.menuIds.includes(node.menuId);

      return (
        <div key={node.menuId} className="ml-3">
          <div
            className={cn(
              'flex items-center gap-2 rounded-xl px-2 py-1.5 transition',
              checked && 'bg-slate-50 dark:bg-slate-900/70',
            )}
          >
            {node.children && node.children.length > 0 ? (
              <button
                type="button"
                onClick={() => toggleExpand(node.menuId)}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
              >
                {expandedKeys.includes(node.menuId) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-6" />
            )}

            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleMenuCheck(node.menuId)}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">{node.menuName}</span>
          </div>
          {expandedKeys.includes(node.menuId) && node.children?.length ? renderTreeNodes(node.children) : null}
        </div>
      );
    });

  const renderDeptTreeNodes = (nodes: TreeNode[]) => {
    const selectedIds = parseIds(formData.dsScope);

    return nodes.map((node) => {
      const checked = selectedIds.includes(node.menuId);

      return (
        <div key={node.menuId} className="ml-3">
          <div
            className={cn(
              'flex items-center gap-2 rounded-xl px-2 py-1.5 transition',
              checked && 'bg-slate-50 dark:bg-slate-900/70',
            )}
          >
            {node.children && node.children.length > 0 ? (
              <button
                type="button"
                onClick={() => toggleDeptExpand(node.menuId)}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
              >
                {expandedDeptKeys.includes(node.menuId) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-6" />
            )}

            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleDeptCheck(node.menuId)}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">{node.menuName}</span>
          </div>
          {expandedDeptKeys.includes(node.menuId) && node.children?.length ? renderDeptTreeNodes(node.children) : null}
        </div>
      );
    });
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
    } catch (err) {
      console.error(err);
      toast.error('保存角色失败');
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteRole) {
      return;
    }

    try {
      await deleteRole([pendingDeleteRole.roleId]);
      toast.success('角色删除成功');
      setPendingDeleteRole(null);
      await fetchRoles();
    } catch (err) {
      console.error(err);
      toast.error('删除角色失败');
    }
  };

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const hasActiveFilters = Boolean(searchTerm.trim());
  const currentSearchLabel = searchTerm.trim() || '未设置';
  const selectedDeptCount = parseIds(formData.dsScope).length;

  const overviewItems = [
    { label: '当前结果', value: `${filteredRoles.length} 个角色` },
    { label: '正常状态', value: `${activeCount} 个` },
    { label: '自定义范围', value: `${customScopeCount} 个` },
    { label: '搜索关键词', value: currentSearchLabel },
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
      label: '租户覆盖',
      value: `${tenantCoverage}`,
      hint: `自定义范围 ${customScopeCount} 个`,
      icon: <Users size={17} />,
    },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                <Shield size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          )}
          title="角色管理"
          description="把系统管理页统一回到业务工作台结构，角色配置、数据范围和菜单授权不再停留在传统后台式的零散表单。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="lg" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新数据
              </Button>
              <Button size="lg" onClick={() => handleOpenModal()}>
                <Plus size={15} />
                新增角色
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              System 角色工作台
            </span>
            <span className={surfaceChipClassName}>菜单节点 {flatMenus.length} 个</span>
            <span className={surfaceChipClassName}>租户 {tenants.length} 个</span>
            <span className={surfaceChipClassName}>关键词：{currentSearchLabel}</span>
          </div>
        </WorkspaceHeroMetricsSection>

        <WorkspaceWorkbenchCard
          eyebrow="角色筛选"
          title="角色工作台"
          total={filteredRoles.length}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          headerBadges={(
            <div className="flex flex-wrap gap-2">
              <span className={surfaceChipClassName}>菜单节点 {flatMenus.length} 个</span>
              <span className={surfaceChipClassName}>租户 {tenants.length} 个</span>
              <span className={surfaceChipClassName}>{hasActiveFilters ? '筛选结果' : '默认视图'}</span>
            </div>
          )}
          quickFilterAside={(
            <div className="flex flex-wrap items-center gap-2">
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  清空筛选
                </Button>
              ) : (
                <span className={surfaceChipClassName}>当前未应用搜索条件</span>
              )}
            </div>
          )}
          filterBar={(
            <form onSubmit={handleSearch} className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="按角色名称或权限字符搜索"
                  className="pl-10"
                />
              </div>
              <Button type="submit" className="xl:min-w-[120px]">
                <Search size={15} />
                搜索角色
              </Button>
              <Button type="button" variant="outline" className="xl:min-w-[120px]" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新
              </Button>
            </form>
          )}
        />

        <WorkspaceResultCard
          total={filteredRoles.length}
          title="当前角色"
          description="角色信息、数据范围和状态统一收口展示，操作反馈与业务申请页一致。"
        >
          <div className="space-y-4 px-4 py-4">
            {!loading && !error && filteredRoles.length > 0 ? (
              <div className={subtlePanelClassName}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">角色结果概况</div>
                    <div className="flex flex-wrap gap-2">
                      <span className={surfaceChipClassName}>当前页 {filteredRoles.length} 个</span>
                      <span className={surfaceChipClassName}>正常 {activeCount} 个</span>
                      <span className={surfaceChipClassName}>自定义范围 {customScopeCount} 个</span>
                      <span className={surfaceChipClassName}>租户覆盖 {tenantCoverage} 个</span>
                    </div>
                    <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                      列表、状态标签、菜单授权树和数据范围树使用同一套层级与色彩规则，避免 System 页面继续分裂成第三套视觉语言。
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <Table className="min-w-[980px]">
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
              <TableBody>
                {loading ? (
                  <WorkspaceTableStateRow colSpan={8} type="loading" title="正在加载角色数据..." />
                ) : error ? (
                  <WorkspaceTableStateRow
                    colSpan={8}
                    title="角色数据加载失败"
                    description={error}
                  />
                ) : filteredRoles.length === 0 ? (
                  <WorkspaceTableStateRow
                    colSpan={8}
                    title="暂无角色数据"
                    description="可以先新建角色，再配置菜单和数据范围。"
                  />
                ) : (
                  filteredRoles.map((role) => (
                    <TableRow key={role.roleId}>
                      <TableCell className="py-4 text-sm text-slate-500 dark:text-slate-400">{role.roleId}</TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                            <Shield size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{role.roleName}</div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                              菜单授权 {normalizeNumberList(role.menuIds).length} 项
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {role.roleKey}
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                        <div className="inline-flex items-center gap-2">
                          <Building2 size={14} className="text-slate-400 dark:text-slate-500" />
                          <span>{tenants.find((tenant) => tenant.tenantId === role.tenantId)?.tenantName || '默认租户'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">{role.roleSort}</TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getDsTypeClassName(Number(role.dsType)))}>
                          {dsTypeMap[Number(role.dsType)] || '未设置'}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getRoleStatusClassName(role.status))}>
                          {role.status === '0' ? '正常' : '停用'}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-right whitespace-nowrap">
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
                              onClick: () => setPendingDeleteRole(role),
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
            title={editingRole ? '编辑角色' : '新增角色'}
            description="把角色基础信息、数据范围和资源授权拆成分段表单，方便集中维护。"
            onClose={() => setIsModalOpen(false)}
            maxWidthClassName="max-w-5xl"
            headerAside={(
              <div className="flex flex-wrap gap-2">
                <span className={surfaceChipClassName}>{editingRole ? '编辑模式' : '新增模式'}</span>
                <span className={surfaceChipClassName}>已选菜单 {formData.menuIds.length} 项</span>
                <span className={surfaceChipClassName}>已选部门 {selectedDeptCount} 个</span>
              </div>
            )}
            bodyClassName="space-y-6"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">基础信息</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    先确认角色名称、权限字符、排序与租户归属，再继续配置范围和菜单授权。
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className={fieldLabelClassName}>
                      角色名称 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.roleName}
                      onChange={(event) => setFormData({ ...formData, roleName: event.target.value })}
                      placeholder="如：系统管理员"
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClassName}>
                      权限字符 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.roleKey}
                      onChange={(event) => setFormData({ ...formData, roleKey: event.target.value })}
                      placeholder="如：ADMIN"
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClassName}>显示排序</label>
                    <Input
                      type="number"
                      value={formData.roleSort}
                      onChange={(event) =>
                        setFormData({ ...formData, roleSort: Number.parseInt(event.target.value, 10) || 0 })
                      }
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
                </div>
              </section>

              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">状态与数据范围</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    角色状态决定是否可被分配，自定义数据范围可进一步限定角色查看的数据集合。
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={fieldLabelClassName}>状态</label>
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
                    <label className={fieldLabelClassName}>数据权限范围</label>
                    <Select
                      value={String(formData.dsType)}
                      onValueChange={(value) => {
                        const nextType = Number.parseInt(value, 10);
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

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={surfaceChipClassName}>当前选择：{dsTypeMap[formData.dsType] || '未设置'}</span>
                  {formData.dsType === 1 ? <span className={surfaceChipClassName}>已选部门 {selectedDeptCount} 个</span> : null}
                </div>

                {formData.dsType === 1 ? (
                  <div className="mt-4 space-y-3">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">自定义部门范围</div>
                    <div className={nestedPanelClassName}>
                      <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                        {deptTree.length > 0 ? renderDeptTreeNodes(deptTree) : (
                          <div className="px-2 py-6 text-center text-sm text-slate-400 dark:text-slate-500">暂无部门数据</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className={sectionPanelClassName}>
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">菜单权限</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    目录与子节点做联动勾选，减少逐项点选带来的维护成本。
                  </div>
                </div>
                <div className={nestedPanelClassName}>
                  <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                    {menuTree.length > 0 ? renderTreeNodes(menuTree) : (
                      <div className="px-2 py-6 text-center text-sm text-slate-400 dark:text-slate-500">暂无菜单数据</div>
                    )}
                  </div>
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

        <ConfirmDialog
          open={Boolean(pendingDeleteRole)}
          title="确认删除角色"
          message={
            pendingDeleteRole
              ? `确定要删除角色“${pendingDeleteRole.roleName}”吗？此操作不可恢复。`
              : ''
          }
          confirmText="确认删除"
          cancelText="取消"
          danger={true}
          onCancel={() => setPendingDeleteRole(null)}
          onConfirm={() => void handleDelete()}
        />
      </WorkspacePageContent>
    </div>
  );
};

export default RoleList;
