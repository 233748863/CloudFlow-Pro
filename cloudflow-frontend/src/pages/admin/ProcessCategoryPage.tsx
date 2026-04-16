import React, { useEffect, useMemo, useState } from 'react';
import { processCategoryApi, ProcessCategory } from '../../services/api/processCategory';
import { toast } from 'sonner';
import {
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  FolderKanban,
  FolderTree,
  Layers,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/ui';
import { WorkspaceBackdrop, WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace/WorkspacePanels';

const iconMap: Record<string, React.ReactNode> = {
  'folder-tree': <FolderTree className="w-4 h-4" />,
  briefcase: <Briefcase className="w-4 h-4" />,
  users: <Users className="w-4 h-4" />,
  'dollar-sign': <DollarSign className="w-4 h-4" />,
  building: <Building2 className="w-4 h-4" />,
  'folder-kanban': <FolderKanban className="w-4 h-4" />,
  layers: <Layers className="w-4 h-4" />,
};

const emptyForm: ProcessCategory = {
  parentId: 0,
  categoryName: '',
  categoryCode: '',
  icon: '',
  sortOrder: 0,
  status: '0',
  remark: '',
};

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const ProcessCategoryPage: React.FC = () => {
  const [treeData, setTreeData] = useState<ProcessCategory[]>([]);
  const [flatList, setFlatList] = useState<ProcessCategory[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState<ProcessCategory>({ ...emptyForm });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [treeRes, listRes] = await Promise.all([
        processCategoryApi.tree(),
        processCategoryApi.list(),
      ]);
      const normalizeTree = (items: ProcessCategory[]): ProcessCategory[] =>
        items.map((item) => ({ ...item, children: item.children || [] }));
      const nextTree = normalizeTree(treeRes || []);
      setTreeData(nextTree);
      setFlatList(listRes || []);
      setExpandedKeys(new Set(nextTree.map((item) => item.categoryId!)));
    } catch (error) {
      console.error(error);
      toast.error('加载分类数据失败');
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = (parentId: number = 0) => {
    setIsEdit(false);
    setForm({ ...emptyForm, parentId });
    setModalOpen(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const data = await processCategoryApi.getInfo(id);
      if (data) {
        setIsEdit(true);
        setForm(data);
        setModalOpen(true);
      }
    } catch {
      toast.error('获取分类详情失败');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`确定删除分类“${name}”吗？`)) return;
    try {
      await processCategoryApi.remove(id);
      toast.success('删除成功');
      if (selectedId === id) setSelectedId(null);
      await fetchData();
    } catch (error: any) {
      toast.error(error?.response?.data?.msg || '删除失败');
    }
  };

  const handleSubmit = async () => {
    if (!form.categoryName?.trim()) return void toast.error('请输入分类名称');
    if (!form.categoryCode?.trim()) return void toast.error('请输入分类编码');
    setLoading(true);
    try {
      if (isEdit) {
        await processCategoryApi.edit(form);
        toast.success('修改成功');
      } else {
        await processCategoryApi.add(form);
        toast.success('新增成功');
      }
      setModalOpen(false);
      await fetchData();
    } catch (error: any) {
      toast.error(error?.response?.data?.msg || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const renderIcon = (icon?: string) => iconMap[icon || ''] || <Layers className="w-4 h-4 text-slate-400" />;

  const renderTreeNode = (node: ProcessCategory, level: number = 0): React.ReactNode => {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = expandedKeys.has(node.categoryId!);
    const isSelected = selectedId === node.categoryId;
    return (
      <div key={node.categoryId}>
        <div
          className={`group flex cursor-pointer items-center rounded-[18px] px-3 py-2 transition-colors ${isSelected ? 'bg-pink-50 ring-1 ring-pink-100' : 'hover:bg-white/70'}`}
          style={{ paddingLeft: `${level * 22 + 12}px` }}
          onClick={() => setSelectedId(node.categoryId!)}
        >
          <button
            type="button"
            className="mr-1 flex h-5 w-5 items-center justify-center text-slate-400"
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) toggleExpand(node.categoryId!);
            }}
          >
            {hasChildren ? (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-4" />}
          </button>
          <span className="mr-2 text-pink-500">{renderIcon(node.icon)}</span>
          <span className="flex-1 truncate text-sm font-medium text-slate-700">{node.categoryName}</span>
          <span className="mr-3 hidden text-xs text-slate-400 sm:inline">{node.categoryCode}</span>
          <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${node.status === '0' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-rose-50 text-rose-600 ring-1 ring-rose-100'}`}>{node.status === '0' ? '正常' : '停用'}</span>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-pink-600" onClick={(event) => { event.stopPropagation(); handleAdd(node.categoryId!); }}><Plus className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-pink-500" onClick={(event) => { event.stopPropagation(); void handleEdit(node.categoryId!); }}><Pencil className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={(event) => { event.stopPropagation(); void handleDelete(node.categoryId!, node.categoryName!); }}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
        {hasChildren && isExpanded ? node.children!.map((child) => renderTreeNode(child, level + 1)) : null}
      </div>
    );
  };

  const selectedNode = useMemo(() => flatList.find((item) => item.categoryId === selectedId), [flatList, selectedId]);
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const activeCount = flatList.filter((item) => item.status === '0').length;

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <div className="relative z-10 space-y-3">
        <WorkspaceHeroCard
          badge={<div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500"><span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100"><FolderTree className="h-3.5 w-3.5" />{todayLabel}</span><span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span></div>}
          title="流程分类管理"
          description="统一流程分类树、详情面板和编辑弹窗，让流程治理页也进入同一套工作台结构。"
          actions={<Button onClick={() => handleAdd(0)}><Plus className="h-4 w-4" />新增顶级分类</Button>}
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard label="分类总数" value={flatList.length} hint="当前所有分类节点数" aside={<FolderTree className="h-[18px] w-[18px] text-pink-500" />} />
            <WorkspaceMetricCard label="正常分类" value={activeCount} hint="状态为正常的分类节点" aside={<Layers className="h-[18px] w-[18px] text-emerald-500" />} />
            <WorkspaceMetricCard label="顶级分类" value={treeData.length} hint="树结构中的一级分类数量" aside={<FolderKanban className="h-[18px] w-[18px] text-amber-500" />} />
            <WorkspaceMetricCard label="当前选中" value={selectedNode?.categoryName || '未选择'} hint="右侧详情面板展示的分类" aside={<Briefcase className="h-[18px] w-[18px] text-sky-500" />} />
          </div>
        </WorkspaceHeroCard>

        <div className="grid gap-4 xl:grid-cols-[440px_minmax(0,1fr)]">
          <WorkspaceSectionCard title="分类结构" description="左侧按层级浏览流程分类树，支持快速展开、选择与增删改。">
            {treeData.length === 0 ? (
              <WorkspaceInlineState icon={<FolderTree className="w-5 h-5" />} title="暂无分类数据" className="py-10" />
            ) : (
              <div className="space-y-1">{treeData.map((node) => renderTreeNode(node))}</div>
            )}
          </WorkspaceSectionCard>

          <WorkspaceSectionCard
            title={selectedNode ? selectedNode.categoryName || '分类详情' : '分类详情'}
            description={selectedNode ? '查看当前分类的编码、层级、图标和备注。' : '在左侧选择一个分类查看详情。'}
            headerAside={selectedNode ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void handleEdit(selectedNode.categoryId!)}>编辑分类</Button>
                <Button variant="secondary" onClick={() => handleAdd(selectedNode.categoryId!)}>添加子分类</Button>
              </div>
            ) : undefined}
          >
            {selectedNode ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[22px] border border-white/75 bg-white/72 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.04)]"><div className="text-xs text-slate-400">分类编码</div><div className="mt-2 font-mono text-sm text-slate-900">{selectedNode.categoryCode}</div></div>
                <div className="rounded-[22px] border border-white/75 bg-white/72 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.04)]"><div className="text-xs text-slate-400">排序号</div><div className="mt-2 text-sm text-slate-900">{selectedNode.sortOrder}</div></div>
                <div className="rounded-[22px] border border-white/75 bg-white/72 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.04)]"><div className="text-xs text-slate-400">父分类</div><div className="mt-2 text-sm text-slate-900">{selectedNode.parentId === 0 ? '顶级分类' : selectedNode.parentId}</div></div>
                <div className="rounded-[22px] border border-white/75 bg-white/72 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.04)]"><div className="text-xs text-slate-400">图标</div><div className="mt-2 flex items-center gap-2 text-sm text-slate-900">{renderIcon(selectedNode.icon)}<span>{selectedNode.icon || '无'}</span></div></div>
                <div className="md:col-span-2 rounded-[22px] border border-white/75 bg-white/72 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.04)]"><div className="text-xs text-slate-400">备注</div><div className="mt-2 text-sm leading-7 text-slate-700">{selectedNode.remark || '暂无备注'}</div></div>
              </div>
            ) : (
              <WorkspaceInlineState icon={<FolderTree className="w-5 h-5" />} title="请选择一个分类查看详情" className="py-16" />
            )}
          </WorkspaceSectionCard>
        </div>

        {modalOpen ? (
          <WorkspaceDialogShell title={isEdit ? '编辑分类' : '新增分类'} description="维护分类层级、编码、图标与排序。" onClose={() => setModalOpen(false)} maxWidthClassName="max-w-2xl">
            <div className="space-y-4">
              <div><label className="mb-2 block text-sm font-medium text-slate-700">父分类</label><Select value={String(form.parentId || 0)} onValueChange={(value) => setForm({ ...form, parentId: Number(value) })}><SelectTrigger><SelectValue placeholder="请选择父分类" /></SelectTrigger><SelectContent><SelectItem value="0">顶级分类</SelectItem>{flatList.filter((item) => item.categoryId !== form.categoryId).map((item) => <SelectItem key={item.categoryId} value={String(item.categoryId)}>{item.categoryName} ({item.categoryCode})</SelectItem>)}</SelectContent></Select></div>
              <div><label className="mb-2 block text-sm font-medium text-slate-700">分类名称 <span className="text-red-500">*</span></label><Input value={form.categoryName || ''} onChange={(e) => setForm({ ...form, categoryName: e.target.value })} placeholder="请输入分类名称" /></div>
              <div><label className="mb-2 block text-sm font-medium text-slate-700">分类编码 <span className="text-red-500">*</span></label><Input className="font-mono" value={form.categoryCode || ''} onChange={(e) => setForm({ ...form, categoryCode: e.target.value })} placeholder="如：hr_leave" /></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><label className="mb-2 block text-sm font-medium text-slate-700">图标标识</label><Select value={form.icon || ''} onValueChange={(value) => setForm({ ...form, icon: value })}><SelectTrigger><SelectValue placeholder="无" /></SelectTrigger><SelectContent><SelectItem value="">无</SelectItem><SelectItem value="briefcase">briefcase</SelectItem><SelectItem value="users">users</SelectItem><SelectItem value="dollar-sign">dollar-sign</SelectItem><SelectItem value="building">building</SelectItem><SelectItem value="folder-kanban">folder-kanban</SelectItem><SelectItem value="layers">layers</SelectItem></SelectContent></Select></div>
                <div><label className="mb-2 block text-sm font-medium text-slate-700">排序号</label><Input type="number" value={form.sortOrder ?? 0} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></div>
              </div>
              <div><label className="mb-2 block text-sm font-medium text-slate-700">状态</label><div className="flex gap-4 rounded-[22px] border border-white/75 bg-white/72 px-4 py-3 shadow-[0_10px_20px_rgba(15,23,42,0.04)]"><label className="flex items-center gap-2 text-sm"><input type="radio" checked={form.status === '0'} onChange={() => setForm({ ...form, status: '0' })} className="accent-pink-500" />正常</label><label className="flex items-center gap-2 text-sm"><input type="radio" checked={form.status === '1'} onChange={() => setForm({ ...form, status: '1' })} className="accent-pink-500" />停用</label></div></div>
              <div><label className="mb-2 block text-sm font-medium text-slate-700">备注</label><Textarea rows={3} value={form.remark || ''} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="可选" /></div>
              <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setModalOpen(false)}>取消</Button><Button onClick={handleSubmit} disabled={loading}>{loading ? '提交中...' : '确定'}</Button></div>
            </div>
          </WorkspaceDialogShell>
        ) : null}
      </div>
    </div>
  );
};

export default ProcessCategoryPage;
