import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bell, CheckCheck, Megaphone, Pin, RefreshCw, Search, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Announcement, AnnouncementScope, AnnouncementType } from '@/types';
import {
  deleteAnnouncement,
  getManageList,
  getReadStats,
  publishAnnouncement,
  revokeAnnouncement,
  type ReadStatsResponse,
  toggleTop,
  updateAnnouncement,
} from '@/services/api/announcement';
import { getDeptTree } from '@/services/api/auth';
import { toBackendDateString } from '@/utils/dateFormat';
import {
  AnnouncementReadStatusDialog,
  AnnouncementTargetingEditor,
  type DeptItem,
} from '@/components/admin/announcements';
import { AnnouncementManageTable, BaseDialog, ConfirmDialog } from '@/components/common';
import {
  Button,
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/ui';
import {
  WorkspaceHeroMetricsSection,
  WorkspaceInlineState,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace';

interface AnnouncementManageViewProps {
  onExitManage: () => void;
}

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  danger: boolean;
  action: (() => Promise<void>) | null;
}

const initialFormData: Partial<Announcement> = {
  type: AnnouncementType.NOTIFICATION,
  scopeType: AnnouncementScope.ALL,
  priority: 'M',
  content: '',
  isTop: 0,
};

const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';
const subtlePanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';

export const AnnouncementManageView: React.FC<AnnouncementManageViewProps> = ({
  onExitManage,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  const [manageList, setManageList] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [searchTitleInput, setSearchTitleInput] = useState('');
  const [searchTitle, setSearchTitle] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<Partial<Announcement>>(initialFormData);

  const [isReadStatusOpen, setIsReadStatusOpen] = useState(false);
  const [statsAnnouncementId, setStatsAnnouncementId] = useState<number | null>(null);
  const [statsData, setStatsData] = useState<ReadStatsResponse | null>(null);

  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: '',
    message: '',
    confirmText: '确定',
    danger: false,
    action: null,
  });

  const fetchManageList = async () => {
    try {
      setLoading(true);
      const result = await getManageList({
        title: searchTitle,
        type: filterType,
        status: filterStatus,
        page: currentPage,
        size: pageSize,
      });
      setManageList(result.list || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('获取公告管理列表失败', error);
      toast.error('获取公告列表失败');
      setManageList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getDeptTree()
      .then((response: any) => {
        setDeptTree(Array.isArray(response) ? response : []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    void fetchManageList();
  }, [currentPage, filterStatus, filterType, searchTitle]);

  const resetForm = () => {
    setFormData(initialFormData);
    setEditorMode('create');
  };

  const openCreateDialog = () => {
    resetForm();
    setIsEditorOpen(true);
  };

  const openEditDialog = (announcement: Announcement) => {
    setEditorMode('edit');
    setFormData(announcement);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    resetForm();
  };

  const handleSave = async () => {
    if (!formData.title || !formData.content) {
      toast.error('标题和内容不能为空');
      return;
    }

    try {
      setSaving(true);
      const submitData = {
        ...formData,
        expireTime: formData.expireTime ? toBackendDateString(formData.expireTime) : undefined,
      };

      if (editorMode === 'create') {
        await publishAnnouncement(submitData);
        toast.success('公告发布成功');
      } else {
        await updateAnnouncement(submitData);
        toast.success('公告更新成功');
      }

      closeEditor();
      await fetchManageList();
    } catch (error) {
      toast.error(editorMode === 'create' ? '公告发布失败' : '公告更新失败');
    } finally {
      setSaving(false);
    }
  };

  const openConfirm = (options: Omit<ConfirmState, 'open'>) => {
    setConfirmState({
      open: true,
      ...options,
    });
  };

  const closeConfirm = () => {
    setConfirmState((previous) => ({
      ...previous,
      open: false,
      action: null,
    }));
  };

  const handleDeleteRequest = (announcementId: number) => {
    openConfirm({
      title: '删除公告',
      message: '确定删除这条公告吗？此操作不可恢复。',
      confirmText: '删除',
      danger: true,
      action: async () => {
        await deleteAnnouncement(announcementId);
        toast.success('公告删除成功');
        await fetchManageList();
      },
    });
  };

  const handleRevokeRequest = (announcementId: number) => {
    openConfirm({
      title: '撤销公告',
      message: '确定撤销这条公告吗？撤销后员工将无法继续看到已发布内容。',
      confirmText: '撤销',
      danger: false,
      action: async () => {
        await revokeAnnouncement(announcementId);
        toast.success('公告撤销成功');
        await fetchManageList();
      },
    });
  };

  const handleToggleTop = async (announcementId: number) => {
    try {
      await toggleTop(announcementId);
      toast.success('置顶状态已更新');
      await fetchManageList();
    } catch (error) {
      toast.error('操作失败');
    }
  };

  const handleViewReadStatus = async (announcementId: number) => {
    try {
      setStatsLoading(true);
      const stats = await getReadStats(announcementId);
      setStatsAnnouncementId(announcementId);
      setStatsData(stats);
      setIsReadStatusOpen(true);
    } catch (error) {
      toast.error('获取阅读统计失败');
    } finally {
      setStatsLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilters = Boolean(searchTitle || filterType || filterStatus);
  const publishedCount = useMemo(
    () => manageList.filter((item) => item.status === '1').length,
    [manageList],
  );
  const topCount = useMemo(
    () => manageList.filter((item) => item.isTop === 1).length,
    [manageList],
  );
  const urgentCount = useMemo(
    () => manageList.filter((item) => item.priority === 'H').length,
    [manageList],
  );
  const currentStatusLabel =
    filterStatus === '1' ? '已发布' : filterStatus === '2' ? '已撤销' : filterStatus === '0' ? '草稿' : '全部';
  const currentTypeLabel =
    filterType === String(AnnouncementType.NOTIFICATION)
      ? '通知'
      : filterType === String(AnnouncementType.ANNOUNCEMENT)
        ? '公告'
        : filterType === String(AnnouncementType.URGENT)
          ? '紧急'
          : '全部';

  const overviewItems = [
    { label: '当前结果', value: `${manageList.length} 条` },
    { label: '筛选标题', value: searchTitle || '未设置' },
    { label: '状态', value: currentStatusLabel },
    { label: '类型', value: currentTypeLabel },
  ];

  const heroMetrics = [
    {
      label: '公告总量',
      value: `${total}`,
      hint: '管理端接口返回的总记录数',
      icon: <Megaphone size={17} />,
    },
    {
      label: '当前页结果',
      value: `${manageList.length}`,
      hint: `已发布 ${publishedCount} 条`,
      icon: <Bell size={17} />,
    },
    {
      label: '置顶公告',
      value: `${topCount}`,
      hint: `高优先级 ${urgentCount} 条`,
      icon: <Pin size={17} />,
    },
    {
      label: '阅读统计',
      value: statsData ? `${statsData.readCount}` : '--',
      hint: statsAnnouncementId ? '最近一次打开的阅读明细' : '打开某条公告即可查看',
      icon: <CheckCheck size={17} />,
    },
  ];

  const currentAnnouncementTitle = manageList.find(
    (item) => item.announcementId === statsAnnouncementId,
  )?.title;

  return (
    <div className="space-y-4">
      <WorkspaceHeroMetricsSection
        badge={
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              <Megaphone size={14} />
              Announcement Admin
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              总计 {total} 条
            </span>
          </div>
        }
        title="公告管理"
        description="把发布、编辑、撤销、置顶和阅读明细都统一回同一套公告工作台，避免管理端继续保留独立的旧表格布局。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" onClick={onExitManage}>
              <ArrowLeft size={16} />
              返回公告
            </Button>
            <Button variant="outline" size="lg" onClick={() => void fetchManageList()} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              刷新列表
            </Button>
            <Button size="lg" onClick={openCreateDialog}>
              <Megaphone size={16} />
              发布公告
            </Button>
          </div>
        }
        contentClassName="p-4 sm:p-5"
        metrics={heroMetrics}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
            公告管理工作台
          </span>
          <span className={surfaceChipClassName}>标题：{searchTitle || '未设置'}</span>
          <span className={surfaceChipClassName}>状态：{currentStatusLabel}</span>
          <span className={surfaceChipClassName}>类型：{currentTypeLabel}</span>
        </div>
      </WorkspaceHeroMetricsSection>

      <WorkspaceWorkbenchCard
        eyebrow="管理筛选"
        title="公告管理工作台"
        total={total}
        hasActiveFilters={hasActiveFilters}
        overviewItems={overviewItems}
        headerBadges={
          <div className="flex flex-wrap gap-2">
            <span className={surfaceChipClassName}>已发布 {publishedCount} 条</span>
            <span className={surfaceChipClassName}>置顶 {topCount} 条</span>
            <span className={surfaceChipClassName}>紧急 {urgentCount} 条</span>
          </div>
        }
        quickFilterAside={
          <div className="flex flex-wrap items-center gap-2">
            {hasActiveFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTitleInput('');
                  setSearchTitle('');
                  setFilterType('');
                  setFilterStatus('');
                  setCurrentPage(1);
                }}
              >
                清空筛选
              </Button>
            ) : (
              <span className={surfaceChipClassName}>当前为默认公告管理视图</span>
            )}
          </div>
        }
        filterBar={
          <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                value={searchTitleInput}
                onChange={(event) => setSearchTitleInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setCurrentPage(1);
                    setSearchTitle(searchTitleInput.trim());
                  }
                }}
                className="pl-10"
                placeholder="搜索公告标题"
              />
            </div>

            <Select
              value={filterType || 'ALL'}
              onValueChange={(value) => {
                setCurrentPage(1);
                setFilterType(value === 'ALL' ? '' : value);
              }}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部类型</SelectItem>
                <SelectItem value={String(AnnouncementType.NOTIFICATION)}>通知</SelectItem>
                <SelectItem value={String(AnnouncementType.ANNOUNCEMENT)}>公告</SelectItem>
                <SelectItem value={String(AnnouncementType.URGENT)}>紧急</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filterStatus || 'ALL'}
              onValueChange={(value) => {
                setCurrentPage(1);
                setFilterStatus(value === 'ALL' ? '' : value);
              }}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                <SelectItem value="0">草稿</SelectItem>
                <SelectItem value="1">已发布</SelectItem>
                <SelectItem value="2">已撤销</SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="button"
              onClick={() => {
                setCurrentPage(1);
                setSearchTitle(searchTitleInput.trim());
              }}
            >
              <Search size={15} />
              搜索公告
            </Button>
          </div>
        }
      />

      <WorkspaceResultCard
        total={total}
        title="当前公告列表"
        description="统一展示公告标题、类型、发布状态、置顶状态和阅读统计入口。"
        footer={
          total > 0 ? (
            <WorkspacePaginationBar
              total={total}
              pageNum={currentPage}
              totalPages={totalPages}
              onPrev={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              prevDisabled={currentPage <= 1}
              nextDisabled={currentPage >= totalPages}
            />
          ) : undefined
        }
      >
        <div className="space-y-4 p-4">
          {manageList.length > 0 && !loading ? (
            <div className={subtlePanelClassName}>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">公告治理概况</div>
                  <div className="flex flex-wrap gap-2">
                    <span className={surfaceChipClassName}>当前页 {manageList.length} 条</span>
                    <span className={surfaceChipClassName}>已发布 {publishedCount} 条</span>
                    <span className={surfaceChipClassName}>置顶 {topCount} 条</span>
                  </div>
                  <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                    公告管理页已经和桌面端其他标准治理页统一为同一套筛选、表格、危险操作确认和阅读明细查看语法。
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {loading ? (
            <WorkspaceInlineState type="loading" title="正在加载公告管理列表..." className="py-14" />
          ) : manageList.length === 0 ? (
            <WorkspaceInlineState
              icon={<Megaphone className="h-5 w-5" />}
              title="暂无公告记录"
              description={hasActiveFilters ? '当前筛选条件下没有匹配的公告。' : '可以先发布一条公告，再继续维护。'}
              className="py-14"
            />
          ) : (
            <AnnouncementManageTable
              embedded
              announcements={manageList}
              onEdit={openEditDialog}
              onToggleTop={handleToggleTop}
              onRevoke={handleRevokeRequest}
              onDelete={handleDeleteRequest}
              onViewStats={handleViewReadStatus}
            />
          )}
        </div>
      </WorkspaceResultCard>

      <BaseDialog
        open={isEditorOpen}
        title={editorMode === 'create' ? '发布新公告' : '编辑公告'}
        description="统一维护标题、类型、优先级、范围和正文内容，确保公告发布和编辑使用同一套工作台表单密度。"
        onClose={closeEditor}
        maxWidthClassName="max-w-4xl"
        headerAside={
          <div className="flex flex-wrap gap-2">
            <span className={surfaceChipClassName}>{editorMode === 'create' ? '发布模式' : '编辑模式'}</span>
            <span className={surfaceChipClassName}>范围：{formData.scopeType || AnnouncementScope.ALL}</span>
          </div>
        }
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeEditor}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : editorMode === 'create' ? '发布公告' : '保存修改'}
            </Button>
          </div>
        }
      >
        <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">标题</label>
            <Input
              type="text"
              className="h-12 rounded-2xl"
              value={formData.title || ''}
              onChange={(event) => setFormData({ ...formData, title: event.target.value })}
              placeholder="请输入公告标题"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">内容（支持 HTML）</label>
            <Textarea
              className="h-40 rounded-2xl font-mono text-sm"
              value={formData.content || ''}
              onChange={(event) => setFormData({ ...formData, content: event.target.value })}
              placeholder="请输入公告内容，支持 HTML 格式"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">类型</label>
              <Select
                value={String(formData.type)}
                onValueChange={(value) => setFormData({ ...formData, type: value as AnnouncementType })}
              >
                <SelectTrigger className="h-12 rounded-2xl">
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(AnnouncementType.NOTIFICATION)}>通知</SelectItem>
                  <SelectItem value={String(AnnouncementType.ANNOUNCEMENT)}>公告</SelectItem>
                  <SelectItem value={String(AnnouncementType.URGENT)}>紧急</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">优先级</label>
              <Select
                value={String(formData.priority)}
                onValueChange={(value) => setFormData({ ...formData, priority: value as 'L' | 'M' | 'H' })}
              >
                <SelectTrigger className="h-12 rounded-2xl">
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="L">低</SelectItem>
                  <SelectItem value="M">中</SelectItem>
                  <SelectItem value="H">高</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">过期时间（可选）</label>
              <DatePicker
                type="datetime-local"
                value={formData.expireTime ? new Date(formData.expireTime).toISOString().slice(0, 16) : ''}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    expireTime: event.target.value || undefined,
                  })
                }
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">置顶</label>
              <div className="flex h-12 items-center rounded-2xl border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
                <input
                  type="checkbox"
                  checked={formData.isTop === 1}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      isTop: event.target.checked ? 1 : 0,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900"
                />
                <label className="ml-2 text-sm text-slate-700 dark:text-slate-300">设为置顶</label>
              </div>
            </div>
          </div>

          <AnnouncementTargetingEditor
            scopeType={(formData.scopeType as AnnouncementScope) || AnnouncementScope.ALL}
            scopeValue={formData.scopeValue || ''}
            deptTree={deptTree}
            onScopeTypeChange={(scopeType) =>
              setFormData({
                ...formData,
                scopeType,
                scopeValue: scopeType === AnnouncementScope.ALL ? '' : formData.scopeValue || '',
              })
            }
            onScopeValueChange={(scopeValue) => setFormData({ ...formData, scopeValue })}
          />
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        danger={confirmState.danger}
        onCancel={closeConfirm}
        onConfirm={async () => {
          if (!confirmState.action) return;
          try {
            await confirmState.action();
            closeConfirm();
          } catch (error) {
            toast.error('操作失败');
          }
        }}
      />

      <AnnouncementReadStatusDialog
        open={isReadStatusOpen}
        announcementId={statsAnnouncementId}
        announcementTitle={currentAnnouncementTitle}
        statsData={statsData}
        loading={statsLoading}
        onRefresh={handleViewReadStatus}
        onClose={() => setIsReadStatusOpen(false)}
      />
    </div>
  );
};
