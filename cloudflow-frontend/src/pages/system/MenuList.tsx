import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit,
  File,
  Folder,
  Layout,
  LayoutTemplate,
  Plus,
  Search,
  Trash2,
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
import { addMenu, deleteMenu, getMenuList, updateMenu } from '../../services/api/auth';

type MenuNode = {
  menuId: number;
  parentId: number;
  menuType: 'M' | 'C' | 'F';
  menuName: string;
  orderNum: number;
  path?: string;
  component?: string;
  perms?: string;
  icon?: string;
  status: string;
  children?: MenuNode[];
};

const buildTree = (items: MenuNode[], parentId: number = 0): MenuNode[] => {
  return items
    .filter((item) => item.parentId === parentId)
    .map((item) => ({
      ...item,
      children: buildTree(items, item.menuId),
    }))
    .sort((a, b) => a.orderNum - b.orderNum);
};

const flattenMenuOptions = (nodes: MenuNode[], level = 0): Array<{ item: MenuNode; level: number }> => {
  const result: Array<{ item: MenuNode; level: number }> = [];
  for (const node of nodes) {
    result.push({ item: node, level });
    if (node.children?.length) {
      result.push(...flattenMenuOptions(node.children, level + 1));
    }
  }
  return result;
};

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const menuTypeMeta: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  M: {
    label: '目录',
    className: 'border border-cyan-200 bg-cyan-50 text-cyan-700',
    icon: <Folder size={14} />,
  },
  C: {
    label: '菜单',
    className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    icon: <Layout size={14} />,
  },
  F: {
    label: '按钮',
    className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/80',
    icon: <File size={14} />,
  },
};

