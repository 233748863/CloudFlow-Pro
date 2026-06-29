import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Edit,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import {
  Button,
  Input,
  Label,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import {
  addRole,
  addRoleMutexRule,
  deleteRoleMutexRule,
  deleteRole,
  getDeptTree,
  getMenuList,
  getRole,
  getRoleList,
  getRoleMutexRules,
  getRoleOptions,
  type RoleMutexRule,
  type RoleOption,
  updateRole,
} from '../../services/api/auth';
import { getTenantList } from '../../services/api/tenant';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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
const EMPTY_SELECT_VALUE = '__EMPTY__';

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
    : 'border border-slate-200 bg-[var(--cf-surface-muted)] text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300';

const checkboxClassName =
  'h-4 w-4 shrink-0 rounded border-slate-300 accent-[#0d95b5] text-[#0d95b5] focus:ring-2 focus:ring-[#0d95b5]/30 focus:ring-offset-0 dark:border-slate-700 dark:bg-slate-950';

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

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <tr>
    <td colSpan={colSpan} className="admin-settings-empty">
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
          <label
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition',
              checked
                ? 'bg-[var(--cf-surface-muted)] text-slate-900 dark:bg-slate-900/70 dark:text-slate-100'
                : 'text-slate-700 hover:bg-[var(--cf-surface-muted)] dark:text-slate-200 dark:hover:bg-slate-950/80',
            )}
          >
            {node.children && node.children.length > 0 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleExpand(node.menuId);
                }}
                className="rounded-md p-1 text-slate-400 transition hover:bg-[var(--cf-surface-muted)] hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
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
              className={checkboxClassName}
            />
            <span className="text-sm font-medium">{node.menuName}</span>
          </label>
          {expanded && node.children?.length ? renderNodes(node.children) : null}
        </div>
      );
    });

  return <>{renderNodes(nodes)}</>;
};

