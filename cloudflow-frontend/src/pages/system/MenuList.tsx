import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit,
  File,
  Folder,
  Layout,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, ConfirmDialog } from '@/components/common';
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
import { addMenu, deleteMenu, getMenuList, updateMenu, type SysMenu } from '../../services/api/auth';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

type MenuNode = Omit<SysMenu, 'menuId' | 'parentId' | 'menuType' | 'menuName' | 'orderNum' | 'status' | 'children'> & {
  menuId: number;
  parentId: number;
  menuType: 'M' | 'C' | 'F';
  menuName: string;
  orderNum: number;
  status: string;
  children?: MenuNode[];
};

type MenuFormData = {
  parentId: number;
  menuType: 'M' | 'C' | 'F';
  menuName: string;
  orderNum: number;
  path: string;
  component: string;
  perms: string;
  icon: string;
  status: string;
};

const DEFAULT_FORM_DATA: MenuFormData = {
  parentId: 0,
  menuType: 'M',
  menuName: '',
  orderNum: 0,
  path: '',
  component: '',
  perms: '',
  icon: '',
  status: '0',
};

const menuTypeMeta: Record<
  MenuNode['menuType'],
  { label: string; icon: React.ReactNode; className: string }
> = {
  M: {
    label: '目录',
    icon: <Folder size={14} />,
    className:
      'border border-[#b8e7f1] bg-[#effbfe] text-[#0b7894] dark:border-[#0d95b5]/40 dark:bg-[#0d95b5]/15 dark:text-[#d8f3fa]',
  },
  C: {
    label: '菜单',
    icon: <Layout size={14} />,
    className:
      'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200',
  },
  F: {
    label: '按钮',
    icon: <File size={14} />,
    className:
      'border border-slate-200 bg-[var(--cf-surface-strong)] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300',
  },
};

const getMenuStatusBadgeClassName = (status: string) =>
  status === '0'
    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
    : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        ) : null}
      </div>
    </td>
  </tr>
);

const buildTree = (items: MenuNode[], parentId = 0): MenuNode[] =>
  items
    .filter((item) => item.parentId === parentId)
    .map((item) => ({
      ...item,
      children: buildTree(items, item.menuId),
    }))
    .sort((left, right) => left.orderNum - right.orderNum);

const flattenMenuOptions = (
  nodes: MenuNode[],
  level = 0,
): Array<{ item: MenuNode; level: number }> => {
  const result: Array<{ item: MenuNode; level: number }> = [];

  nodes.forEach((node) => {
    result.push({ item: node, level });
    if (node.children?.length) {
      result.push(...flattenMenuOptions(node.children, level + 1));
    }
  });

  return result;
};

const filterMenuTree = (nodes: MenuNode[], keyword: string): MenuNode[] => {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return nodes;

  return nodes.flatMap((node) => {
      const children = node.children ? filterMenuTree(node.children, normalized) : [];
      const matched = [node.menuName, node.path, node.component, node.perms, node.icon]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));

      if (matched || children.length > 0) {
        return [{ ...node, children }];
      }

      return [];
    });
};

const collectDescendantIds = (node?: MenuNode | null): Set<number> => {
  const ids = new Set<number>();

  const walk = (current?: MenuNode) => {
    current?.children?.forEach((child) => {
      ids.add(child.menuId);
      walk(child);
    });
  };

  walk(node || undefined);
  return ids;
};

