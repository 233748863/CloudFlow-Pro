import React, { useEffect, useMemo, useState } from 'react';
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
import { toast } from 'sonner';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  LoadingSpinner,
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
import {
  addRole,
  deleteRole,
  getDeptTree,
  getMenuList,
  getRoleList,
  updateRole,
} from '../../services/api/auth';
import { getTenantList } from '../../services/api/tenant';
import { cn } from '@/utils/cn';

type TreeNode = {
  menuId: number;
  parentId: number;
  menuName: string;
  orderNum: number;
  children?: TreeNode[];
};

type RoleRecord = {
  roleId: number;
  roleName: string;
  roleKey: string;
  roleSort: number;
  status: string;
  menuIds?: number[] | string;
  dsType?: number | string;
  dsScope?: string | number[];
  tenantId?: number;
};

type RoleFilters = {
  roleName: string;
  roleKey: string;
};

type RoleQuery = {
  pageNum: number;
  pageSize: number;
  roleName: string;
  roleKey: string;
};

const DEFAULT_TENANT_VALUE = '__DEFAULT_TENANT__';
const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

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

const buildTree = (items: TreeNode[], parentId = 0): TreeNode[] =>
  items
    .filter((item) => item.parentId === parentId)
    .map((item) => ({
      ...item,
      children: buildTree(items, item.menuId),
    }))
    .sort((left, right) => left.orderNum - right.orderNum);

const parseIds = (value?: string): number[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => !Number.isNaN(item));
};

const normalizeNumberList = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => !Number.isNaN(item));
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

const RowActionButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: 'neutral' | 'danger';
}> = ({ label, icon, onClick, tone = 'neutral' }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950',
      tone === 'danger'
        ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-300'
        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200',
    )}
    title={label}
    aria-label={label}
  >
    {icon}
  </button>
);

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

const TreeCheckboxList: React.FC<{
  nodes: TreeNode[];
  expandedKeys: number[];
  onToggleExpand: (id: number) => void;
  isChecked: (id: number) => boolean;
  onToggleCheck: (id: number) => void;
}> = ({ nodes, expandedKeys, onToggleExpand, isChecked, onToggleCheck }) => {
  const renderNodes = (items: TreeNode[]) =>
    items.map((node) => {
      const checked = isChecked(node.menuId);
      const expanded = expandedKeys.includes(node.menuId);

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
                onClick={() => onToggleExpand(node.menuId)}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-6" />
            )}

            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggleCheck(node.menuId)}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
            />
            <span className="text-sm text-slate-700 dark:text-slate-200">{node.menuName}</span>
          </div>
          {expanded && node.children?.length ? renderNodes(node.children) : null}
        </div>
      );
    });

  return <>{renderNodes(nodes)}</>;
};