export const RoleList = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [total, setTotal] = useState(0);
  const [menuTree, setMenuTree] = useState<TreeNode[]>([]);
  const [flatMenus, setFlatMenus] = useState<TreeNode[]>([]);
  const [deptTree, setDeptTree] = useState<TreeNode[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [roleDetailLoading, setRoleDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RoleFilters>({
    roleName: '',
    roleKey: '',
  });
  const [query, setQuery] = useState<RoleQuery>({
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
    roleName: '',
    roleKey: '',
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMutexDialogOpen, setIsMutexDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [pendingDeleteRole, setPendingDeleteRole] = useState<RoleRecord | null>(null);
  const [pendingDeleteMutexRule, setPendingDeleteMutexRule] = useState<RoleMutexRule | null>(null);
  const roleDetailRequestRef = useRef(0);
  const [mutexRules, setMutexRules] = useState<RoleMutexRule[]>([]);
  const [mutexLoading, setMutexLoading] = useState(false);
  const [mutexForm, setMutexForm] = useState({
    roleId1: EMPTY_SELECT_VALUE,
    roleId2: EMPTY_SELECT_VALUE,
  });
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
      toast.error(getErrorMessage(fetchError, '加载菜单失败'));
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
      toast.error(getErrorMessage(fetchError, '加载部门失败'));
    }
  };

  const fetchTenants = async () => {
    try {
      const response = await getTenantList({ pageNum: 1, pageSize: 200 });
      const normalized = normalizePagedResponse<any>(response);
      setTenants(normalized.rows);
    } catch (fetchError) {
      console.error(fetchError);
      toast.error(getErrorMessage(fetchError, '加载租户失败'));
    }
  };

  const fetchRoleOptions = async () => {
    try {
      const response = await getRoleOptions();
      setRoleOptions(Array.isArray(response) ? response : []);
    } catch (fetchError) {
      console.error(fetchError);
      toast.error(getErrorMessage(fetchError, '加载角色选项失败'));
      setRoleOptions([]);
    }
  };

  const fetchMutexRules = async () => {
    setMutexLoading(true);
    try {
      const response = await getRoleMutexRules();
      setMutexRules(Array.isArray(response) ? response : []);
    } catch (fetchError) {
      console.error(fetchError);
      toast.error(getErrorMessage(fetchError, '加载互斥规则失败'));
      setMutexRules([]);
    } finally {
      setMutexLoading(false);
    }
  };

  useEffect(() => {
    void fetchRoles();
  }, [query]);

  useEffect(() => {
    void fetchMenus();
    void fetchDepts();
    void fetchTenants();
    void fetchRoleOptions();
  }, []);

  const hasActiveFilters = Boolean(query.roleName || query.roleKey);
  const isEdit = Boolean(editingRole);
  const permissions = user?.permissions || [];
  const hasRolePermission = (permission: string) =>
    permissions.includes(permission) || permissions.includes('*:*:*') || permissions.includes('*');
  const canAddRole = hasRolePermission('system:role:add');
  const canEditRole = hasRolePermission('system:role:edit');
  const canRemoveRole = hasRolePermission('system:role:remove');
  const stats = useMemo(
    () => [
      {
        label: '总角色',
        value: String(total),
        meta: `当前页 ${roles.length}`,
        icon: <Shield size={18} />,
        tone: 'blue',
      },
      {
        label: '正常角色',
        value: String(roles.filter((role) => role.status === '0').length),
        meta: '可分配权限',
        icon: <Shield size={18} />,
        tone: 'green',
      },
      {
        label: '自定义数据',
        value: String(roles.filter((role) => Number(role.dsType) === 1).length),
        meta: '按部门授权',
        icon: <Building2 size={18} />,
        tone: 'violet',
      },
      {
        label: '租户范围',
        value: String(Math.max(tenants.length, 1)),
        meta: '含默认租户',
        icon: <Building2 size={18} />,
        tone: 'amber',
      },
    ],
    [roles, tenants.length, total],
  );
  const roleNameById = useMemo(() => {
    const map = new Map<number, string>();
    roleOptions.forEach((item) => {
      map.set(item.roleId, item.roleName);
    });
    return map;
  }, [roleOptions]);

  const handleRefresh = () => {
    void fetchRoles();
    void fetchMenus();
    void fetchDepts();
    void fetchTenants();
    void fetchRoleOptions();
    if (isMutexDialogOpen) {
      void fetchMutexRules();
    }
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

  const getRoleFormValue = (role: RoleRecord) => ({
    roleName: role.roleName || '',
    roleKey: role.roleKey || '',
    roleSort: Number(role.roleSort || 0),
    status: role.status || '0',
    menuIds: normalizeNumberList(role.menuIds),
    dsType: Number(role.dsType ?? 1),
    dsScope: normalizeScopeValue(role.dsScope),
    tenantId: role.tenantId,
  });

  const handleOpenModal = (role?: RoleRecord) => {
    if (role && !canEditRole) {
      toast.error('没有编辑角色权限');
      return;
    }

    if (!role && !canAddRole) {
      toast.error('没有新增角色权限');
      return;
    }

    if (role) {
      const requestId = roleDetailRequestRef.current + 1;
      roleDetailRequestRef.current = requestId;
      setEditingRole(role);
      setFormData(getRoleFormValue(role));
      setRoleDetailLoading(true);

      void getRole(role.roleId)
        .then((detail) => {
          if (roleDetailRequestRef.current !== requestId) {
            return;
          }
          setEditingRole((current) => ({ ...(current || role), ...detail }));
          setFormData(getRoleFormValue({ ...role, ...detail }));
        })
        .catch((detailError) => {
          if (roleDetailRequestRef.current !== requestId) {
            return;
          }
          console.error(detailError);
          toast.error(getErrorMessage(detailError, '加载角色权限失败'));
        })
        .finally(() => {
          if (roleDetailRequestRef.current === requestId) {
            setRoleDetailLoading(false);
          }
        });
    } else {
      roleDetailRequestRef.current += 1;
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
    roleDetailRequestRef.current += 1;
    setRoleDetailLoading(false);
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

  const handleOpenMutexDialog = () => {
    if (!canEditRole) {
      toast.error('没有维护角色互斥规则权限');
      return;
    }
    setIsMutexDialogOpen(true);
    void Promise.all([fetchRoleOptions(), fetchMutexRules()]);
  };

  const handleCloseMutexDialog = () => {
    setIsMutexDialogOpen(false);
    setMutexForm({
      roleId1: EMPTY_SELECT_VALUE,
      roleId2: EMPTY_SELECT_VALUE,
    });
    setPendingDeleteMutexRule(null);
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

    if (editingRole?.roleId && !canEditRole) {
      toast.error('没有编辑角色权限');
      return;
    }

    if (!editingRole?.roleId && !canAddRole) {
      toast.error('没有新增角色权限');
      return;
    }

    if (!formData.roleName.trim() || !formData.roleKey.trim()) {
      toast.error('请完整填写角色名称和权限字符');
      return;
    }

    if (roleDetailLoading) {
      toast.error('角色授权仍在加载中');
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
      toast.error(getErrorMessage(submitError, '保存角色失败'));
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteRole) {
      return;
    }

    if (!canRemoveRole) {
      toast.error('没有删除角色权限');
      setPendingDeleteRole(null);
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
      toast.error(getErrorMessage(deleteError, '删除角色失败'));
    }
  };

  const handleAddMutexRule = async () => {
    if (!canEditRole) {
      toast.error('没有维护角色互斥规则权限');
      return;
    }
    if (mutexForm.roleId1 === EMPTY_SELECT_VALUE || mutexForm.roleId2 === EMPTY_SELECT_VALUE) {
      toast.error('请选择两条角色规则');
      return;
    }
    if (mutexForm.roleId1 === mutexForm.roleId2) {
      toast.error('互斥规则不能引用同一角色');
      return;
    }
    try {
      await addRoleMutexRule({
        roleId1: Number(mutexForm.roleId1),
        roleId2: Number(mutexForm.roleId2),
      });
      toast.success('互斥规则已添加');
      setMutexForm({
        roleId1: EMPTY_SELECT_VALUE,
        roleId2: EMPTY_SELECT_VALUE,
      });
      await fetchMutexRules();
    } catch (submitError) {
      console.error(submitError);
      toast.error(getErrorMessage(submitError, '保存互斥规则失败'));
    }
  };

  const handleDeleteMutexRule = async () => {
    if (!pendingDeleteMutexRule) {
      return;
    }
    try {
      await deleteRoleMutexRule(pendingDeleteMutexRule.id);
      toast.success('互斥规则已删除');
      setPendingDeleteMutexRule(null);
      await fetchMutexRules();
    } catch (deleteError) {
      console.error(deleteError);
      toast.error(getErrorMessage(deleteError, '删除互斥规则失败'));
    }
  };

  const tenantNameById = (tenantId?: number) =>
    tenants.find((tenant) => tenant.tenantId === tenantId)?.tenantName || '默认租户';

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">ROLE MANAGEMENT</p>
          <h2>角色管理</h2>
          <span>管理角色权限、菜单授权、数据范围和互斥规则</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          {canEditRole ? (
            <Button variant="outline" size="sm" onClick={handleOpenMutexDialog}>
              <Shield size={16} />
              互斥规则
            </Button>
          ) : null}
          {canAddRole ? (
            <Button size="sm" onClick={() => handleOpenModal()}>
              <Plus size={16} />
              新增角色
            </Button>
          ) : null}
        </div>
      </header>

      <section className="admin-source-stat-grid">
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
      <form
        onSubmit={handleSearch}
        className="admin-users-filter-grid admin-roles-filter-grid"
      >
        <label className="admin-source-search">
          <span className="input-label">搜索角色</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.roleName}
              onChange={(event) =>
                setFilters((current) => ({ ...current, roleName: event.target.value }))
              }
              placeholder="角色名称"
              type="search"
            />
          </div>
        </label>

        <label>
          <span className="input-label">权限字符</span>
          <Input
            value={filters.roleKey}
            onChange={(event) =>
              setFilters((current) => ({ ...current, roleKey: event.target.value }))
            }
            placeholder="例如 ADMIN"
            className="h-[42px] font-mono"
          />
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
    <InnerTableSurface className="admin-roles-table-panel">
      <table className="unity-data-table admin-source-table admin-roles-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>角色名称</th>
              <th>权限字符</th>
              <th>所属租户</th>
              <th>排序</th>
              <th>数据范围</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={8} title="正在加载角色数据..." loading />
            ) : error ? (
              <TableStateRow colSpan={8} title="角色数据加载失败" description={error} />
            ) : roles.length === 0 ? (
              <TableStateRow colSpan={8} title="暂无角色数据" />
            ) : (
              roles.map((role) => (
                <tr key={role.roleId}>
                  <td className="text-sm text-slate-500 dark:text-slate-400">
                    {role.roleId}
                  </td>
                  <td>
                    <div className="admin-roles-name">
                      <span className="admin-roles-icon">
                        <Shield size={16} />
                      </span>
                      <div className="min-w-0">
                        <strong>
                          {role.roleName}
                        </strong>
                        <small>
                          菜单授权 {normalizeNumberList(role.menuIds).length} 项
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="admin-roles-code">{role.roleKey}</span>
                  </td>
                  <td>
                    <div className="admin-roles-tenant">
                      <Building2 size={14} />
                      <span>{tenantNameById(role.tenantId)}</span>
                    </div>
                  </td>
                  <td>
                    <span className="admin-roles-order">{role.roleSort}</span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'badge',
                        Number(role.dsType) === 1 ? 'badge-violet' : 'badge-gray',
                      )}
                    >
                      {dsTypeMap[Number(role.dsType)] || '未设置'}
                    </span>
                  </td>
                  <td>
                    <span className="admin-users-status">
                      <i className={role.status === '0' ? 'active' : 'disabled'} />
                      {role.status === '0' ? '正常' : '停用'}
                    </span>
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      {canEditRole ? (
                        <button type="button" title="编辑角色" onClick={() => handleOpenModal(role)}>
                          <Edit size={15} />
                        </button>
                      ) : null}
                      {canRemoveRole ? (
                        <button
                          type="button"
                          className="danger"
                          title="删除角色"
                          onClick={() => setPendingDeleteRole(role)}
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
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
      <section className="admin-source-page admin-roles-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={isModalOpen}
        title={isEdit ? '编辑角色' : '新增角色'}
        onClose={handleCloseModal}
        maxWidthClassName="max-w-5xl"
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleCloseModal}>
              取消
            </Button>
            <Button onClick={() => void 0} type="submit" form="role-form" disabled={roleDetailLoading}>
              {isEdit ? '保存修改' : '创建角色'}
            </Button>
          </div>
        }
      >
        <form id="role-form" onSubmit={handleSubmit} className="admin-source-form-grid admin-roles-form-grid">
          {roleDetailLoading ? (
            <div className="admin-source-form-wide flex items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-[#0b7894] dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-[#d8f3fa]">
              <LoadingSpinner size="sm" />
              正在加载角色授权...
            </div>
          ) : null}

            <div className="admin-dialog-field">
              <Label>
                角色名称 <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={formData.roleName}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, roleName: event.target.value }))
                }
                placeholder="例如：系统管理员"
              />
            </div>

            <div className="admin-dialog-field">
              <Label>
                权限字符 <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={formData.roleKey}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, roleKey: event.target.value }))
                }
                placeholder="例如：ADMIN"
              />
            </div>

            <div className="admin-dialog-field">
              <Label>显示排序</Label>
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

            <div className="admin-dialog-field">
              <Label>所属租户</Label>
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

            <div className="admin-dialog-field">
              <Label>状态</Label>
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

            <div className="admin-dialog-field">
              <Label>数据权限范围</Label>
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

          <section className="admin-source-form-wide admin-roles-permission-grid">
            {formData.dsType === 1 ? (
              <div className="admin-roles-tree-card">
                <div className="admin-source-section-head">
                  <div>
                    <strong>自定义部门范围</strong>
                    <span>控制该角色可以查看的数据组织边界</span>
                  </div>
                </div>
                <div className="admin-roles-tree-panel">
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

            <div className="admin-roles-tree-card">
              <div className="admin-source-section-head">
                <div>
                  <strong>菜单权限</strong>
                  <span>勾选后将同步包含下级菜单节点</span>
                </div>
                <span className="admin-users-filter-count">已选 {formData.menuIds.length} 项</span>
              </div>
              <div className="admin-roles-tree-panel admin-roles-menu-tree">
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
                    onToggleCheck={roleDetailLoading ? () => undefined : toggleMenuCheck}
                  />
                ) : (
                  <div className="px-2 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                    暂无菜单数据
                  </div>
                )}
              </div>
            </div>
          </section>
        </form>
      </BaseDialog>

      <BaseDialog
        open={isMutexDialogOpen}
        title="角色互斥规则"
        onClose={handleCloseMutexDialog}
        maxWidthClassName="max-w-4xl"
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleCloseMutexDialog}>
              关闭
            </Button>
          </div>
        }
      >
        <div className="admin-dialog-stack admin-roles-mutex-dialog">
          <section className="card admin-source-panel no-padding">
            <div className="admin-source-section-head admin-roles-mutex-head">
              <div>
                <strong>新增互斥规则</strong>
                <span>互斥角色 = 不能同时授予同一用户的角色组合。</span>
              </div>
            </div>
            <div className="admin-roles-mutex-body">
              <div className="admin-roles-mutex-grid">
                <div className="admin-dialog-field">
                  <Label>角色 A</Label>
                  <Select
                    value={mutexForm.roleId1}
                    onValueChange={(value) => setMutexForm((current) => ({ ...current, roleId1: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="请选择角色 A" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT_VALUE}>请选择角色 A</SelectItem>
                      {roleOptions.map((role) => (
                        <SelectItem key={`mutex-role-1-${role.roleId}`} value={String(role.roleId)}>
                          {role.roleName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="admin-dialog-field">
                  <Label>角色 B</Label>
                  <Select
                    value={mutexForm.roleId2}
                    onValueChange={(value) => setMutexForm((current) => ({ ...current, roleId2: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="请选择角色 B" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT_VALUE}>请选择角色 B</SelectItem>
                      {roleOptions.map((role) => (
                        <SelectItem key={`mutex-role-2-${role.roleId}`} value={String(role.roleId)}>
                          {role.roleName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button onClick={handleAddMutexRule} disabled={mutexLoading}>
                    <Plus size={15} />
                    添加规则
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <InnerTableSurface className="admin-roles-mutex-table-panel">
            <table className="unity-data-table admin-source-table admin-roles-mutex-table">
              <thead>
                <tr>
                  <th>角色 A</th>
                  <th>角色 B</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {mutexLoading ? (
                  <TableStateRow colSpan={4} title="正在加载互斥规则..." loading />
                ) : mutexRules.length === 0 ? (
                  <TableStateRow colSpan={4} title="暂无互斥规则" description="当前租户还没有配置角色互斥约束。" />
                ) : (
                  mutexRules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="text-sm text-slate-700 dark:text-slate-200">
                        {roleNameById.get(rule.roleId1) || `角色 #${rule.roleId1}`}
                      </td>
                      <td className="text-sm text-slate-700 dark:text-slate-200">
                        {roleNameById.get(rule.roleId2) || `角色 #${rule.roleId2}`}
                      </td>
                      <td className="text-sm text-slate-500 dark:text-slate-400">
                        {rule.createTime || '-'}
                      </td>
                      <td>
                        <div className="admin-users-row-actions">
                          <button
                            type="button"
                            className="danger"
                            title="删除规则"
                            onClick={() => setPendingDeleteMutexRule(rule)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </InnerTableSurface>
        </div>
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

      <ConfirmDialog
        open={Boolean(pendingDeleteMutexRule)}
        title="删除互斥规则"
        message={
          pendingDeleteMutexRule
            ? `确定删除互斥规则“${roleNameById.get(pendingDeleteMutexRule.roleId1) || pendingDeleteMutexRule.roleId1} / ${roleNameById.get(pendingDeleteMutexRule.roleId2) || pendingDeleteMutexRule.roleId2}”吗？`
            : ''
        }
        confirmText="确认删除"
        cancelText="取消"
        danger
        onCancel={() => setPendingDeleteMutexRule(null)}
        onConfirm={() => void handleDeleteMutexRule()}
      />
    </>
  );
};

export default RoleList;
