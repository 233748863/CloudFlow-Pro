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
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
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
  TableRowActions,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { addMenu, deleteMenu, getMenuList, updateMenu, type SysMenu } from '../../services/api/auth';
import { cn } from '@/utils/cn';

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

const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

const menuTypeMeta: Record<
  MenuNode['menuType'],
  { label: string; icon: React.ReactNode; className: string }
> = {
  M: {
    label: '目录',
    icon: <Folder size={14} />,
    className:
      'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200',
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
      'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300',
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
}> = ({ colSpan, title, loading = false }) => (
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </TableCell>
  </TableRow>
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
          <TableRow>
            <TableCell>
              <div className="flex items-start" style={{ paddingLeft: `${level * 22}px` }}>
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(node.menuId)}
                    className="mr-2 mt-0.5 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                    aria-label={showChildren ? '折叠菜单' : '展开菜单'}
                  >
                    {showChildren ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                ) : (
                  <span className="mr-2 inline-block w-6" />
                )}

                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {node.menuName}
                  </div>
                  {node.path || node.component ? (
                    <div className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                      {[node.path ? `路由 ${node.path}` : '', node.component ? `组件 ${node.component}` : '']
                        .filter(Boolean)
                        .join(' / ')}
                    </div>
                  ) : null}
                </div>
              </div>
            </TableCell>

            <TableCell className="text-sm text-slate-600 dark:text-slate-300">
              {node.icon ? (
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-900">
                  {node.icon}
                </span>
              ) : (
                '-'
              )}
            </TableCell>

            <TableCell className="text-sm text-slate-600 dark:text-slate-300">
              {node.orderNum}
            </TableCell>

            <TableCell>
              {node.perms ? (
                <code className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {node.perms}
                </code>
              ) : (
                <span className="text-sm text-slate-400 dark:text-slate-500">-</span>
              )}
            </TableCell>

            <TableCell>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                  meta.className,
                )}
              >
                {meta.icon}
                {meta.label}
              </span>
            </TableCell>

            <TableCell>
              <span
                className={cn(
                  'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                  getMenuStatusBadgeClassName(node.status),
                )}
              >
                {node.status === '0' ? '正常' : '停用'}
              </span>
            </TableCell>

            <TableCell>
              <TableRowActions
                align="end"
                actions={[
                  {
                    label: '编辑菜单',
                    icon: <Edit size={15} />,
                    onClick: () => handleOpenModal(node),
                    tone: 'neutral',
                  },
                  {
                    label: '新增子节点',
                    icon: <Plus size={15} />,
                    onClick: () => handleOpenModal(undefined, node.menuId),
                    hidden: node.menuType === 'F',
                    tone: 'info',
                  },
                  {
                    label: '删除菜单',
                    icon: <Trash2 size={15} />,
                    onClick: () => setPendingDeleteMenu(node),
                    tone: 'danger',
                  },
                ]}
              />
            </TableCell>
          </TableRow>
          {showChildren ? renderRows(node.children || [], level + 1) : null}
        </React.Fragment>
      );
    });

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
              <div className="relative w-full sm:w-72">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="搜索名称、路由、组件或权限字符"
                  className="h-10 pl-10"
                />
              </div>

              <Button type="submit" size="sm">
                查询
              </Button>

              {hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  清空
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
                新增菜单
              </Button>
            </div>
          </div>
        }
        table={(<TableSurfaceCard><>
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[420px]">菜单名称</TableHead>
                  <TableHead>图标</TableHead>
                  <TableHead>排序</TableHead>
                  <TableHead>权限标识</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableActionHead className="w-36">操作</TableActionHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableStateRow colSpan={7} title="正在加载菜单数据..." loading />
                ) : error ? (
                  <TableStateRow colSpan={7} title="菜单数据加载失败" description={error} />
                ) : filteredMenus.length === 0 ? (
                  <TableStateRow colSpan={7} title="暂无菜单数据" />
                ) : (
                  renderRows(filteredMenus)
                )}
              </TableBody>
            </Table>
          </></TableSurfaceCard>)}
      />

      <BaseDialog
        open={isModalOpen}
        title={isEdit ? '编辑菜单' : '新增菜单'}
        onClose={handleCloseModal}
        maxWidthClassName="max-w-4xl"
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
        <form id="menu-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className={fieldLabelClassName}>上级菜单</label>
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

            <div>
              <label className={fieldLabelClassName}>菜单类型</label>
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

            <div>
              <label className={fieldLabelClassName}>
                菜单名称 <span className="text-rose-500">*</span>
              </label>
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

            <div>
              <label className={fieldLabelClassName}>显示排序</label>
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
              <div>
                <label className={fieldLabelClassName}>路由地址</label>
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
              <div>
                <label className={fieldLabelClassName}>组件路径</label>
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

            <div>
              <label className={fieldLabelClassName}>权限标识</label>
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

            <div>
              <label className={fieldLabelClassName}>图标标识</label>
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

            <div>
              <label className={fieldLabelClassName}>状态</label>
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