export const MenuList = () => {
  const [menus, setMenus] = useState<MenuNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuNode | null>(null);
  const [pendingDeleteMenu, setPendingDeleteMenu] = useState<MenuNode | null>(null);
  const [formData, setFormData] = useState<MenuFormData>(DEFAULT_FORM_DATA);

  const normalizeMenuListResponse = (response: any): MenuNode[] => {
    const list = Array.isArray(response)
      ? response
      : Array.isArray(response?.rows)
        ? response.rows
        : Array.isArray(response?.records)
          ? response.records
          : [];

    return list.map((item: any) => ({
      ...item,
      menuId: Number(item.menuId),
      parentId: Number(item.parentId || 0),
      menuType: (item.menuType || 'M') as 'M' | 'C' | 'F',
      menuName: String(item.menuName || ''),
      orderNum: Number(item.orderNum || 0),
      status: String(item.status || '0'),
    }));
  };

  const fetchMenus = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getMenuList();
      const normalized = normalizeMenuListResponse(response);
      const tree = buildTree(normalized, 0);

      setMenus(tree);
      setExpandedKeys(
        normalized.filter((item) => item.parentId === 0).map((item) => item.menuId),
      );
    } catch (fetchError) {
      console.error(fetchError);
      const message = '加载菜单失败，请稍后重试。';
      setError(message);
      setMenus([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMenus();
  }, []);

  const flatOptions = useMemo(() => flattenMenuOptions(menus), [menus]);
  const filteredMenus = useMemo(() => filterMenuTree(menus, searchTerm), [menus, searchTerm]);
  const editingDescendants = useMemo(() => collectDescendantIds(editingMenu), [editingMenu]);
  const availableParents = useMemo(
    () =>
      flatOptions.filter(({ item }) => {
        if (item.menuType === 'F') {
          return false;
        }

        if (!editingMenu) {
          return true;
        }

        return item.menuId !== editingMenu.menuId && !editingDescendants.has(item.menuId);
      }),
    [editingDescendants, editingMenu, flatOptions],
  );

  const hasActiveFilters = Boolean(searchTerm.trim());
  const isEdit = Boolean(editingMenu);
  const stats = useMemo(
    () => [
      {
        label: '菜单节点',
        value: String(flatOptions.length),
        meta: hasActiveFilters ? '当前筛选' : '全部层级',
        icon: <Layout size={18} />,
        tone: 'blue',
      },
      {
        label: '目录',
        value: String(flatOptions.filter(({ item }) => item.menuType === 'M').length),
        meta: '导航分组',
        icon: <Folder size={18} />,
        tone: 'green',
      },
      {
        label: '页面菜单',
        value: String(flatOptions.filter(({ item }) => item.menuType === 'C').length),
        meta: '可访问页面',
        icon: <File size={18} />,
        tone: 'amber',
      },
      {
        label: '按钮权限',
        value: String(flatOptions.filter(({ item }) => item.menuType === 'F').length),
        meta: '操作授权',
        icon: <ChevronRight size={18} />,
        tone: 'violet',
      },
    ],
    [flatOptions, hasActiveFilters],
  );

  const handleRefresh = () => {
    void fetchMenus();
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearchTerm(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchTerm('');
  };

  const handleOpenModal = (menu?: MenuNode, parentId?: number) => {
    if (menu) {
      setEditingMenu(menu);
      setFormData({
        parentId: menu.parentId,
        menuType: menu.menuType,
        menuName: menu.menuName,
        orderNum: menu.orderNum,
        path: menu.path || '',
        component: menu.component || '',
        perms: menu.perms || '',
        icon: menu.icon || '',
        status: menu.status || '0',
      });
    } else {
      setEditingMenu(null);
      setFormData({
        ...DEFAULT_FORM_DATA,
        parentId: parentId || 0,
      });
    }

    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingMenu(null);
    setFormData(DEFAULT_FORM_DATA);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.menuName.trim()) {
      toast.error('请填写菜单名称');
      return;
    }

    try {
      const payload: SysMenu = {
        ...formData,
        menuName: formData.menuName.trim(),
        orderNum: Number(formData.orderNum || 0),
        path: formData.path.trim(),
        component: formData.component.trim(),
        perms: formData.perms.trim(),
        icon: formData.icon.trim(),
      };

      if (editingMenu?.menuId) {
        await updateMenu({ ...payload, menuId: editingMenu.menuId });
        toast.success('菜单更新成功');
      } else {
        await addMenu(payload);
        toast.success('菜单创建成功');
      }

      handleCloseModal();
      await fetchMenus();
    } catch (submitError) {
      console.error(submitError);
      toast.error(getErrorMessage(submitError, '保存菜单失败'));
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteMenu) {
      return;
    }

    try {
      await deleteMenu(pendingDeleteMenu.menuId);
      toast.success('菜单删除成功');
      setPendingDeleteMenu(null);
      await fetchMenus();
    } catch (deleteError) {
      console.error(deleteError);
      toast.error('删除失败，请确认该菜单下没有子节点');
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedKeys((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const renderRows = (nodes: MenuNode[], level = 0): React.ReactNode =>
    nodes.map((node) => {
      const meta = menuTypeMeta[node.menuType];
      const expanded = expandedKeys.includes(node.menuId);
      const hasChildren = Boolean(node.children?.length);
      const showChildren = hasChildren && (hasActiveFilters || expanded);

      return (
        <React.Fragment key={node.menuId}>
          <tr>
            <td>
              <div className="admin-menus-node" style={{ paddingLeft: `${level * 22}px` }}>
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(node.menuId)}
                    className="admin-menus-expand"
                    aria-label={showChildren ? '折叠菜单' : '展开菜单'}
                  >
                    {showChildren ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                ) : (
                  <span className="admin-menus-expand-placeholder" />
                )}

                <div>
                  <strong>{node.menuName}</strong>
                  {node.path || node.component ? (
                    <small>
                      {[node.path ? `路由 ${node.path}` : '', node.component ? `组件 ${node.component}` : '']
                        .filter(Boolean)
                        .join(' / ')}
                    </small>
                  ) : null}
                </div>
              </div>
            </td>

            <td>
              {node.icon ? (
                <span className="admin-source-chip admin-menus-icon-text">
                  {node.icon}
                </span>
              ) : (
                '-'
              )}
            </td>

            <td className="admin-source-mono">{node.orderNum}</td>

            <td>
              {node.perms ? (
                <code className="admin-source-code">
                  {node.perms}
                </code>
              ) : (
                <span className="text-sm text-slate-400 dark:text-slate-500">-</span>
              )}
            </td>

            <td>
              <span
                className={cn(
                  'inline-flex min-w-[3.5rem] items-center justify-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium',
                  meta.className,
                )}
              >
                {meta.icon}
                {meta.label}
              </span>
            </td>

            <td>
              <span
                className={cn(
                  'inline-flex min-w-[3.25rem] justify-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium',
                  getMenuStatusBadgeClassName(node.status),
                )}
              >
                {node.status === '0' ? '正常' : '停用'}
              </span>
            </td>

            <td className="text-right">
              <div className="admin-users-row-actions">
                <button type="button" title="编辑菜单" onClick={() => handleOpenModal(node)}>
                  <Edit size={15} />
                </button>
                {node.menuType !== 'F' ? (
                  <button
                    type="button"
                    title="新增子节点"
                    onClick={() => handleOpenModal(undefined, node.menuId)}
                  >
                    <Plus size={15} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="danger"
                  title="删除菜单"
                  onClick={() => setPendingDeleteMenu(node)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </td>
          </tr>
          {showChildren ? renderRows(node.children || [], level + 1) : null}
        </React.Fragment>
      );
    });

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">MENU MANAGEMENT</p>
          <h2>菜单管理</h2>
          <span>维护后台导航、路由组件、权限标识和节点状态</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button size="sm" onClick={() => handleOpenModal()}>
            <Plus size={16} />
            新增菜单
          </Button>
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
      <form onSubmit={handleSearch} className="admin-menus-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">菜单搜索</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="名称、路由、组件或权限字符"
              type="search"
            />
          </div>
        </label>

        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">当前 {filteredMenus.length} 项</span>
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
    <InnerTableSurface className="admin-menus-table-panel">
      <table className="unity-data-table admin-source-table admin-menus-table">
          <thead>
            <tr>
              <th>菜单名称</th>
              <th>图标</th>
              <th>排序</th>
              <th>权限标识</th>
              <th>类型</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={7} title="正在加载菜单数据..." loading />
            ) : error ? (
              <TableStateRow colSpan={7} title="菜单数据加载失败" description={error} />
            ) : filteredMenus.length === 0 ? (
              <TableStateRow colSpan={7} title="暂无菜单数据" />
            ) : (
              renderRows(filteredMenus)
            )}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  return (
    <>
      <section className="admin-source-page admin-menus-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
        />
      </section>

      <BaseDialog
        open={isModalOpen}
        title={isEdit ? '编辑菜单' : '新增菜单'}
        onClose={handleCloseModal}
        maxWidthClassName="max-w-4xl"
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleCloseModal}>
              取消
            </Button>
            <Button onClick={() => void 0} type="submit" form="menu-form">
              {isEdit ? '保存修改' : '创建菜单'}
            </Button>
          </div>
        }
      >
        <form id="menu-form" onSubmit={handleSubmit} className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="admin-dialog-field">
              <Label>上级菜单</Label>
              <Select
                value={String(formData.parentId)}
                onValueChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    parentId: Number.parseInt(value, 10) || 0,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="主目录" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">主目录</SelectItem>
                  {availableParents.map(({ item, level }) => (
                    <SelectItem key={item.menuId} value={String(item.menuId)}>
                      {'　'.repeat(level)}
                      {item.menuName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="admin-dialog-field">
              <Label>菜单类型</Label>
              <Select
                value={formData.menuType}
                onValueChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    menuType: value as 'M' | 'C' | 'F',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">目录</SelectItem>
                  <SelectItem value="C">菜单</SelectItem>
                  <SelectItem value="F">按钮</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="admin-dialog-field">
              <Label>
                菜单名称 <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={formData.menuName}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    menuName: event.target.value,
                  }))
                }
                placeholder="请输入菜单名称"
              />
            </div>

            <div className="admin-dialog-field">
              <Label>显示排序</Label>
              <Input
                type="number"
                value={String(formData.orderNum)}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    orderNum: Number.parseInt(event.target.value, 10) || 0,
                  }))
                }
                placeholder="请输入排序值"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {formData.menuType !== 'F' ? (
              <div className="admin-dialog-field">
                <Label>路由地址</Label>
                <Input
                  value={formData.path}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      path: event.target.value,
                    }))
                  }
                  placeholder={formData.menuType === 'M' ? '例如：/system' : '例如：menu'}
                />
              </div>
            ) : null}

            {formData.menuType === 'C' ? (
              <div className="admin-dialog-field">
                <Label>组件路径</Label>
                <Input
                  value={formData.component}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      component: event.target.value,
                    }))
                  }
                  placeholder="例如：system/MenuList"
                />
              </div>
            ) : null}

            <div className="admin-dialog-field">
              <Label>权限标识</Label>
              <Input
                value={formData.perms}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    perms: event.target.value,
                  }))
                }
                placeholder="例如：system:menu:list"
                className="font-mono"
              />
            </div>

            <div className="admin-dialog-field">
              <Label>图标标识</Label>
              <Input
                value={formData.icon}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    icon: event.target.value,
                  }))
                }
                placeholder="例如：system"
              />
            </div>

            <div className="admin-dialog-field">
              <Label>状态</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    status: value,
                  }))
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
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDeleteMenu)}
        title="删除菜单"
        message={
          pendingDeleteMenu
            ? `确定删除菜单“${pendingDeleteMenu.menuName}”吗？如果该菜单下仍有子节点，删除会失败。`
            : ''
        }
        confirmText="确认删除"
        cancelText="取消"
        danger
        onCancel={() => setPendingDeleteMenu(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
};

export default MenuList;

