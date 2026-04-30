import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpenText,
  CheckCheck,
  Eye,
  FileText,
  Inbox,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Shield,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import FileUpload from '@/components/FileUpload';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Pagination,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectContent,
  SelectItem,
  TableActionHead,
  TableHead,
  TableHeader,
  TableRowActions,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { Role } from '@/types';
import {
  knowledgeApi,
  type KnowledgeDocument,
  type KnowledgeReadStats,
  type KnowledgeScopeType,
  type KnowledgeStatus,
} from '@/services/api/knowledge';
import { renderAnnouncementHtml } from '@/utils/announcementContent';
import { formatDateTimeDisplay } from '@/utils/dateFormat';

type ViewMode = 'library' | 'mine' | 'manage';

const categories = ['行政制度', '办公指南', '财务制度', '人事制度', '项目规范', '其他'];

const statusMeta: Record<KnowledgeStatus, { label: string; className: string }> = {
  DRAFT: { label: '草稿', className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300' },
  PENDING: { label: '审批中', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200' },
  PUBLISHED: { label: '已发布', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200' },
  REJECTED: { label: '已驳回', className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200' },
};

const scopeLabel: Record<KnowledgeScopeType, string> = {
  ALL: '全员可见',
  DEPT: '部门可见',
  ROLE: '角色可见',
};

const createEmptyForm = (): KnowledgeDocument => ({
  title: '',
  category: categories[0],
  summary: '',
  content: '',
  attachmentUrl: '',
  scopeType: 'ALL',
  scopeValue: '',
});

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
}> = ({ title, description, icon }) => (
  <div className="flex min-h-[18rem] flex-col items-center justify-center px-6 py-12 text-center">
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Inbox className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? <div className="mt-2 max-w-md text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
  </div>
);

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ colSpan, title, description, icon, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : icon || <BookOpenText className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
      </div>
    </td>
  </tr>
);

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const meta = statusMeta[(status || 'DRAFT') as KnowledgeStatus] || statusMeta.DRAFT;
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>;
};

const AttachmentLinks: React.FC<{ value?: string }> = ({ value }) => {
  const files = value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
  if (!files.length) {
    return <span className="text-sm text-slate-400">无附件</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((url) => {
        const label = decodeURIComponent(url.split('/').pop() || '附件');
        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-cyan-200 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-cyan-900 dark:hover:text-cyan-200"
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </a>
        );
      })}
    </div>
  );
};