export const RoleList = () => {
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [menuTree, setMenuTree] = useState<TreeNode[]>([]);
  const [flatMenus, setFlatMenus] = useState<TreeNode[]>([]);
  const [deptTree, setDeptTree] = useState<TreeNode[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RoleFilters>({
    roleName: '',
    roleKey: '',
  });
  const [query, setQuery] = useState<RoleQuery>({
    pageNum: 1,
    pageSize: 10,
    roleName: '',
    roleKey: '',
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [pendingDeleteRole, setPendingDeleteRole] = useState<RoleRecord | null>(null);
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

  const fetchRoles = async (nextQuery: RoleQuery = query) => {
    setLoading(true);
    setError(null);

    try {
      const response = await getRoleList({
        pageNum: nextQuery.pageNum,
        pageSize: nextQuery.pageSize,
        roleName: nextQuery.roleName || undefined,
        roleKey: nextQuery.roleKey || undefined,
      });

      const normalized = normalizePagedResponse<RoleRecord>(response);
      setRoles(normalized.rows);
      setTotal(normalized.total);
    } catch (fetchError) {
      console.error(fetchError);
      const message = '加载角色失败，请稍后重试。';
      setError(message);
      setRoles([]);
      setTotal(0);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMenus = async () => {
    try {
      const response = await getMenuList();
      const normalized = normalizePagedResponse<any>(response).rows.map((item) => ({
        menuId: Number(item.menuId),
        parentId: Number(item.parentId || 0),
        menuName: String(item.menuName || ''),
        orderNum: Number(item.orderNum || 0),
      }));

      setFlatMenus(normalized);
      setMenuTree(buildTree(normalized, 0));
      setExpandedKeys(
        normalized.filter((item) => item.parentId === 0).map((item) => item.menuId),
      );
    } catch (fetchError) {
      console.error(fetchError);
      toast.error('加载菜单失败');
    }
  };

  const fetchDepts = async () => {
    try {
      const response: any = await getDeptTree();
      const list = Array.isArray(response) ? response : [];
      const normalized: TreeNode[] = list.map((item: any) => ({
        menuId: Number(item.deptId),
        parentId: Number(item.parentId || 0),
        menuName: String(item.deptName || ''),
        orderNum: Number(item.orderNum || 0),
      }));

      setDeptTree(buildTree(normalized, 0));
      setExpandedDeptKeys(
        normalized.filter((item) => item.parentId === 0).map((item) => item.menuId),
      );
    } catch (fetchError) {
      console.error(fetchError);
      toast.error('加载部门失败');
    }
  };

  const fetchTenants = async () => {
    try {
      const response = await getTenantList({ pageNum: 1, pageSize: 200 });
      const normalized = normalizePagedResponse<any>(response);
      setTenants(normalized.rows);
    } catch (fetchError) {
      console.error(fetchError);
      toast.error('加载租户失败');
    }
  };

  useEffect(() => {
    void fetchRoles();
  }, [query]);

  useEffect(() => {
    void fetchMenus();
    void fetchDepts();
    void fetchTenants();
  }, []);

  const activeCount = useMemo(() => roles.filter((role) => role.status === '0').length, [roles]);
  const customScopeCount = useMemo(
    () => roles.filter((role) => Number(role.dsType) === 1).length,
    [roles],
  );
  const tenantCoverage = useMemo(
    () => new Set(roles.map((role) => role.tenantId).filter(Boolean)).size,
    [roles],
  );
  const hasActiveFilters = Boolean(query.roleName || query.roleKey);
  const isEdit = Boolean(editingRole);
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const selectedDeptCount = parseIds(formData.dsScope).length;

  const availableParents = flatMenus;

  const handleRefresh = () => {
    void fetchRoles();
    void fetchMenus();
    void fetchDepts();
    void fetchTenants();
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      roleName: filters.roleName.trim(),
      roleKey: filters.roleKey.trim(),
    }));
  };

  const clearFilters = () => {
    setFilters({ roleName: '', roleKey: '' });
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      roleName: '',
      roleKey: '',
    }));
  };

  const handleOpenModal = (role?: RoleRecord) => {
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

  const handleCloseModal = () => {
    setIsModalOpen(false);
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
    const checked = formData.menuIds.includes(menuId);
    const relatedIds = [menuId, ...collectChildIds(menuId)];

    setFormData((current) => ({
      ...current,
      menuIds: checked
        ? current.menuIds.filter((id) => !relatedIds.includes(id))
        : Array.from(new Set([...current.menuIds, ...relatedIds])),
    }));
  };

  const toggleDeptCheck = (deptId: number) => {
    const currentIds = parseIds(formData.dsScope);
    const nextIds = currentIds.includes(deptId)
      ? currentIds.filter((id) => id !== deptId)
      : [...currentIds, deptId];

    setFormData((current) => ({
      ...current,
      dsScope: nextIds.join(','),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.roleName.trim() || !formData.roleKey.trim()) {
      toast.error('请完整填写角色名称和权限字符');
      return;
    }

    try {
      const payload = {
        ...formData,
        roleName: formData.roleName.trim(),
        roleKey: formData.roleKey.trim(),
      };

      if (editingRole?.roleId) {
        await updateRole({ ...payload, roleId: editingRole.roleId });
        toast.success('角色更新成功');
      } else {
        await addRole(payload);
        toast.success('角色创建成功');
      }

      handleCloseModal();
      await fetchRoles();
    } catch (submitError) {
      console.error(submitError);
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

      const nextPage = roles.length === 1 && query.pageNum > 1 ? query.pageNum - 1 : query.pageNum;

      setPendingDeleteRole(null);
      setQuery((current) => ({
        ...current,
        pageNum: nextPage,
      }));

      if (nextPage === query.pageNum) {
        await fetchRoles();
      }
    } catch (deleteError) {
      console.error(deleteError);
      toast.error('删除角色失败');
    }
  };

  const tenantNameById = (tenantId?: number) =>
    tenants.find((tenant) => tenant.tenantId === tenantId)?.tenantName || '默认租户';

  return (
    <>
      <TablePageLayout
        className="gap-4"
        filters={
          <div className="flex flex-wrap items-start justify-between gap-3">
            <form
              onSubmit={handleSearch}
              className="flex flex-1 flex-wrap items-center gap-3"
            >
              <div className="relative w-full sm:w-56">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  value={filters.roleName}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, roleName: event.target.value }))
                  }
                  placeholder="搜索角色名称"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-56">
                <Input
                  value={filters.roleKey}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, roleKey: event.target.value }))
                  }
                  placeholder="权限字符"
                  className="h-10 font-mono"
                />
              </div>

              <Button type="submit" size="sm">
                查询
              </Button>

              {hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  重置
                </Button>
              ) : null}
            </form>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新
              </Button>
              <Button size="sm" onClick={() => handleOpenModal()}>
                <Plus size={15} />
                新增角色
              </Button>
            </div>
          </div>
        }
        table={
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  角色列表
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  轻量后台列表骨架，保留角色菜单树、部门树和租户归属配置能力。
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  共 {total} 条
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  当前页 {roles.length} 条
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  正常 {activeCount}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  自定义范围 {customScopeCount}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  菜单节点 {flatMenus.length}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  租户覆盖 {tenantCoverage}
                </span>
              </div>
            </div>

            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>角色名称</TableHead>
                  <TableHead>权限字符</TableHead>
                  <TableHead>所属租户</TableHead>
                  <TableHead>排序</TableHead>
                  <TableHead>数据范围</TableHead>
                  <TableHead>状态</TableHead>
                  <TableActionHead className="w-28">操作</TableActionHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableStateRow colSpan={8} title="正在加载角色数据..." loading />
                ) : error ? (
                  <TableStateRow colSpan={8} title="角色数据加载失败" description={error} />
                ) : roles.length === 0 ? (
                  <TableStateRow
                    colSpan={8}
                    title="暂无角色数据"
                    description="可以先创建角色，再配置菜单和数据范围。"
                  />
                ) : (
                  roles.map((role) => (
                    <TableRow key={role.roleId}>
                      <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                        {role.roleId}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                            <Shield size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                              {role.roleName}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                              菜单授权 {normalizeNumberList(role.menuIds).length} 项
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {role.roleKey}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                        <div className="inline-flex items-center gap-2">
                          <Building2 size={14} className="text-slate-400 dark:text-slate-500" />
                          <span>{tenantNameById(role.tenantId)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                        {role.roleSort}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                            getDsTypeClassName(Number(role.dsType)),
                          )}
                        >
                          {dsTypeMap[Number(role.dsType)] || '未设置'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                            getRoleStatusClassName(role.status),
                          )}
                        >
                          {role.status === '0' ? '正常' : '停用'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <RowActionButton
                            label="编辑角色"
                            icon={<Edit size={15} />}
                            onClick={() => handleOpenModal(role)}
                          />
                          <RowActionButton
                            label="删除角色"
                            icon={<Trash2 size={15} />}
                            onClick={() => setPendingDeleteRole(role)}
                            tone="danger"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        }
        pagination={
          total > 0 ? (
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
          ) : null
        }
      />

      <BaseDialog
        open={isModalOpen}
        title={isEdit ? '编辑角色' : '新增角色'}
        description="维护角色基础信息、状态、数据范围、菜单授权和租户归属。"
        onClose={handleCloseModal}
        maxWidthClassName="max-w-5xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleCloseModal}>
              取消
            </Button>
            <Button onClick={() => void 0} type="submit" form="role-form">
              {isEdit ? '保存修改' : '创建角色'}
            </Button>
          </div>
        }
      >
        <form id="role-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className={fieldLabelClassName}>
                角色名称 <span className="text-rose-500">*</span>
              </label>
              <Input
                value={formData.roleName}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, roleName: event.target.value }))
                }
                placeholder="例如：系统管理员"
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>
                权限字符 <span className="text-rose-500">*</span>
              </label>
              <Input
                value={formData.roleKey}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, roleKey: event.target.value }))
                }
                placeholder="例如：ADMIN"
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>显示排序</label>
              <Input
                type="number"
                value={String(formData.roleSort)}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    roleSort: Number.parseInt(event.target.value, 10) || 0,
                  }))
                }
                placeholder="请输入排序值"
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>所属租户</label>
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
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={fieldLabelClassName}>状态</label>
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
            </div>

            <div>
              <label className={fieldLabelClassName}>数据权限范围</label>
              <Select
                value={String(formData.dsType)}
                onValueChange={(value) => {
                  const nextType = Number.parseInt(value, 10);
                  setFormData((current) => ({
                    ...current,
                    dsType: nextType,
                    dsScope: nextType === 1 ? current.dsScope : '',
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

          {formData.dsType === 1 ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className={fieldLabelClassName}>自定义部门范围</label>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  已选部门 {selectedDeptCount} 个
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                {deptTree.length > 0 ? (
                  <TreeCheckboxList
                    nodes={deptTree}
                    expandedKeys={expandedDeptKeys}
                    onToggleExpand={(id) =>
                      setExpandedDeptKeys((current) =>
                        current.includes(id)
                          ? current.filter((item) => item !== id)
                          : [...current, id],
                      )
                    }
                    isChecked={(id) => parseIds(formData.dsScope).includes(id)}
                    onToggleCheck={toggleDeptCheck}
                  />
                ) : (
                  <div className="px-2 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                    暂无部门数据
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className={fieldLabelClassName}>菜单权限</label>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                已选菜单 {formData.menuIds.length} 项
              </span>
            </div>
            <div className="max-h-[28rem] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
              {menuTree.length > 0 ? (
                <TreeCheckboxList
                  nodes={menuTree}
                  expandedKeys={expandedKeys}
                  onToggleExpand={(id) =>
                    setExpandedKeys((current) =>
                      current.includes(id)
                        ? current.filter((item) => item !== id)
                        : [...current, id],
                    )
                  }
                  isChecked={(id) => formData.menuIds.includes(id)}
                  onToggleCheck={toggleMenuCheck}
                />
              ) : (
                <div className="px-2 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                  暂无菜单数据
                </div>
              )}
            </div>
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDeleteRole)}
        title="删除角色"
        message={
          pendingDeleteRole
            ? `确定删除角色“${pendingDeleteRole.roleName}”吗？删除后将无法恢复。`
            : ''
        }
        confirmText="确认删除"
        cancelText="取消"
        danger
        onCancel={() => setPendingDeleteRole(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
};

export default RoleList;
