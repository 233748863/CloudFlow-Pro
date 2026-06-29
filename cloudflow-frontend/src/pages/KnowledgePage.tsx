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
import {
  AnnouncementTargetingEditor,
  type DeptItem,
} from '@/components/admin/announcements';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  Input,
  Label,
  Pagination,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { AnnouncementScope } from '@/types';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { getDeptTree, getRoleOptions, type SysRole } from '@/services/api/auth';
import {
  knowledgeApi,
  knowledgeTemplateApi,
  type KnowledgeDocument,
  type KnowledgeReadStats,
  type KnowledgeScopeType,
  type OaKnowledgeTemplate,
} from '@/services/api/knowledge';
import { renderAnnouncementHtml } from '@/utils/announcementContent';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getAttachmentDisplayName, normalizeAttachmentUrls } from '@/utils/attachment';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';

type ViewMode = 'library' | 'mine' | 'manage';

interface ConfirmState {
  type: 'submit' | 'recall' | 'delete' | 'rollback';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
  versionNo?: number;
}

const categories = ['行政制度', '办公指南', '财务制度', '人事制度', '项目规范', '其他'];

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
    <div className="admin-source-stat-icon mb-3">
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
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : icon || <BookOpenText className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
      </div>
    </td>
  </tr>
);

const KnowledgeSurface: React.FC<{
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, description, children, className = '', bodyClassName = '' }) => (
  <InnerTableSurface className={`admin-knowledge-surface ${className}`} wrapperClassName="admin-knowledge-surface-wrapper">
    <div className="admin-knowledge-surface-head">
      <div>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
    </div>
    <div className={`admin-knowledge-surface-body ${bodyClassName}`}>{children}</div>
  </InnerTableSurface>
);

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => (
  <DictBadge dictType="oa_knowledge_status" value={String(status || 'DRAFT')} />
);

const AttachmentLinks: React.FC<{ value?: string }> = ({ value }) => {
  const files = normalizeAttachmentUrls(value);
  if (!files.length) {
    return <span className="text-sm text-slate-400">无附件</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((url) => {
        const label = getAttachmentDisplayName(url);
        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="cf-side-link cf-side-link-sm inline-flex max-w-full items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium"
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </a>
        );
      })}
    </div>
  );
};

const parseScopeValues = (value?: string) => (
  value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
);

const flattenDeptTree = (depts: DeptItem[]): DeptItem[] => (
  depts.flatMap((dept) => [dept, ...(dept.children?.length ? flattenDeptTree(dept.children) : [])])
);

const normalizeDeptTreeResponse = (response: unknown): DeptItem[] => {
  if (Array.isArray(response)) {
    return response as DeptItem[];
  }
  const payload = response as { data?: unknown; rows?: unknown; records?: unknown };
  if (Array.isArray(payload?.data)) {
    return payload.data as DeptItem[];
  }
  if (Array.isArray(payload?.rows)) {
    return payload.rows as DeptItem[];
  }
  if (Array.isArray(payload?.records)) {
    return payload.records as DeptItem[];
  }
  return [];
};

const normalizeRoleListResponse = (response: unknown): SysRole[] => {
  if (Array.isArray(response)) {
    return response as SysRole[];
  }
  const payload = response as { data?: unknown; rows?: unknown; records?: unknown };
  if (Array.isArray(payload?.data)) {
    return payload.data as SysRole[];
  }
  if (Array.isArray(payload?.rows)) {
    return payload.rows as SysRole[];
  }
  if (Array.isArray(payload?.records)) {
    return payload.records as SysRole[];
  }
  return [];
};