const KnowledgePage: React.FC = () => {
  const { user } = useAuth();
  const canManage = user?.role === Role.ADMIN || user?.role === Role.HR;

  const [viewMode, setViewMode] = useState<ViewMode>('library');
  const [library, setLibrary] = useState<KnowledgeDocument[]>([]);
  const [submissions, setSubmissions] = useState<KnowledgeDocument[]>([]);
  const [manageRows, setManageRows] = useState<KnowledgeDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState<KnowledgeDocument>(createEmptyForm);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<KnowledgeDocument | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [readStats, setReadStats] = useState<KnowledgeReadStats | null>(null);

  const activeRows = viewMode === 'library' ? library : viewMode === 'mine' ? submissions : manageRows;
  const tableTotal = viewMode === 'library' ? library.length : total;

  const unreadCount = useMemo(() => library.filter((item) => !item.isRead).length, [library]);
  const draftCount = useMemo(() => activeRows.filter((item) => item.status === 'DRAFT').length, [activeRows]);
  const pendingCount = useMemo(() => activeRows.filter((item) => item.status === 'PENDING').length, [activeRows]);
  const publishedCount = useMemo(() => activeRows.filter((item) => item.status === 'PUBLISHED').length, [activeRows]);
  const rejectedCount = useMemo(() => activeRows.filter((item) => item.status === 'REJECTED').length, [activeRows]);
  const hasActiveFilters = Boolean(keyword.trim() || category || status || unreadOnly);
  const currentCategoryLabel = category || '全部分类';
  const currentStatusLabel = viewMode === 'library'
    ? (unreadOnly ? '仅未读' : '全部阅读')
    : (statusMeta[status as KnowledgeStatus]?.label || '全部状态');
  const totalPages = viewMode === 'library' ? 1 : Math.max(1, Math.ceil(total / pageSize));

  const fetchData = async () => {
    setLoading(true);
    try {
      if (viewMode === 'library') {
        const rows = await knowledgeApi.myList({
          keyword: keyword.trim() || undefined,
          category: category || undefined,
          unreadOnly,
        });
        setLibrary(rows || []);
        return;
      }

      const params = {
        keyword: keyword.trim() || undefined,
        category: category || undefined,
        status: status || undefined,
        pageNum,
        pageSize,
      };
      const res = viewMode === 'mine'
        ? await knowledgeApi.mySubmissions(params)
        : await knowledgeApi.manageList(params);
      const rows = res.records || res.rows || [];
      if (viewMode === 'mine') {
        setSubmissions(rows);
      } else {
        setManageRows(rows);
      }
      setTotal(res.total || 0);
    } catch (error: any) {
      toast.error(error?.message || '知识库加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [viewMode, unreadOnly, pageNum, pageSize]);

  const applyFilters = () => {
    setPageNum(1);
    void fetchData();
  };

  const resetFilters = () => {
    setKeyword('');
    setCategory('');
    setStatus('');
    setUnreadOnly(false);
    setPageNum(1);
    setTimeout(() => void fetchData(), 0);
  };

  const openCreate = () => {
    setFormData(createEmptyForm());
    setFormOpen(true);
  };

  const openEdit = (document: KnowledgeDocument) => {
    setFormData({ ...createEmptyForm(), ...document });
    setFormOpen(true);
  };

  const saveForm = async () => {
    if (!formData.title.trim()) {
      toast.error('请输入文档标题');
      return;
    }
    if (!formData.category.trim()) {
      toast.error('请选择文档分类');
      return;
    }
    if (!formData.content.trim()) {
      toast.error('请输入正文内容');
      return;
    }
    if (formData.scopeType !== 'ALL' && !formData.scopeValue?.trim()) {
      toast.error('请输入范围值');
      return;
    }

    try {
      if (formData.documentId) {
        await knowledgeApi.edit(formData);
        toast.success('文档已更新');
      } else {
        await knowledgeApi.add(formData);
        toast.success('草稿已创建');
      }
      setFormOpen(false);
      setViewMode('mine');
      void fetchData();
    } catch (error: any) {
      toast.error(error?.message || '保存失败');
    }
  };

  const submitDocument = async (id?: number) => {
    if (!id) return;
    try {
      await knowledgeApi.submit(id);
      toast.success('已提交发布审批');
      void fetchData();
    } catch (error: any) {
      toast.error(error?.message || '提交失败');
    }
  };

  const recallDocument = async (id?: number) => {
    if (!id) return;
    try {
      await knowledgeApi.recall(id);
      toast.success('已撤回审批');
      void fetchData();
    } catch (error: any) {
      toast.error(error?.message || '撤回失败');
    }
  };

  const removeDocument = async (id?: number) => {
    if (!id) return;
    try {
      await knowledgeApi.remove(id);
      toast.success('文档已删除');
      void fetchData();
    } catch (error: any) {
      toast.error(error?.message || '删除失败');
    }
  };

  const openDetail = async (document: KnowledgeDocument) => {
    if (!document.documentId) return;
    try {
      const next = await knowledgeApi.getInfo(document.documentId);
      setDetail(next);
      setDetailOpen(true);
      if (viewMode === 'library' && !next.isRead) {
        await knowledgeApi.read(document.documentId);
        setDetail({ ...next, isRead: true });
        setLibrary((rows) => rows.map((item) => (
          item.documentId === document.documentId ? { ...item, isRead: true } : item
        )));
      }
    } catch (error: any) {
      toast.error(error?.message || '文档加载失败');
    }
  };

  const openReadStats = async (document: KnowledgeDocument) => {
    if (!document.documentId) return;
    try {
      const stats = await knowledgeApi.readStats(document.documentId);
      setReadStats(stats);
      setStatsOpen(true);
    } catch (error: any) {
      toast.error(error?.message || '阅读统计加载失败');
    }
  };

  const renderFilters = (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <SegmentedControl className="min-h-9">
          <SegmentedControlItem size="sm" active={viewMode === 'library'} onClick={() => { setViewMode('library'); setPageNum(1); }}>
            知识库
          </SegmentedControlItem>
          <SegmentedControlItem size="sm" active={viewMode === 'mine'} onClick={() => { setViewMode('mine'); setPageNum(1); }}>
            我的提交
          </SegmentedControlItem>
          {canManage ? (
            <SegmentedControlItem size="sm" active={viewMode === 'manage'} onClick={() => { setViewMode('manage'); setPageNum(1); }}>
              管理视图
            </SegmentedControlItem>
          ) : null}
        </SegmentedControl>

        <div className="relative w-full sm:w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="h-10 pl-9"
            placeholder="搜索标题、摘要或正文"
          />
        </div>

        <div className="w-full sm:w-[160px]">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="全部分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部分类</SelectItem>
              {categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {viewMode !== 'library' ? (
          <div className="w-full sm:w-[160px]">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部状态</SelectItem>
                {Object.entries(statusMeta).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <Button variant={unreadOnly ? 'default' : 'outline'} size="sm" onClick={() => setUnreadOnly((value) => !value)}>
            <CheckCheck className="h-4 w-4" />
            仅未读
          </Button>
        )}

        <div className="flex min-w-[280px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{hasActiveFilters ? `${currentCategoryLabel} / ${currentStatusLabel}` : '全部'}</span>
          <span>第 {pageNum} / {totalPages} 页</span>
          <span>共 {tableTotal} 条</span>
          {viewMode === 'library' ? (
            <span>未读 {unreadCount}</span>
          ) : (
            <>
              <span>草稿 {draftCount}</span>
              <span>审批中 {pendingCount}</span>
              <span>已发布 {publishedCount}</span>
              <span>已驳回 {rejectedCount}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        <Button variant="outline" size="sm" onClick={applyFilters}>
          应用
        </Button>
        <Button variant="outline" size="sm" onClick={resetFilters}>
          <RotateCcw size={14} className="mr-1.5" />
          清空条件
        </Button>
        <Button variant="outline" size="sm" onClick={() => void fetchData()} disabled={loading}>
          <RefreshCw size={14} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} className="mr-1.5" />
          新建文档
        </Button>
      </div>
    </div>
  );

  const renderTableRows = () => {
    if (loading) {
      return <TableStateRow colSpan={7} title="正在加载知识库..." loading />;
    }
    if (!activeRows.length) {
      return (
        <TableStateRow
          colSpan={7}
          title={hasActiveFilters ? '当前筛选下暂无文档' : '暂无知识文档'}
          description="新文档发布后会显示在这里。"
        />
      );
    }

    return (
      <>
        {activeRows.map((item, index) => (
          <tr key={item.documentId ?? `${item.title}-${index}`} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
            <td className="px-4 py-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void openDetail(item)}
                    className="truncate text-left text-sm font-medium text-slate-900 hover:text-cyan-700 dark:text-slate-100 dark:hover:text-cyan-200"
                  >
                    {item.title || '-'}
                  </button>
                  {viewMode === 'library' && !item.isRead ? (
                    <span className="shrink-0 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200">未读</span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  {formatDateTimeDisplay(item.publishTime || item.createTime)}
                </div>
              </div>
            </td>
            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="font-medium text-slate-900 dark:text-slate-100">{item.category || '-'}</div>
              <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {(item.scopeType && scopeLabel[item.scopeType]) || '-'}
                {item.scopeValue ? `：${item.scopeValue}` : ''}
              </div>
            </td>
            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="font-medium text-slate-900 dark:text-slate-100">{item.submitterName || '-'}</div>
              <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{item.deptName || '-'}</div>
            </td>
            <td className="max-w-sm truncate px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
              {item.summary || '-'}
            </td>
            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="font-medium text-slate-900 dark:text-slate-100">{item.readCount || 0}</div>
              <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {viewMode === 'library' ? (item.isRead ? '已读' : '未读') : '已读人数'}
              </div>
            </td>
            <td className="px-4 py-3">
              <StatusBadge status={item.status} />
            </td>
            <td className="px-4 py-3 text-right">
              <TableRowActions
                align="end"
                className="gap-1"
                iconOnly
                actions={[
                  {
                    label: '详情',
                    icon: <Eye size={14} />,
                    onClick: () => void openDetail(item),
                    tone: 'neutral',
                    className: 'rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950',
                  },
                  {
                    label: '编辑',
                    icon: <Pencil size={14} />,
                    onClick: () => openEdit(item),
                    tone: 'primary',
                    hidden: !(viewMode === 'mine' || viewMode === 'manage') || (item.status !== 'DRAFT' && item.status !== 'REJECTED'),
                    className: 'rounded-lg',
                  },
                  {
                    label: '提交',
                    icon: <Send size={14} />,
                    onClick: () => void submitDocument(item.documentId),
                    tone: 'success',
                    hidden: !(viewMode === 'mine' || viewMode === 'manage') || (item.status !== 'DRAFT' && item.status !== 'REJECTED'),
                    className: 'rounded-lg',
                  },
                  {
                    label: '撤回',
                    icon: <RotateCcw size={14} />,
                    onClick: () => void recallDocument(item.documentId),
                    tone: 'warning',
                    hidden: viewMode !== 'mine' || item.status !== 'PENDING',
                    className: 'rounded-lg',
                  },
                  {
                    label: '阅读统计',
                    icon: <Shield size={14} />,
                    onClick: () => void openReadStats(item),
                    tone: 'info',
                    hidden: viewMode !== 'manage',
                    className: 'rounded-lg',
                  },
                  {
                    label: '删除',
                    icon: <Trash2 size={14} />,
                    onClick: () => void removeDocument(item.documentId),
                    tone: 'danger',
                    hidden: !(viewMode === 'mine' || viewMode === 'manage') || item.status === 'PENDING',
                    className: 'rounded-lg',
                  },
                ]}
              />
            </td>
          </tr>
        ))}
      </>
    );
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={renderFilters}
        table={(
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <tr>
                    <TableHead className="w-[24%] px-4 py-3 text-left">
                      文档标题
                    </TableHead>
                    <TableHead className="w-[16%] px-4 py-3 text-left">
                      分类 / 范围
                    </TableHead>
                    <TableHead className="w-[16%] px-4 py-3 text-left">
                      提交人 / 部门
                    </TableHead>
                    <TableHead className="w-[22%] px-4 py-3 text-left">
                      摘要
                    </TableHead>
                    <TableHead className="w-[10%] px-4 py-3 text-left">
                      阅读
                    </TableHead>
                    <TableHead className="w-[10%] px-4 py-3 text-left">
                      状态
                    </TableHead>
                    <TableActionHead className="w-44 px-4 py-3 text-right">
                      当前操作
                    </TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {renderTableRows()}
                </tbody>
              </table>
            </div>
          </div>
        )}
        pagination={viewMode !== 'library' ? (
          <Pagination
            page={pageNum}
            total={total}
            pageSize={pageSize}
            onPageChange={setPageNum}
            onPageSizeChange={(size) => { setPageSize(size); setPageNum(1); }}
          />
        ) : null}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{formData.documentId ? '编辑知识文档' : '新建知识文档'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>标题</Label>
              <Input value={formData.title} onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>分类</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}>
                <SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger>
                <SelectContent>{categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>可见范围</Label>
              <Select value={formData.scopeType} onValueChange={(value) => setFormData((prev) => ({ ...prev, scopeType: value as KnowledgeScopeType, scopeValue: value === 'ALL' ? '' : prev.scopeValue }))}>
                <SelectTrigger><SelectValue placeholder="选择范围" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全员可见</SelectItem>
                  <SelectItem value="DEPT">部门可见</SelectItem>
                  <SelectItem value="ROLE">角色可见</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.scopeType !== 'ALL' ? (
              <div className="space-y-2 md:col-span-2">
                <Label>{formData.scopeType === 'DEPT' ? '部门ID' : '角色标识'}</Label>
                <Input
                  value={formData.scopeValue || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, scopeValue: event.target.value }))}
                  placeholder={formData.scopeType === 'DEPT' ? '例如：100' : '例如：admin / hr / manager'}
                />
              </div>
            ) : null}
            <div className="space-y-2 md:col-span-2">
              <Label>摘要</Label>
              <Textarea rows={3} value={formData.summary || ''} onChange={(event) => setFormData((prev) => ({ ...prev, summary: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>正文</Label>
              <Textarea rows={10} value={formData.content} onChange={(event) => setFormData((prev) => ({ ...prev, content: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>附件</Label>
              <FileUpload value={formData.attachmentUrl || ''} onChange={(value) => setFormData((prev) => ({ ...prev, attachmentUrl: value }))} maxCount={5} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={() => void saveForm()}>保存草稿</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-4xl">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle>{detail.title}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                <StatusBadge status={detail.status} />
                <span className="rounded-full border border-slate-200 px-2.5 py-1 dark:border-slate-800">{detail.category}</span>
                <span className="rounded-full border border-slate-200 px-2.5 py-1 dark:border-slate-800">{scopeLabel[detail.scopeType]}</span>
                <span className="rounded-full border border-slate-200 px-2.5 py-1 dark:border-slate-800">提交人：{detail.submitterName || '-'}</span>
              </div>
              {detail.summary ? <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:bg-slate-900 dark:text-slate-300">{detail.summary}</p> : null}
              <div
                className="prose prose-slate max-w-none rounded-lg border border-slate-200 bg-white p-4 text-sm leading-7 dark:prose-invert dark:border-slate-800 dark:bg-slate-950"
                dangerouslySetInnerHTML={{ __html: renderAnnouncementHtml(detail.content) }}
              />
              <div>
                <div className="mb-2 text-sm font-medium text-slate-900 dark:text-slate-100">附件</div>
                <AttachmentLinks value={detail.attachmentUrl} />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>阅读统计</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-slate-600 dark:text-slate-300">已读 {readStats?.readCount || 0} 人</div>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
            {readStats?.readUsers?.length ? (
              readStats.readUsers.map((item) => (
                <div key={item.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 dark:border-slate-800">
                  <span className="text-slate-900 dark:text-slate-100">{item.userName || item.userId}</span>
                  <span className="text-slate-500 dark:text-slate-400">{item.readTime || '-'}</span>
                </div>
              ))
            ) : (
              <InlineState title="暂无阅读记录" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KnowledgePage;