export const MenuList = () => {
  const [menus, setMenus] = useState<MenuNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuNode | null>(null);
  const [formData, setFormData] = useState({
    parentId: 0,
    menuType: 'M',
    menuName: '',
    orderNum: 0,
    path: '',
    component: '',
    perms: '',
    icon: '',
    status: '0',
  });

  React.useEffect(() => {
    void fetchMenus();
  }, []);

  const fetchMenus = async () => {
    setLoading(true);
    try {
      const response = await getMenuList();
      if (Array.isArray(response)) {
        const tree = buildTree(response, 0);
        setMenus(tree);
        setExpandedKeys(response.filter((item) => item.parentId === 0).map((item) => item.menuId));
      } else {
        setMenus([]);
      }
    } catch (error) {
      console.error(error);
      toast.error('加载菜单失败');
    } finally {
      setLoading(false);
    }
  };

  const flatOptions = useMemo(() => flattenMenuOptions(menus), [menus]);

  const filterMenuTree = (nodes: MenuNode[], keyword: string): MenuNode[] => {
    const lowerKeyword = keyword.trim().toLowerCase();
    if (!lowerKeyword) return nodes;

    return nodes
      .map((node) => {
        const children = node.children ? filterMenuTree(node.children, lowerKeyword) : [];
        const matched = [node.menuName, node.path, node.component, node.perms]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(lowerKeyword));

        if (matched || children.length > 0) {
          return { ...node, children } as MenuNode;
        }
        return null;
      })
      .filter((item): item is MenuNode => Boolean(item));
  };

  const filteredMenus = useMemo(() => filterMenuTree(menus, searchTerm), [menus, searchTerm]);

  const menuCounts = useMemo(() => {
    const flat = flatOptions.map((option) => option.item);
    return {
      total: flat.length,
      dir: flat.filter((item) => item.menuType === 'M').length,
      page: flat.filter((item) => item.menuType === 'C').length,
      button: flat.filter((item) => item.menuType === 'F').length,
    };
  }, [flatOptions]);

  const toggleExpand = (id: number) => {
    setExpandedKeys((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
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
        status: menu.status,
      });
    } else {
      setEditingMenu(null);
      setFormData({
        parentId: parentId || 0,
        menuType: 'M',
        menuName: '',
        orderNum: 0,
        path: '',
        component: '',
        perms: '',
        icon: '',
        status: '0',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.menuName.trim()) {
      toast.error('请填写菜单名称');
      return;
    }

    try {
      if (editingMenu) {
        await updateMenu({ ...formData, menuId: editingMenu.menuId });
        toast.success('菜单更新成功');
      } else {
        await addMenu(formData);
        toast.success('菜单创建成功');
      }
      setIsModalOpen(false);
      await fetchMenus();
    } catch (error) {
      console.error(error);
      toast.error('保存菜单失败');
    }
  };

  const handleDelete = async (menuId: number) => {
    if (!window.confirm('确认删除该菜单吗？')) {
      return;
    }

    try {
      await deleteMenu(menuId);
      toast.success('菜单删除成功');
      await fetchMenus();
    } catch (error) {
      console.error(error);
      toast.error('删除失败，请确认该菜单下没有子节点');
    }
  };

  const renderRows = (nodes: MenuNode[], level: number = 0): React.ReactNode => {
    return nodes.map((node) => {
      const meta = menuTypeMeta[node.menuType] || menuTypeMeta.M;
      const expanded = expandedKeys.includes(node.menuId);
      const showChildren = expanded && node.children && node.children.length > 0;

      return (
        <React.Fragment key={node.menuId}>
          <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50">
            <td className="px-4 py-3 text-sm text-slate-900">
              <div className="flex items-center" style={{ paddingLeft: `${level * 22}px` }}>
                {node.children && node.children.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(node.menuId)}
                    className="mr-2 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                ) : (
                  <span className="mr-2 inline-block w-6" />
                )}
                <span className="truncate font-medium">{node.menuName}</span>
              </div>
            </td>
            <td className="px-4 py-3 text-sm text-slate-500">{node.icon || '-'}</td>
            <td className="px-4 py-3 text-sm text-slate-600">{node.orderNum}</td>
            <td className="px-4 py-3 text-sm text-slate-600">{node.perms || '-'}</td>
            <td className="px-4 py-3 text-sm text-slate-600">{node.component || '-'}</td>
            <td className="px-4 py-3">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>
                {meta.icon}
                {meta.label}
              </span>
            </td>
            <td className="px-4 py-3 text-right">
              <TableRowActions
                align="end"
                actions={[
                  {
                    label: '编辑',
                    icon: <Edit size={14} />,
                    onClick: () => handleOpenModal(node),
                    tone: 'primary',
                  },
                  {
                    label: '新增',
                    icon: <Plus size={14} />,
                    onClick: () => handleOpenModal(undefined, node.menuId),
                    tone: 'info',
                  },
                  {
                    label: '删除',
                    icon: <Trash2 size={14} />,
                    onClick: () => handleDelete(node.menuId),
                    tone: 'danger',
                  },
                ]}
              />
            </td>
          </tr>
          {showChildren ? renderRows(node.children!, level + 1) : null}
        </React.Fragment>
      );
    });
  };

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const overviewItems = [
    { label: '当前结果', value: `${searchTerm ? flattenMenuOptions(filteredMenus).length : menuCounts.total} 个节点` },
    { label: '目录', value: `${menuCounts.dir} 个` },
    { label: '菜单页', value: `${menuCounts.page} 个` },
    { label: '按钮', value: `${menuCounts.button} 个` },
  ];
  const heroMetrics = [
    {
      label: '节点总数',
      value: `${menuCounts.total}`,
      hint: '包含目录、菜单和按钮',
      icon: <LayoutTemplate size={17} />,
    },
    {
      label: '目录',
      value: `${menuCounts.dir}`,
      hint: '用于组织导航结构',
      icon: <Folder size={17} />,
    },
    {
      label: '菜单页',
      value: `${menuCounts.page}`,
      hint: '可映射前端路由页面',
      icon: <Layout size={17} />,
    },
    {
      label: '按钮',
      value: `${menuCounts.button}`,
      hint: '通常作为细粒度权限点',
      icon: <File size={17} />,
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
                <LayoutTemplate size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{timeLabel}</span>
            </div>
          )}
          title="菜单管理"
          description="把树状菜单配置页也拉到统一工作台体系，目录、菜单页和按钮在同一视觉语言下维护。"
          actions={(
            <Button size="lg" onClick={() => handleOpenModal()}>
              <Plus size={15} />
              新增菜单
            </Button>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        />

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="菜单树"
              total={searchTerm ? flattenMenuOptions(filteredMenus).length : menuCounts.total}
              hasActiveFilters={Boolean(searchTerm.trim())}
              overviewItems={overviewItems}
              headerBadges={(
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
                    支持树形展开与增量维护
                  </span>
                </div>
              )}
              quickFilterAside={searchTerm ? (
                <Button variant="outline" size="sm" onClick={() => setSearchTerm('')}>
                  清空搜索
                </Button>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400">
                  当前显示完整菜单树
                </span>
              )}
              filterBar={(
                <div className="relative">
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="按名称、路由、组件或权限字符搜索"
                    className="pl-10"
                  />
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                </div>
              )}
            />

            <WorkspaceResultCard
              total={searchTerm ? flattenMenuOptions(filteredMenus).length : menuCounts.total}
              description="树状结构和表单配置统一到同一页面骨架，避免系统页和业务页观感割裂。"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <TableHeader>
                    <tr>
                      <TableHead className="w-[320px]">菜单名称</TableHead>
                      <TableHead>图标</TableHead>
                      <TableHead>排序</TableHead>
                      <TableHead>权限标识</TableHead>
                      <TableHead>组件路径</TableHead>
                      <TableHead>类型</TableHead>
                      <TableActionHead className="w-60">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={7} type="loading" title="正在加载菜单数据..." />
                    ) : filteredMenus.length === 0 ? (
                      <WorkspaceTableStateRow colSpan={7} title="暂无菜单数据" description="可以先新增目录或菜单页，再逐步补充路由和权限标识。" />
                    ) : (
                      renderRows(filteredMenus)
                    )}
                  </tbody>
                </table>
              </div>
            </WorkspaceResultCard>
          </div>
        </Card>

        {isModalOpen ? (
          <WorkspaceDialogShell
            title={editingMenu ? '编辑菜单' : '新增菜单'}
            description="按统一的配置顺序填写层级、类型、名称和路由元数据。"
            onClose={() => setIsModalOpen(false)}
            maxWidthClassName="max-w-4xl"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">结构信息</div>
                  <div className="mt-1 text-sm text-slate-500">先确定菜单挂载位置、节点类型与展示顺序，再补充路由相关配置。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">上级菜单</label>
                    <Select
                      value={String(formData.parentId)}
                      onValueChange={(value) => setFormData({ ...formData, parentId: parseInt(value, 10) || 0 })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="主目录" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">主目录</SelectItem>
                        {flatOptions
                          .filter(({ item }) => item.menuType !== 'F' && item.menuId !== editingMenu?.menuId)
                          .map(({ item, level }) => (
                            <SelectItem key={item.menuId} value={String(item.menuId)}>
                              {'　'.repeat(level)}
                              {item.menuName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">菜单类型</label>
                    <Select
                      value={formData.menuType}
                      onValueChange={(value) => setFormData({ ...formData, menuType: value as 'M' | 'C' | 'F' })}
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
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      菜单名称 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.menuName}
                      onChange={(event) => setFormData({ ...formData, menuName: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">显示排序</label>
                    <Input
                      type="number"
                      value={formData.orderNum}
                      onChange={(event) => setFormData({ ...formData, orderNum: parseInt(event.target.value, 10) || 0 })}
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">路由与权限</div>
                  <div className="mt-1 text-sm text-slate-500">目录、菜单和按钮会根据类型展示不同配置项，避免无关字段干扰录入。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {formData.menuType !== 'F' ? (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">图标</label>
                      <Input
                        value={formData.icon}
                        onChange={(event) => setFormData({ ...formData, icon: event.target.value })}
                        placeholder="Lucide 图标名"
                      />
                    </div>
                  ) : null}
                  {formData.menuType !== 'F' ? (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">路由地址</label>
                      <Input
                        value={formData.path}
                        onChange={(event) => setFormData({ ...formData, path: event.target.value })}
                        placeholder="如：system/users"
                      />
                    </div>
                  ) : null}
                  {formData.menuType === 'C' ? (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">组件路径</label>
                      <Input
                        value={formData.component}
                        onChange={(event) => setFormData({ ...formData, component: event.target.value })}
                        placeholder="如：system/UserList"
                      />
                    </div>
                  ) : null}
                  {formData.menuType !== 'M' ? (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">权限字符</label>
                      <Input
                        value={formData.perms}
                        onChange={(event) => setFormData({ ...formData, perms: event.target.value })}
                        placeholder="如：system:user:list"
                      />
                    </div>
                  ) : null}
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
                </div>
              </section>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
                  取消
                </Button>
                <Button type="submit">{editingMenu ? '保存修改' : '立即创建'}</Button>
              </div>
            </form>
          </WorkspaceDialogShell>
        ) : null}
      </WorkspacePageContent>
    </div>
  );
};

export default MenuList;
