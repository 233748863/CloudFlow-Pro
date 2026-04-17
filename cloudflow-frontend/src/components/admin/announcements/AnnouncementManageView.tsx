import React, { useEffect, useState } from 'react';
import { ArrowLeft, Megaphone } from 'lucide-react';
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
  AnnouncementManageFilterBar,
  AnnouncementManageTable,
  BaseDialog,
  ConfirmDialog,
  Pagination,
} from '@/components/common';
import {
  AnnouncementReadStatusDialog,
  AnnouncementTargetingEditor,
  type DeptItem,
} from '@/components/admin/announcements';
import { TablePageLayout } from '@/components/layout';
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

  const currentAnnouncementTitle = manageList.find(
    (item) => item.announcementId === statsAnnouncementId,
  )?.title;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xl font-semibold text-slate-900">公告管理</div>
            <div className="mt-1 text-sm text-slate-500">
              按源码的表格页方式集中处理公告发布、编辑、撤销、置顶和阅读状态。
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={onExitManage}>
              <ArrowLeft size={16} className="mr-2" />
              返回公告
            </Button>
            <Button className="pointer-events-none select-none">
              <Megaphone size={16} className="mr-2" />
              公告管理
            </Button>
          </div>
        </div>
      </div>

      <TablePageLayout
        filters={(
          <AnnouncementManageFilterBar
            searchTitle={searchTitleInput}
            filterType={filterType}
            filterStatus={filterStatus}
            onSearchTitleChange={setSearchTitleInput}
            onFilterTypeChange={(value) => {
              setCurrentPage(1);
              setFilterType(value);
            }}
            onFilterStatusChange={(value) => {
              setCurrentPage(1);
              setFilterStatus(value);
            }}
            onSearch={(value) => {
              setCurrentPage(1);
              setSearchTitle(value);
            }}
            onReset={() => {
              setSearchTitleInput('');
              setSearchTitle('');
              setFilterType('');
              setFilterStatus('');
              setCurrentPage(1);
            }}
            onRefresh={() => {
              void fetchManageList();
            }}
            onCreate={openCreateDialog}
            loading={loading}
          />
        )}
        table={(
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
        pagination={
          total > 0 ? (
            <Pagination
              total={total}
              page={currentPage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={() => {}}
              showPageSizeSelector={false}
            />
          ) : null
        }
      />

      <BaseDialog
        open={isEditorOpen}
        title={editorMode === 'create' ? '发布新公告' : '编辑公告'}
        description="填写标题、类型、优先级、范围和正文内容，完成公告发布或更新。"
        onClose={closeEditor}
        maxWidthClassName="max-w-4xl"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeEditor}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : editorMode === 'create' ? '发布' : '保存'}
            </Button>
          </div>
        )}
      >
        <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">标题</label>
            <Input
              type="text"
              className="h-12 rounded-2xl"
              value={formData.title || ''}
              onChange={(event) => setFormData({ ...formData, title: event.target.value })}
              placeholder="请输入公告标题"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">内容（支持 HTML）</label>
            <Textarea
              className="h-40 rounded-2xl font-mono text-sm"
              value={formData.content || ''}
              onChange={(event) => setFormData({ ...formData, content: event.target.value })}
              placeholder="请输入公告内容，支持 HTML 格式"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">类型</label>
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
              <label className="mb-1 block text-sm font-medium text-slate-700">优先级</label>
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
              <label className="mb-1 block text-sm font-medium text-slate-700">过期时间（可选）</label>
              <DatePicker
                type="datetime-local"
                value={
                  formData.expireTime
                    ? new Date(formData.expireTime).toISOString().slice(0, 16)
                    : ''
                }
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    expireTime: event.target.value || undefined,
                  })
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">置顶</label>
              <div className="flex h-12 items-center rounded-2xl border border-slate-200 bg-white px-4">
                <input
                  type="checkbox"
                  checked={formData.isTop === 1}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      isTop: event.target.checked ? 1 : 0,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-teal-500 focus:ring-teal-400"
                />
                <label className="ml-2 text-sm text-slate-700">设为置顶</label>
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
          if (!confirmState.action) {
            return;
          }
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
