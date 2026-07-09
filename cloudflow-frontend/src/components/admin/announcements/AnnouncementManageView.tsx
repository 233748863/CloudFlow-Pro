import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bell, CheckCircle2, Megaphone, Pin, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
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
import { getDeptTree, getRoleOptions, type RoleOption } from '@/services/api/auth';
import { toBackendDateString } from '@/utils/dateFormat';
import { AnnouncementReadStatusDialog } from './AnnouncementReadStatusDialog';
import { AnnouncementTargetingEditor, type DeptItem } from './AnnouncementTargetingEditor';
import { AnnouncementManageTable, BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout';
import {
  Button,
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';

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

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="admin-source-stat-icon mb-3 h-10 w-10 border border-cyan-100 bg-[#effbfe] text-[#0d95b5] dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
      {icon || <Megaphone className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
  </div>
);

const flattenDepts = (depts: DeptItem[]): DeptItem[] => (
  depts.flatMap((dept) => [dept, ...(dept.children?.length ? flattenDepts(dept.children) : [])])
);

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
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);

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
      toast.error(getErrorMessage(error, '获取公告列表失败'));
      setManageList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getDeptTree()
      .then((response: unknown) => {
        setDeptTree(Array.isArray(response) ? (response as DeptItem[]) : []);
      })
      .catch((error) => {
        console.error('获取部门树失败', error);
        setDeptTree([]);
      });
  }, []);

  useEffect(() => {
    getRoleOptions()
      .then((response: unknown) => {
        setRoleOptions(Array.isArray(response) ? (response as RoleOption[]) : []);
      })
      .catch((error) => {
        console.error('获取角色选项失败', error);
        setRoleOptions([]);
      });
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
      console.error('保存公告失败', error);
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
      console.error('更新置顶状态失败', error);
      toast.error(getErrorMessage(error, '操作失败'));
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
      console.error('获取阅读统计失败', error);
      toast.error(getErrorMessage(error, '获取阅读统计失败'));
    } finally {
      setStatsLoading(false);
    }
  };

  const handleApplyFilters = () => {
    setCurrentPage(1);
    setSearchTitle(searchTitleInput.trim());
  };

  const handleResetFilters = () => {
    setSearchTitleInput('');
    setSearchTitle('');
    setFilterType('');
    setFilterStatus('');
    setCurrentPage(1);
  };

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
  const deptNameMap = useMemo(() => {
    const map = new Map<string, string>();
    flattenDepts(deptTree).forEach((dept) => {
      map.set(String(dept.deptId), dept.deptName);
    });
    return map;
  }, [deptTree]);
  const roleNameMap = useMemo(() => {
    const map = new Map<string, string>();
    roleOptions.forEach((role) => {
      if (role.roleId !== undefined) {
        map.set(String(role.roleId), role.roleName);
      }
      if (role.roleKey) {
        map.set(String(role.roleKey), role.roleName);
      }
    });
    return map;
  }, [roleOptions]);

  const currentAnnouncementTitle = manageList.find(
    (item) => item.announcementId === statsAnnouncementId,
  )?.title;

  const currentTypeLabel = filterType
    ? ({
        [String(AnnouncementType.NOTIFICATION)]: '通知',
        [String(AnnouncementType.ANNOUNCEMENT)]: '公告',
        [String(AnnouncementType.URGENT)]: '紧急',
      }[filterType] || filterType)
    : '';

  const currentStatusLabel = filterStatus
    ? ({
        '0': '草稿',
        '1': '已发布',
        '2': '已撤销',
      }[filterStatus] || filterStatus)
    : '';

  const toolbarSummary = [
    searchTitle ? `标题 ${searchTitle}` : null,
    currentTypeLabel,
    currentStatusLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  const stats = useMemo(
    () => [
      {
        label: '公告总数',
        value: String(total),
        meta: '全部记录',
        icon: <Bell size={18} />,
        tone: 'blue',
      },
      {
        label: '已发布',
        value: String(publishedCount),
        meta: '当前页',
        icon: <CheckCircle2 size={18} />,
        tone: 'green',
      },
      {
        label: '置顶公告',
        value: String(topCount),
        meta: '优先展示',
        icon: <Pin size={18} />,
        tone: 'amber',
      },
      {
        label: '高优先级',
        value: String(urgentCount),
        meta: '重点触达',
        icon: <Megaphone size={18} />,
        tone: 'violet',
      },
    ],
    [publishedCount, topCount, total, urgentCount],
  );

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">ANNOUNCEMENTS</p>
          <h2>公告管理</h2>
          <span>发布站内公告、维护已读状态和用户触达</span>
        </div>
        <div className="admin-source-controls admin-announcements-controls">
          <Button variant="outline" size="sm" onClick={() => void fetchManageList()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={onExitManage}>
            <ArrowLeft size={16} />
            返回公告
          </Button>
          <Button size="sm" onClick={openCreateDialog}>
            <Megaphone size={16} />
            发布公告
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid admin-announcements-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
            <div className="admin-source-stat-icon">{stat.icon}</div>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );

  const pageFilters = (
      <section className="card admin-users-toolbar">
        <div className="admin-announcements-toolbar">
          <label className="admin-source-search">
            <span className="input-label">搜索公告</span>
            <div className="admin-source-search-field">
              <Search size={16} />
              <input
                className="cf-control"
                value={searchTitleInput}
                onChange={(event) => setSearchTitleInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleApplyFilters();
                  }
                }}
                placeholder="搜索公告标题"
                type="search"
              />
            </div>
          </label>

          <label>
            <span className="input-label">类型</span>
            <Select
              value={filterType || 'ALL'}
              onValueChange={(value) => {
                setCurrentPage(1);
                setFilterType(value === 'ALL' ? '' : value);
              }}
            >
              <SelectTrigger className="h-[42px]">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部类型</SelectItem>
                <SelectItem value={String(AnnouncementType.NOTIFICATION)}>通知</SelectItem>
                <SelectItem value={String(AnnouncementType.ANNOUNCEMENT)}>公告</SelectItem>
                <SelectItem value={String(AnnouncementType.URGENT)}>紧急</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label>
            <span className="input-label">状态</span>
            <Select
              value={filterStatus || 'ALL'}
              onValueChange={(value) => {
                setCurrentPage(1);
                setFilterStatus(value === 'ALL' ? '' : value);
              }}
            >
              <SelectTrigger className="h-[42px]">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                <SelectItem value="0">草稿</SelectItem>
                <SelectItem value="1">已发布</SelectItem>
                <SelectItem value="2">已撤销</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <div className="admin-users-toolbar-actions">
            {toolbarSummary ? (
              <span className="admin-users-filter-count">{toolbarSummary}</span>
            ) : null}
            <Button type="button" size="sm" onClick={handleApplyFilters}>
              搜索
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleResetFilters}>
              清空
            </Button>
          </div>
        </div>
      </section>
  );

  const pageTable = loading ? (
    <InnerTableSurface className="min-h-[40rem]" wrapperClassName="flex min-h-[40rem] flex-col">
      <div className="flex min-h-[40rem] flex-col">
            <InlineState title="正在加载公告管理列表..." className="flex-1 py-10" />
      </div>
    </InnerTableSurface>
  ) : manageList.length === 0 ? (
    <InnerTableSurface className="min-h-[40rem]" wrapperClassName="flex min-h-[40rem] flex-col">
      <div className="flex min-h-[40rem] flex-col">
            <InlineState
              title="暂无公告记录"
              description={hasActiveFilters ? '当前筛选条件下暂无记录。' : '可先发布公告。'}
              className="flex-1 py-10"
            />
      </div>
    </InnerTableSurface>
  ) : (
            <AnnouncementManageTable
              embedded
              announcements={manageList}
              onEdit={openEditDialog}
              onToggleTop={handleToggleTop}
              onRevoke={handleRevokeRequest}
              onDelete={handleDeleteRequest}
              onViewStats={handleViewReadStatus}
              deptNameMap={deptNameMap}
              roleNameMap={roleNameMap}
            />
  );

  const pagePagination = total > 0 ? (
          <Pagination
            total={total}
            page={currentPage}
            pageSize={pageSize}
            showPageSizeSelector={false}
            showJump={false}
            onPageChange={setCurrentPage}
            onPageSizeChange={() => {}}
          />
  ) : null;

  return (
    <section className="admin-source-page admin-announcements-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageTable}
        pagination={pagePagination}
      />

      <BaseDialog
        open={isEditorOpen}
        title={editorMode === 'create' ? '发布新公告' : '编辑公告'}
        onClose={closeEditor}
        maxWidthClassName="max-w-5xl"
        panelClassName="max-h-[92vh]"
        bodyClassName="max-h-[72vh] overflow-y-auto"
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
        <div className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field md:col-span-2">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">标题</Label>
              <Input
                className="h-11"
                value={formData.title || ''}
                onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                placeholder="请输入公告标题"
              />
            </div>

            <div className="admin-dialog-field md:col-span-2">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">内容</Label>
              <Textarea
                className="min-h-[160px] font-mono text-sm"
                value={formData.content || ''}
                onChange={(event) => setFormData({ ...formData, content: event.target.value })}
                placeholder="请输入公告内容，支持 HTML 格式"
              />
            </div>

            <div className="admin-dialog-field">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">类型</Label>
              <Select
                value={String(formData.type ?? AnnouncementType.NOTIFICATION)}
                onValueChange={(value) => setFormData({ ...formData, type: value as AnnouncementType })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="请选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(AnnouncementType.NOTIFICATION)}>通知</SelectItem>
                  <SelectItem value={String(AnnouncementType.ANNOUNCEMENT)}>公告</SelectItem>
                  <SelectItem value={String(AnnouncementType.URGENT)}>紧急</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="admin-dialog-field">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">优先级</Label>
              <Select
                value={String(formData.priority ?? 'M')}
                onValueChange={(value) => setFormData({ ...formData, priority: value as 'L' | 'M' | 'H' })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="请选择优先级" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="L">低</SelectItem>
                  <SelectItem value="M">中</SelectItem>
                  <SelectItem value="H">高</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="admin-dialog-field">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">过期时间</Label>
              <DatePicker
                className="h-11"
                type="datetime-local"
                value={formData.expireTime ? new Date(formData.expireTime).toISOString().slice(0, 16) : ''}
                onChange={(event) => setFormData({
                  ...formData,
                  expireTime: event.target.value || undefined,
                })}
              />
            </div>

            <div className="admin-dialog-field">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">置顶</Label>
              <label className="admin-dialog-checkline">
                <input
                  type="checkbox"
                  checked={formData.isTop === 1}
                  onChange={(event) => setFormData({
                    ...formData,
                    isTop: event.target.checked ? 1 : 0,
                  })}
                  className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900"
                />
                设为置顶
              </label>
            </div>
          </div>

          <div className="admin-dialog-subsection">
            <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">发布范围</div>

            <AnnouncementTargetingEditor
              scopeType={(formData.scopeType as AnnouncementScope) || AnnouncementScope.ALL}
              scopeValue={formData.scopeValue || ''}
              deptTree={deptTree}
              onScopeTypeChange={(scopeType) => setFormData((previous) => ({
                ...previous,
                scopeType,
                scopeValue: scopeType === AnnouncementScope.ALL ? '' : previous.scopeValue || '',
              }))}
              onScopeValueChange={(scopeValue) => setFormData((previous) => ({ ...previous, scopeValue }))}
            />
          </div>
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
          if (!confirmState.action) {
            return;
          }

          try {
            await confirmState.action();
            closeConfirm();
          } catch (error) {
            console.error('执行公告管理操作失败', error);
            toast.error(getErrorMessage(error, '操作失败'));
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
    </section>
  );
};