const KnowledgePage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission('oa:knowledge:manage');
  const statusDict = useDict('oa_knowledge_status');
  const scopeDict = useDict('oa_knowledge_scope');

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
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionDocId, setVersionDocId] = useState<number | null>(null);
  const [versionDocTitle, setVersionDocTitle] = useState('');
  const [versions, setVersions] = useState<import('@/services/api/knowledge').KnowledgeDocVersion[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionDiff, setVersionDiff] = useState<import('@/services/api/knowledge').KnowledgeVersionDiffResult | null>(null);
  const [diffFrom, setDiffFrom] = useState<number | null>(null);
  const [diffTo, setDiffTo] = useState<number | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);
  const [roles, setRoles] = useState<SysRole[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templates, setTemplates] = useState<OaKnowledgeTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

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
    : (statusDict.getLabel(status) || '全部状态');
  const totalPages = viewMode === 'library' ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const deptNameMap = useMemo(() => {
    const map = new Map<string, string>();
    flattenDeptTree(deptTree).forEach((dept) => {
      map.set(String(dept.deptId), dept.deptName);
    });
    return map;
  }, [deptTree]);
  const roleNameMap = useMemo(() => {
    const map = new Map<string, string>();
    roles.forEach((role) => {
      const roleName = role.roleName || role.roleKey;
      if (role.roleKey) {
        map.set(String(role.roleKey), roleName);
      }
      if (role.roleId) {
        map.set(String(role.roleId), roleName);
      }
    });
    return map;
  }, [roles]);

  const formatScopeDisplay = (document: Pick<KnowledgeDocument, 'scopeType' | 'scopeValue'>) => {
    if (document.scopeType === 'ALL') {
      return '全员可见';
    }
    const values = parseScopeValues(document.scopeValue);
    const nameMap = document.scopeType === 'DEPT' ? deptNameMap : roleNameMap;
    const names = values.map((value) => nameMap.get(value) || value);
    return names.length ? `${scopeDict.getLabel(document.scopeType)}：${names.join('、')}` : scopeDict.getLabel(document.scopeType);
  };

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

  useEffect(() => {
    void Promise.all([getDeptTree(), getRoleOptions()])
      .then(([deptResponse, roleResponse]) => {
        setDeptTree(normalizeDeptTreeResponse(deptResponse));
        setRoles(normalizeRoleListResponse(roleResponse));
      })
      .catch((error) => {
        console.error('知识库范围数据加载失败', error);
        setDeptTree([]);
        setRoles([]);
      });
  }, []);

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

  const openTemplatePicker = async () => {
    setTemplatePickerOpen(true);
    setTemplatesLoading(true);
    try {
      const rows = await knowledgeTemplateApi.listActive();
      setTemplates(Array.isArray(rows) ? rows : []);
    } catch (err) {
      toast.error(getErrorMessage(err, '加载模板失败'));
    } finally {
      setTemplatesLoading(false);
    }
  };

  const applyTemplate = async (template: OaKnowledgeTemplate) => {
    if (!template.id) return;
    try {
      const content = await knowledgeTemplateApi.use(template.id);
      setFormData((prev) => ({
        ...prev,
        title: prev.title || template.templateName,
        summary: prev.summary || template.summary || '',
        content: content || template.content || prev.content,
      }));
      toast.success(`已套用模板 ${template.templateName}`);
      setTemplatePickerOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err, '套用模板失败'));
    }
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

  const openSubmitConfirm = (document: KnowledgeDocument) => {
    if (!document.documentId) return;
    setConfirmState({
      type: 'submit',
      id: document.documentId,
      title: '提交知识文档',
      message: `确认提交《${document.title || '未命名文档'}》进入发布审批吗？`,
      confirmText: '提交',
    });
  };

  const openRecallConfirm = (document: KnowledgeDocument) => {
    if (!document.documentId) return;
    setConfirmState({
      type: 'recall',
      id: document.documentId,
      title: '撤回知识文档',
      message: `撤回后《${document.title || '未命名文档'}》将回到草稿状态。`,
      confirmText: '撤回',
    });
  };

  const openDeleteConfirm = (document: KnowledgeDocument) => {
    if (!document.documentId) return;
    setConfirmState({
      type: 'delete',
      id: document.documentId,
      title: '删除知识文档',
      message: `删除后《${document.title || '未命名文档'}》不可恢复。`,
      confirmText: '删除',
      danger: true,
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmState) return;

    const currentState = confirmState;
    setConfirmState(null);
    try {
      if (currentState.type === 'submit') {
        await knowledgeApi.submit(currentState.id);
        toast.success('已提交发布审批');
      } else if (currentState.type === 'recall') {
        await knowledgeApi.recall(currentState.id);
        toast.success('已撤回审批');
      } else if (currentState.type === 'rollback') {
        if (!currentState.versionNo) return;
        await knowledgeApi.rollbackVersion(currentState.id, currentState.versionNo);
        toast.success(`已回滚到 v${currentState.versionNo}`);
        setVersionOpen(false);
      } else {
        await knowledgeApi.remove(currentState.id);
        toast.success('文档已删除');
      }
      void fetchData();
    } catch (error: any) {
      const fallback = currentState.type === 'submit'
        ? '提交失败'
        : currentState.type === 'recall'
          ? '撤回失败'
          : currentState.type === 'rollback'
            ? '回滚失败'
            : '删除失败';
      toast.error(error?.message || fallback);
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
      toast.error(error?.message || '文档加载失败，请确认权限或文档状态');
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

  const openVersions = async (document: KnowledgeDocument) => {
    if (!document.documentId) return;
    setVersionDocId(document.documentId);
    setVersionDocTitle(document.title || '');
    setVersionOpen(true);
    setVersionLoading(true);
    setVersionDiff(null);
    setDiffFrom(null);
    setDiffTo(null);
    try {
      const list = await knowledgeApi.listVersions(document.documentId);
      setVersions(list || []);
    } catch (err: any) {
      toast.error(err?.message || '加载版本列表失败');
    } finally {
      setVersionLoading(false);
    }
  };

  const handleVersionDiff = async () => {
    if (!versionDocId || diffFrom == null || diffTo == null) {
      toast.warning('请先选择对比的两个版本');
      return;
    }
    try {
      const result = await knowledgeApi.diffVersions(versionDocId, diffFrom, diffTo);
      setVersionDiff(result);
    } catch (err: any) {
      toast.error(err?.message || '对比失败');
    }
  };

  const handleVersionRollback = (versionNo?: number) => {
    if (!versionDocId || !versionNo) return;
    setConfirmState({
      type: 'rollback',
      id: versionDocId,
      versionNo,
      title: '回滚版本',
      message: `确定回滚到 v${versionNo}？将覆盖当前正文。`,
      confirmText: '确认回滚',
      danger: true,
    });
  };

  const renderFilters = (
    <section className="card admin-users-toolbar admin-knowledge-toolbar">
      <div className="admin-knowledge-toolbar-head">
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{hasActiveFilters ? `${currentCategoryLabel} / ${currentStatusLabel}` : '全部'}</span>
          <span>第 {pageNum} / {totalPages} 页</span>
          <span>共 {tableTotal} 条</span>
          {viewMode === 'library' ? <span>未读 {unreadCount}</span> : <span>已发布 {publishedCount}</span>}
        </div>
      </div>

      <div className="admin-knowledge-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">搜索文档</span>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  applyFilters();
                }
              }}
              placeholder="标题、摘要或正文"
              className="h-[42px] pl-10"
            />
          </div>
        </label>

        <label>
          <span className="input-label">分类</span>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="全部分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部分类</SelectItem>
              {categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>

        {viewMode !== 'library' ? (
          <label>
            <span className="input-label">状态</span>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部状态</SelectItem>
                {statusDict.getOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : (
          <div className="admin-knowledge-filter-toggle">
            <span className="input-label">阅读</span>
            <Button variant={unreadOnly ? 'default' : 'outline'} size="sm" onClick={() => setUnreadOnly((value) => !value)}>
              <CheckCheck className="h-4 w-4" />
              仅未读
            </Button>
          </div>
        )}

        <div className="admin-users-toolbar-actions admin-knowledge-filter-actions">
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
          <Button size="sm" onClick={openCreate} disabled={!hasPermission('oa:knowledge:add')}>
            <Plus size={14} className="mr-1.5" />
            新建文档
          </Button>
        </div>
      </div>
    </section>
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
          <tr key={item.documentId ?? `${item.title}-${index}`}>
            <td>
              <div className="admin-users-identity">
                <div>
                  <button
                    type="button"
                    onClick={() => void openDetail(item)}
                    className="truncate text-left text-sm font-medium text-slate-900 hover:text-cyan-700 dark:text-slate-100 dark:hover:text-cyan-200"
                  >
                    {item.title || '-'}
                  </button>
                  {viewMode === 'library' && !item.isRead ? (
                    <span className="shrink-0 rounded-md bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200">未读</span>
                  ) : null}
                  <small>{formatDateTimeDisplay(item.publishTime || item.createTime)}</small>
                </div>
              </div>
            </td>
            <td>
              <div className="font-medium text-slate-900 dark:text-slate-100">{item.category || '-'}</div>
              <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {item.scopeType ? formatScopeDisplay(item) : '-'}
              </div>
            </td>
            <td>
              <div className="font-medium text-slate-900 dark:text-slate-100">{item.submitterName || '-'}</div>
              <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{item.deptName || '-'}</div>
            </td>
            <td className="max-w-sm truncate">
              {item.summary || '-'}
            </td>
            <td>
              <div className="font-medium text-slate-900 dark:text-slate-100">{item.readCount || 0}</div>
              <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {viewMode === 'library' ? (item.isRead ? '已读' : '未读') : '已读人数'}
              </div>
            </td>
            <td>
              <StatusBadge status={item.status} />
            </td>
            <td>
              <div className="admin-users-row-actions">
                <button type="button" title="详情" aria-label="查看详情" onClick={() => void openDetail(item)}>
                  <Eye size={15} />
                </button>
                {(viewMode === 'mine' || viewMode === 'manage') && (item.status === 'DRAFT' || item.status === 'REJECTED') && hasPermission('oa:knowledge:edit') ? (
                  <button type="button" title="编辑" aria-label="编辑文档" onClick={() => openEdit(item)}>
                    <Pencil size={15} />
                  </button>
                ) : null}
                {(viewMode === 'mine' || viewMode === 'manage') && (item.status === 'DRAFT' || item.status === 'REJECTED') && hasPermission('oa:knowledge:submit') ? (
                  <button type="button" title="提交" aria-label="提交文档" onClick={() => openSubmitConfirm(item)}>
                    <Send size={15} />
                  </button>
                ) : null}
                {viewMode === 'mine' && item.status === 'PENDING' && hasPermission('oa:knowledge:recall') ? (
                  <button type="button" title="撤回" aria-label="撤回文档" onClick={() => openRecallConfirm(item)}>
                    <RotateCcw size={15} />
                  </button>
                ) : null}
                {viewMode === 'manage' && hasPermission('oa:knowledge:manage') ? (
                  <button type="button" title="阅读统计" aria-label="阅读统计" onClick={() => void openReadStats(item)}>
                    <Shield size={15} />
                  </button>
                ) : null}
                {(viewMode === 'mine' || viewMode === 'manage') ? (
                  <button type="button" title="版本历史" aria-label="版本历史" onClick={() => void openVersions(item)}>
                    <RotateCcw size={15} />
                  </button>
                ) : null}
                {(viewMode === 'mine' || viewMode === 'manage') && item.status !== 'PENDING' && hasPermission('oa:knowledge:remove') ? (
                  <button type="button" className="danger" title="删除" aria-label="删除文档" onClick={() => openDeleteConfirm(item)}>
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </>
    );
  };

  if (!user) {
    return null;
  }

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">KNOWLEDGE BASE</p>
          <h2>知识库</h2>
          <span>维护制度文档、阅读状态、审批流转和版本历史</span>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <div className="admin-source-stat-icon"><BookOpenText size={18} /></div>
          <div><p>文档总数</p><strong>{tableTotal}</strong><span>当前视图</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <div className="admin-source-stat-icon"><CheckCheck size={18} /></div>
          <div><p>未读</p><strong>{unreadCount}</strong><span>知识库视图</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <div className="admin-source-stat-icon"><Send size={18} /></div>
          <div><p>审批中</p><strong>{pendingCount}</strong><span>提交待处理</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <div className="admin-source-stat-icon"><Shield size={18} /></div>
          <div><p>已发布</p><strong>{publishedCount}</strong><span>可阅读文档</span></div>
        </article>
      </section>
    </div>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[1180px]">
          <thead>
            <tr>
              <th>文档标题</th>
              <th>分类 / 范围</th>
              <th>提交人 / 部门</th>
              <th>摘要</th>
              <th>阅读</th>
              <th>状态</th>
              <th className="text-right">当前操作</th>
            </tr>
          </thead>
          <tbody>{renderTableRows()}</tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = viewMode !== 'library' ? (
    <Pagination
      page={pageNum}
      total={total}
      pageSize={pageSize}
      onPageChange={setPageNum}
      onPageSizeChange={(size) => { setPageSize(size); setPageNum(1); }}
    />
  ) : null;

  return (
    <div className="admin-source-page admin-knowledge-page">
      <TablePageLayout
        actions={pageActions}
        filters={renderFilters}
        table={pageTable}
        pagination={pagePagination}
      />

      <BaseDialog
        open={formOpen}
        title={formData.documentId ? '编辑知识文档' : '新建知识文档'}
        onClose={() => setFormOpen(false)}
        width="full"
        maxWidthClassName="w-[calc(100vw-2rem)] sm:max-w-5xl xl:max-w-6xl"
        bodyClassName="flex flex-col !overflow-hidden"
        footer={(
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={() => void saveForm()}>保存草稿</Button>
          </>
        )}
      >
          <div className="admin-dialog-stack min-h-0 flex-1 overflow-y-auto pr-1">
            {!formData.documentId ? (
              <div className="admin-dialog-subsection flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-slate-500 dark:text-slate-400">不知道怎么开头？</span>
                <Button size="sm" variant="outline" onClick={() => void openTemplatePicker()}>
                  <FileText className="mr-1 h-3.5 w-3.5" />从模板开始
                </Button>
              </div>
            ) : null}
            <div className="admin-dialog-stack">
              <KnowledgeSurface title="文档内容" description="标题、分类、摘要、正文和附件" bodyClassName="admin-dialog-stack">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <div className="admin-dialog-field">
                    <Label>标题</Label>
                    <Input value={formData.title} onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))} />
                  </div>
                  <div className="admin-dialog-field">
                    <Label>分类</Label>
                    <Select value={formData.category} onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}>
                      <SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger>
                      <SelectContent>{categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="admin-dialog-field">
                  <Label>摘要</Label>
                  <Textarea rows={3} value={formData.summary || ''} onChange={(event) => setFormData((prev) => ({ ...prev, summary: event.target.value }))} />
                </div>
                <div className="admin-dialog-field">
                  <Label>正文</Label>
                  <Textarea rows={8} value={formData.content} onChange={(event) => setFormData((prev) => ({ ...prev, content: event.target.value }))} />
                </div>
                <div className="admin-dialog-field">
                  <Label>附件</Label>
                  <FileUpload value={formData.attachmentUrl || ''} onChange={(value) => setFormData((prev) => ({ ...prev, attachmentUrl: value }))} maxCount={5} />
                </div>
              </KnowledgeSurface>
              <AnnouncementTargetingEditor
                scopeType={(formData.scopeType as AnnouncementScope) || AnnouncementScope.ALL}
                scopeValue={formData.scopeValue || ''}
                deptTree={deptTree}
                onScopeTypeChange={(scopeType) => setFormData((prev) => ({
                  ...prev,
                  scopeType: scopeType as KnowledgeScopeType,
                  scopeValue: scopeType === AnnouncementScope.ALL ? '' : prev.scopeValue || '',
                }))}
                onScopeValueChange={(scopeValue) => setFormData((prev) => ({ ...prev, scopeValue }))}
              />
            </div>
          </div>
      </BaseDialog>

      <BaseDialog
        open={templatePickerOpen}
        title="选择文档模板"
        onClose={() => setTemplatePickerOpen(false)}
        maxWidthClassName="sm:max-w-2xl"
        footer={<Button variant="outline" onClick={() => setTemplatePickerOpen(false)}>取消</Button>}
      >
          {templatesLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-400">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />加载模板中...
            </div>
          ) : templates.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">暂无可用模板</div>
          ) : (
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => void applyTemplate(tpl)}
                  className="cf-side-link cf-side-link-sm w-full cursor-pointer px-4 py-3 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tpl.templateName}</div>
                    <span className="rounded-md bg-[var(--cf-surface-muted)] px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {tpl.category}
                    </span>
                  </div>
                  {tpl.summary ? (
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{tpl.summary}</div>
                  ) : null}
                  <div className="mt-1 text-xs text-slate-400">使用次数 {tpl.usageCount ?? 0}</div>
                </button>
              ))}
            </div>
          )}
      </BaseDialog>

      <BaseDialog
        open={detailOpen}
        title={detail?.title || '文档详情'}
        onClose={() => setDetailOpen(false)}
        width="wide"
        maxWidthClassName="sm:max-w-4xl"
      >
          {detail ? (
            <>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                <StatusBadge status={detail.status} />
                <span className="admin-users-filter-count">{detail.category}</span>
                <span className="admin-users-filter-count">{formatScopeDisplay(detail)}</span>
                <span className="admin-users-filter-count">提交人：{detail.submitterName || '-'}</span>
              </div>
              {detail.summary ? <p className="admin-knowledge-note">{detail.summary}</p> : null}
              <div
                className="admin-knowledge-article prose prose-slate max-w-none text-sm leading-7 dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: renderAnnouncementHtml(detail.content) }}
              />
              <div>
                <div className="mb-2 text-sm font-medium text-slate-900 dark:text-slate-100">附件</div>
                <AttachmentLinks value={detail.attachmentUrl} />
              </div>
            </>
          ) : null}
      </BaseDialog>

      <BaseDialog
        open={statsOpen}
        title="阅读统计"
        onClose={() => setStatsOpen(false)}
        maxWidthClassName="sm:max-w-2xl"
      >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="admin-knowledge-stat-box">
              <div className="text-xs text-slate-500 dark:text-slate-400">应读</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{readStats?.expectedCount ?? 0}</div>
            </div>
            <div className="admin-knowledge-stat-box">
              <div className="text-xs text-slate-500 dark:text-slate-400">已读</div>
              <div className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-300">{readStats?.readCount || 0}</div>
            </div>
            <div className="admin-knowledge-stat-box">
              <div className="text-xs text-slate-500 dark:text-slate-400">未读</div>
              <div className="mt-1 text-lg font-semibold text-amber-600 dark:text-amber-300">{readStats?.unreadCount ?? 0}</div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <KnowledgeSurface title="已读人员" bodyClassName="admin-knowledge-list-body">
                {readStats?.readUsers?.length ? (
                  readStats.readUsers.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-sm last:border-b-0 dark:border-slate-800">
                      <span className="truncate text-slate-900 dark:text-slate-100">{item.userName || item.userId}</span>
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{item.readTime || '-'}</span>
                    </div>
                  ))
                ) : (
                  <InlineState title="暂无阅读记录" />
                )}
            </KnowledgeSurface>
            <KnowledgeSurface title="未读人员" bodyClassName="admin-knowledge-list-body">
                {readStats?.unreadUsers?.length ? (
                  readStats.unreadUsers.map((item) => (
                    <div key={item.userId} className="border-b border-slate-200 px-4 py-3 text-sm last:border-b-0 dark:border-slate-800">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{item.userName || item.userId}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.deptName || '-'}</div>
                    </div>
                  ))
                ) : (
                  <InlineState title="暂无未读人员" />
              )}
            </KnowledgeSurface>
          </div>
      </BaseDialog>

      <BaseDialog
        open={versionOpen}
        title={`版本历史 · ${versionDocTitle || '-'}`}
        onClose={() => setVersionOpen(false)}
        width="wide"
        maxWidthClassName="sm:max-w-4xl"
      >
          <div className="admin-dialog-stack">
            {versionLoading ? (
              <InlineState title="加载中..." />
            ) : versions.length === 0 ? (
              <InlineState title="暂无版本快照" />
            ) : (
              <>
                <div className="admin-dialog-subsection flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span>对比：</span>
                  <Select value={diffFrom != null ? String(diffFrom) : ''} onValueChange={(v) => setDiffFrom(Number(v))}>
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue placeholder="基准版本" />
                    </SelectTrigger>
                    <SelectContent>
                      {versions.map((v) => (
                        <SelectItem key={`version-base-${v.versionNo}`} value={String(v.versionNo)}>
                          v{v.versionNo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>→</span>
                  <Select value={diffTo != null ? String(diffTo) : ''} onValueChange={(v) => setDiffTo(Number(v))}>
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue placeholder="目标版本" />
                    </SelectTrigger>
                    <SelectContent>
                      {versions.map((v) => (
                        <SelectItem key={`version-target-${v.versionNo}`} value={String(v.versionNo)}>
                          v{v.versionNo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="soft" onClick={() => void handleVersionDiff()}>对比</Button>
                </div>

                <InnerTableSurface className="admin-knowledge-version-list">
                  {versions.map((v) => (
                    <div key={v.versionNo} className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm last:border-b-0 dark:border-slate-800">
                      <div className="flex flex-col">
                        <div className="font-medium text-slate-900 dark:text-slate-100">v{v.versionNo} · {v.title || '-'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {v.operatorName || '-'} · {v.publishTime || v.createTime || '-'} · {v.changeSummary || '无变更说明'}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void handleVersionRollback(v.versionNo)}>
                        回滚到此版本
                      </Button>
                    </div>
                  ))}
                </InnerTableSurface>

                {versionDiff ? (
                  <div className="admin-dialog-subsection text-xs">
                    <div className="mb-2 font-medium">
                      v{versionDiff.fromVersion?.versionNo} → v{versionDiff.toVersion?.versionNo}
                      {versionDiff.titleChanged ? ' · 标题已变化' : ''}
                      {versionDiff.summaryChanged ? ' · 摘要已变化' : ''}
                      {versionDiff.attachmentChanged ? ' · 附件已变化' : ''}
                    </div>
                    <div className="max-h-64 space-y-0.5 overflow-y-auto font-mono">
                      {(versionDiff.contentDiff || []).map((line, idx) => (
                        <div
                          key={idx}
                          className={
                            line.type === 'ADD'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
                              : line.type === 'DEL'
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200'
                                : 'text-slate-600 dark:text-slate-300'
                          }
                        >
                          {line.type === 'ADD' ? '+ ' : line.type === 'DEL' ? '- ' : '  '}
                          {line.text}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || '确认操作'}
        message={confirmState?.message || ''}
        confirmText={confirmState?.confirmText || '确定'}
        danger={confirmState?.danger}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};

export default KnowledgePage;


