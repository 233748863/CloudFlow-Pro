import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Edit,
  Eye,
  Megaphone,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Announcement,
  AnnouncementScope,
  AnnouncementType,
  Role,
} from '../types';
import {
  deleteAnnouncement,
  getManageList,
  getMyAnnouncements,
  getReadStats,
  markAnnouncementRead,
  publishAnnouncement,
  revokeAnnouncement,
  toggleTop,
  updateAnnouncement,
} from '../services/api/announcement';
import { useAuth } from '../context/AuthContext';
import { toBackendDateString } from '../utils/dateFormat';
import {
  Button,
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { getDeptTree, getRoleList } from '../services/api/auth';
import {
  WorkspaceBackdrop,
  WorkspaceEmptyPanel,
  WorkspaceInlineState,
} from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';
import { cn } from '@/utils/cn';

interface DeptItem {
  deptId: number;
  parentId: number;
  deptName: string;
  orderNum: number;
  children?: DeptItem[];
}

interface ReadStatsData {
  readCount: number;
  readUsers: Array<{
    userId: number;
    userName?: string;
    nickName?: string;
    readTime?: string;
  }>;
}

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const stripHtml = (content: string) => content.replace(/<[^>]+>/g, '').trim();

const getAnnouncementTypeMeta = (type: AnnouncementType) => {
  switch (type) {
    case AnnouncementType.ANNOUNCEMENT:
      return {
        label: '公告',
        icon: <Megaphone size={16} className="text-sky-500" />,
        className: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
      };
    case AnnouncementType.URGENT:
      return {
        label: '紧急',
        icon: <AlertCircle size={16} className="text-rose-500" />,
        className: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
      };
    case AnnouncementType.NOTIFICATION:
    default:
      return {
        label: '通知',
        icon: <Bell size={16} className="text-pink-500" />,
        className: 'bg-pink-50 text-pink-600 ring-1 ring-pink-100',
      };
  }
};

const getPriorityMeta = (priority?: string) => {
  switch (priority) {
    case 'H':
      return {
        label: '高优先级',
        className: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
      };
    case 'L':
      return {
        label: '低优先级',
        className: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
      };
    default:
      return {
        label: '中优先级',
        className: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
      };
  }
};

const getStatusMeta = (status?: string) => {
  switch (status) {
    case '0':
      return {
        label: '草稿',
        className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
      };
    case '1':
      return {
        label: '已发布',
        className: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
      };
    case '2':
      return {
        label: '已撤销',
        className: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
      };
    default:
      return {
        label: '未知状态',
        className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
      };
  }
};

const flattenDepts = (
  depts: DeptItem[],
  level = 0,
): { dept: DeptItem; level: number }[] => {
  const result: { dept: DeptItem; level: number }[] = [];
  for (const dept of depts) {
    result.push({ dept, level });
    if (dept.children?.length) {
      result.push(...flattenDepts(dept.children, level + 1));
    }
  }
  return result;
};

const EmptyPanel = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => <WorkspaceEmptyPanel variant="glass" icon={icon} title={title} description={description} />;

const DeptTreePicker: React.FC<{
  value: string;
  onChange: (v: string) => void;
  deptTree: DeptItem[];
}> = ({ value, onChange, deptTree }) => {
  const [search, setSearch] = useState('');
  const [expandedDepts, setExpandedDepts] = useState<Set<number>>(new Set());

  const selectedIds = value ? value.split(',').filter(Boolean).map(Number) : [];

  const toggleDept = (id: number) => {
    const newIds = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    onChange(newIds.join(','));
  };

  const toggleExpand = (deptId: number) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  };

  const flat = flattenDepts(deptTree);
  const selectedDepts = flat
    .filter((item) => selectedIds.includes(item.dept.deptId))
    .map((item) => item.dept);

  const nodeMatchesSearch = (node: DeptItem, keyword: string): boolean => {
    if (!keyword) return true;
    const normalized = keyword.toLowerCase();
    if (node.deptName.toLowerCase().includes(normalized)) return true;
    return Boolean(node.children?.some((child) => nodeMatchesSearch(child, keyword)));
  };

  const renderDeptNode = (node: DeptItem, depth = 0): React.ReactNode => {
    if (search && !nodeMatchesSearch(node, search)) return null;

    const isExpanded = expandedDepts.has(node.deptId) || !!search;
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isSelected = selectedIds.includes(node.deptId);

    return (
      <div key={node.deptId}>
        <div
          className="group flex cursor-pointer items-center gap-1 rounded-xl px-2 py-1.5 hover:bg-slate-50"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <button
            type="button"
            onClick={() => toggleExpand(node.deptId)}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400 hover:text-slate-600"
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span className="w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => toggleDept(node.deptId)}
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
              isSelected
                ? 'border-pink-500 bg-pink-500'
                : 'border-slate-300 hover:border-pink-300',
            )}
          >
            {isSelected ? <div className="h-2 w-2 rounded-full bg-white" /> : null}
          </button>
          <Building2 size={14} className="ml-1 shrink-0 text-amber-500" />
          <span
            className="flex-1 truncate text-sm font-medium text-slate-700 select-none"
            onClick={() => toggleExpand(node.deptId)}
          >
            {node.deptName}
          </span>
        </div>
        {isExpanded && node.children?.map((child) => renderDeptNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      {selectedDepts.length > 0 ? (
        <div className="border-b border-slate-100 bg-pink-50/45 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500">
            已选部门
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedDepts.map((dept) => (
              <span
                key={dept.deptId}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-pink-600 ring-1 ring-pink-100"
              >
                {dept.deptName}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleDept(dept.deptId);
                  }}
                  className="text-pink-300 hover:text-pink-500"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="border-b border-slate-100 bg-slate-50/60 p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            className="h-11 rounded-2xl pl-9 text-sm"
            placeholder="搜索部门..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-2">
        {deptTree.length === 0 ? (
          <WorkspaceInlineState title="暂无部门数据" className="py-6" />
        ) : (
          deptTree.map((node) => renderDeptNode(node, 0))
        )}
      </div>
      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
        已选择 <span className="font-medium text-pink-500">{selectedDepts.length}</span> 个部门
      </div>
    </div>
  );
};

const RoleListPicker: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => {
  const [search, setSearch] = useState('');
  const [roles, setRoles] = useState<any[]>([]);

  useEffect(() => {
    getRoleList()
      .then((res: any) => {
        setRoles(Array.isArray(res) ? res : res?.rows || res?.records || []);
      })
      .catch(console.error);
  }, []);

  const selectedIds = value ? value.split(',').filter(Boolean) : [];

  const getRoleIdentifier = (role: any) => String(role.roleId || role.id || role.roleKey);

  const toggleRole = (id: string) => {
    const newIds = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    onChange(newIds.join(','));
  };

  const selectedRoles = roles.filter((role) => selectedIds.includes(getRoleIdentifier(role)));
  const filteredRoles = roles.filter(
    (role) =>
      !search ||
      (role.roleName || '').toLowerCase().includes(search.toLowerCase()) ||
      (role.name || '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      {selectedRoles.length > 0 ? (
        <div className="border-b border-slate-100 bg-pink-50/45 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500">
            已选角色
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedRoles.map((role) => {
              const id = getRoleIdentifier(role);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-pink-600 ring-1 ring-pink-100"
                >
                  {role.roleName || role.name}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleRole(id);
                    }}
                    className="text-pink-300 hover:text-pink-500"
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="border-b border-slate-100 bg-slate-50/60 p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            className="h-11 rounded-2xl pl-9 text-sm"
            placeholder="搜索角色..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-2">
        {roles.length === 0 ? (
          <WorkspaceInlineState title="加载中或暂无角色数据" className="py-6" />
        ) : filteredRoles.length === 0 ? (
          <WorkspaceInlineState title="未找到匹配的角色" className="py-6" />
        ) : (
          filteredRoles.map((role) => {
            const id = getRoleIdentifier(role);
            const isSelected = selectedIds.includes(id);
            return (
              <div
                key={id}
                className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
                onClick={() => toggleRole(id)}
              >
                <button
                  type="button"
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                    isSelected
                      ? 'border-pink-500 bg-pink-500'
                      : 'border-slate-300 group-hover:border-pink-300',
                  )}
                >
                  {isSelected ? <div className="h-2 w-2 rounded-full bg-white" /> : null}
                </button>
                <Shield size={14} className="shrink-0 text-emerald-500" />
                <span className="flex-1 truncate text-sm font-medium text-slate-700 select-none">
                  {role.roleName || role.name}
                </span>
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
        已选择 <span className="font-medium text-pink-500">{selectedRoles.length}</span> 个角色
      </div>
    </div>
  );
};

export const AnnouncementPage = () => {
  const { user } = useAuth();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeTab, setActiveTab] = useState<'unread' | 'read' | 'manage'>('unread');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<Partial<Announcement>>({
    type: AnnouncementType.NOTIFICATION,
    scopeType: AnnouncementScope.ALL,
    priority: 'M',
    content: '',
    isTop: 0,
  });

  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [statsData, setStatsData] = useState<ReadStatsData | null>(null);

  const [manageList, setManageList] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [searchTitle, setSearchTitle] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);

  useEffect(() => {
    getDeptTree()
      .then((res: any) => {
        setDeptTree(Array.isArray(res) ? res : []);
      })
      .catch(console.error);
  }, []);

  const fetchAnnouncements = async () => {
    try {
      if (activeTab === 'manage') {
        const result = await getManageList({
          title: searchTitle,
          type: filterType,
          status: filterStatus,
          page: currentPage,
          size: pageSize,
        });
        setManageList(result.list || []);
        setTotal(result.total || 0);
      } else {
        const list = await getMyAnnouncements();
        setAnnouncements(Array.isArray(list) ? list : []);
      }
    } catch (error) {
      console.error('获取公告失败', error);
      if (activeTab === 'manage') {
        setManageList([]);
      } else {
        setAnnouncements([]);
      }
    }
  };

  useEffect(() => {
    if (user) {
      fetchAnnouncements();
    }
  }, [user, activeTab, currentPage, searchTitle, filterType, filterStatus]);

  const handleRead = async (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    if (!announcement.isRead) {
      try {
        await markAnnouncementRead(announcement.announcementId.toString());
        await fetchAnnouncements();
        window.dispatchEvent(new Event('announcementRead'));
      } catch (error) {
        console.error('标记已读失败', error);
      }
    }
  };

  // 发布与编辑共用同一套表单，提交前统一转换日期格式，避免页面层散落转换逻辑。
  const handlePublish = async () => {
    if (!formData.title || !formData.content) {
      toast.error('标题和内容不能为空');
      return;
    }

    try {
      const submitData = {
        ...formData,
        expireTime: formData.expireTime ? toBackendDateString(formData.expireTime) : undefined,
      };

      if (modalMode === 'create') {
        await publishAnnouncement(submitData);
        toast.success('公告发布成功');
      } else {
        await updateAnnouncement(submitData);
        toast.success('公告更新成功');
      }

      setIsModalOpen(false);
      resetForm();
      await fetchAnnouncements();
    } catch (error) {
      toast.error(modalMode === 'create' ? '公告发布失败' : '公告更新失败');
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setModalMode('edit');
    setFormData(announcement);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这条公告吗？')) return;
    try {
      await deleteAnnouncement(id);
      toast.success('公告删除成功');
      await fetchAnnouncements();
    } catch (error) {
      toast.error('公告删除失败');
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm('确定撤销这条公告吗？')) return;
    try {
      await revokeAnnouncement(id);
      toast.success('公告撤销成功');
      await fetchAnnouncements();
    } catch (error) {
      toast.error('公告撤销失败');
    }
  };

  const handleToggleTop = async (id: number) => {
    try {
      await toggleTop(id);
      toast.success('置顶状态已更新');
      await fetchAnnouncements();
    } catch (error) {
      toast.error('操作失败');
    }
  };

  const handleViewStats = async (id: number) => {
    try {
      const stats = await getReadStats(id);
      setStatsData(stats);
      setIsStatsModalOpen(true);
    } catch (error) {
      toast.error('获取阅读统计失败');
    }
  };

  const resetForm = () => {
    setFormData({
      type: AnnouncementType.NOTIFICATION,
      scopeType: AnnouncementScope.ALL,
      priority: 'M',
      content: '',
      isTop: 0,
    });
    setModalMode('create');
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchAnnouncements();
  };

  const handleReset = () => {
    setSearchTitle('');
    setFilterType('');
    setFilterStatus('');
    setCurrentPage(1);
  };

  const displayList = announcements.filter((announcement) => {
    if (activeTab === 'unread') return !announcement.isRead;
    if (activeTab === 'read') return announcement.isRead;
    return true;
  });

  const unreadCount = announcements.filter((announcement) => !announcement.isRead).length;
  const readCount = announcements.filter((announcement) => announcement.isRead).length;
  const topCount = announcements.filter((announcement) => announcement.isTop === 1).length;
  const activeTabTitle =
    activeTab === 'unread' ? '未读消息' : activeTab === 'read' ? '历史消息' : '公告管理';
  const dateLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const canManage = user?.role === Role.ADMIN || user?.role === Role.HR;
  const announcementSummary =
    activeTab === 'unread'
      ? unreadCount > 0
        ? `当前还有 ${unreadCount} 条未读公告，建议优先处理置顶或紧急消息。`
        : '当前没有未读公告，公告中心状态平稳。'
      : activeTab === 'read'
        ? '这里集中归档你已经查看过的公告，方便后续追溯和再次确认。'
        : '发布、编辑、撤销、置顶和阅读统计都在这里统一管理。';

  const overviewItems = [
    {
      label: '当前视图',
      value: activeTabTitle,
      toneClassName:
        'border-pink-100 bg-[linear-gradient(135deg,rgba(253,242,248,0.92),rgba(255,255,255,0.84))] text-pink-600 shadow-[0_10px_24px_rgba(236,72,153,0.08)]',
    },
    {
      label: '未读公告',
      value: unreadCount,
    },
    {
      label: '置顶公告',
      value: topCount,
    },
    {
      label: '管理总量',
      value: activeTab === 'manage' ? total : announcements.length,
    },
  ];

  const metricCards = [
    {
      label: '未读消息',
      value: unreadCount,
      hint: '需要优先查看',
      aside: <Bell size={18} className="text-pink-500" />,
    },
    {
      label: '历史消息',
      value: readCount,
      hint: '已完成阅读',
      aside: <Eye size={18} className="text-slate-500" />,
    },
    {
      label: '置顶公告',
      value: topCount,
      hint: '重点消息总数',
      aside: <Pin size={18} className="text-amber-500" />,
    },
    {
      label: '管理总量',
      value: activeTab === 'manage' ? total : announcements.length,
      hint: '当前统计口径下的公告数量',
      aside: <Megaphone size={18} className="text-rose-500" />,
    },
  ];

  if (!user) {
    return null;
  }

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-6 p-6">
        <WorkspaceHeroCard
          badge={
            <span className="inline-flex items-center gap-2 rounded-full bg-white/82 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500 ring-1 ring-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <Megaphone className="h-3.5 w-3.5" />
              Announcement Workspace
            </span>
          }
          title="公告中心"
          description={announcementSummary}
          actions={
            <div className="flex flex-wrap gap-3">
              {canManage ? (
                <Button
                  className="h-12 rounded-2xl px-6"
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(true);
                  }}
                >
                  <Plus size={16} className="mr-2" />
                  发布公告
                </Button>
              ) : null}
              {canManage ? (
                <Button
                  variant="outline"
                  className="h-12 rounded-2xl bg-white/85 px-6"
                  onClick={() => setActiveTab('manage')}
                >
                  <Shield size={16} className="mr-2 text-pink-500" />
                  公告管理
                </Button>
              ) : null}
            </div>
          }
        >
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
            <span className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-pink-600 ring-1 ring-pink-100">
              <Calendar size={14} />
              {dateLabel}
            </span>
            <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">
              {timeLabel}
            </span>
            <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">
              {activeTabTitle}
            </span>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-4">
            {metricCards.map((card) => (
              <WorkspaceMetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                hint={card.hint}
                aside={card.aside}
              />
            ))}
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          eyebrow="公告工作区"
          title={activeTabTitle}
          total={activeTab === 'manage' ? total : displayList.length}
          hasActiveFilters={
            activeTab === 'manage'
              ? Boolean(searchTitle || filterType || filterStatus)
              : activeTab !== 'unread'
          }
          overviewItems={overviewItems}
          quickFilters={[
            { label: '未读消息', value: 'unread' },
            { label: '历史消息', value: 'read' },
            ...(canManage ? [{ label: '公告管理', value: 'manage' }] : []),
          ]}
          activeQuickFilter={activeTab}
          onQuickFilterChange={(value) =>
            setActiveTab(value as 'unread' | 'read' | 'manage')
          }
          filterBar={
            activeTab === 'manage' ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto_auto]">
                <Input
                  type="text"
                  placeholder="搜索标题..."
                  value={searchTitle}
                  onChange={(event) => setSearchTitle(event.target.value)}
                  className="h-12 rounded-2xl"
                />
                <Select value={filterType || 'ALL'} onValueChange={(value) => setFilterType(value === 'ALL' ? '' : value)}>
                  <SelectTrigger className="h-12 rounded-2xl">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">所有类型</SelectItem>
                    <SelectItem value={String(AnnouncementType.NOTIFICATION)}>通知</SelectItem>
                    <SelectItem value={String(AnnouncementType.ANNOUNCEMENT)}>公告</SelectItem>
                    <SelectItem value={String(AnnouncementType.URGENT)}>紧急</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus || 'ALL'} onValueChange={(value) => setFilterStatus(value === 'ALL' ? '' : value)}>
                  <SelectTrigger className="h-12 rounded-2xl">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">所有状态</SelectItem>
                    <SelectItem value="0">草稿</SelectItem>
                    <SelectItem value="1">已发布</SelectItem>
                    <SelectItem value="2">已撤销</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleSearch} className="h-12 rounded-2xl">
                  <Search size={16} className="mr-2" />
                  搜索
                </Button>
                <Button variant="outline" onClick={handleReset} className="h-12 rounded-2xl">
                  <RotateCcw size={16} className="mr-2" />
                  重置
                </Button>
              </div>
            ) : (
              <div className="text-sm leading-6 text-slate-500">
                {activeTab === 'read'
                  ? '这里会沉淀你已经读过的公告，便于后续追溯。'
                  : '未读消息会优先展示置顶和高优先级公告，帮助你快速确认团队通知。'}
              </div>
            )
          }
        />

        <WorkspaceResultCard
          total={activeTab === 'manage' ? total : displayList.length}
          title={activeTab === 'manage' ? '公告管理列表' : activeTabTitle}
          description={
            activeTab === 'manage'
              ? '统一处理公告发布、编辑、撤销、置顶和阅读统计。'
              : '按阅读状态查看公告详情，未读消息会优先标识。'
          }
          footer={
            activeTab === 'manage' ? (
              <div className="flex items-center justify-between border-t border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.72),rgba(255,255,255,0.6))] px-4 py-3">
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  共 {total} 条
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                    className="rounded-xl"
                  >
                    上一页
                  </Button>
                  <span className="px-3 py-2 text-sm text-slate-600">第 {currentPage} 页</span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((page) => page + 1)}
                    disabled={currentPage * pageSize >= total}
                    className="rounded-xl"
                  >
                    下一页
                  </Button>
                </div>
              </div>
            ) : null
          }
        >
          <div className="p-4">
            {activeTab === 'manage' ? (
              <div className="overflow-hidden rounded-[24px] border border-white/80 bg-white/85 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <div className="overflow-x-auto">
                  <table className="min-w-[1360px] w-full">
                    <TableHeader className="sticky top-0 z-10">
                      <tr>
                        <TableHead className="px-4 py-3 text-left w-[30%]">标题</TableHead>
                        <TableHead className="px-4 py-3 text-left">类型</TableHead>
                        <TableHead className="px-4 py-3 text-left">状态</TableHead>
                        <TableHead className="px-4 py-3 text-left">优先级</TableHead>
                        <TableHead className="px-4 py-3 text-left">已读人数</TableHead>
                        <TableHead className="px-4 py-3 text-left w-44">发布时间</TableHead>
                        <TableActionHead className="px-4 py-3 w-[360px]">操作</TableActionHead>
                      </tr>
                    </TableHeader>
                    <tbody className="divide-y divide-slate-100">
                      {manageList.map((item) => {
                        const typeMeta = getAnnouncementTypeMeta(item.type);
                        const statusMeta = getStatusMeta(item.status);
                        const priorityMeta = getPriorityMeta(item.priority);

                        return (
                          <tr key={item.announcementId} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3 w-[30%]">
                              <div className="flex min-w-0 items-center gap-2">
                                {item.isTop === 1 ? <Pin size={14} className="text-red-500" /> : null}
                                <span className="min-w-0 truncate text-sm text-slate-900">{item.title}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', typeMeta.className)}>
                                {typeMeta.icon}
                                {typeMeta.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', statusMeta.className)}>
                                {statusMeta.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', priorityMeta.className)}>
                                {priorityMeta.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => handleViewStats(item.announcementId)}
                                className="flex items-center gap-1 text-sm text-pink-500 hover:text-pink-700"
                              >
                                <Users size={14} />
                                查看
                              </button>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                              {item.publishTime ? new Date(item.publishTime).toLocaleString() : '-'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <TableRowActions
                                align="end"
                                wrap={false}
                                className="whitespace-nowrap"
                                actions={[
                                  { label: '查看', icon: <Eye size={16} />, onClick: () => handleRead(item), tone: 'info' },
                                  { label: '编辑', icon: <Edit size={16} />, onClick: () => handleEdit(item), tone: 'success' },
                                  {
                                    label: item.isTop === 1 ? '取消置顶' : '置顶',
                                    icon: <Pin size={16} />,
                                    onClick: () => handleToggleTop(item.announcementId),
                                    tone: item.isTop === 1 ? 'danger' : 'neutral',
                                  },
                                  { label: '撤销', icon: <X size={16} />, onClick: () => handleRevoke(item.announcementId), tone: 'warning', hidden: item.status !== '1' },
                                  { label: '删除', icon: <Trash2 size={16} />, onClick: () => handleDelete(item.announcementId), tone: 'danger' },
                                ]}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : displayList.length === 0 ? (
              <EmptyPanel
                icon={<Bell size={26} />}
                title="暂无相关消息"
                description="新公告发布后会在这里展示，未读消息会优先标识。"
              />
            ) : (
              <div className="space-y-3">
                {displayList.map((item) => {
                  const typeMeta = getAnnouncementTypeMeta(item.type);
                  const priorityMeta = getPriorityMeta(item.priority);
                  const excerpt = stripHtml(item.content).slice(0, 100);

                  return (
                    <button
                      key={item.announcementId}
                      type="button"
                      onClick={() => handleRead(item)}
                      className={cn(
                        'flex w-full items-start gap-4 rounded-[24px] border px-4 py-4 text-left transition',
                        !item.isRead
                          ? 'border-pink-100 bg-pink-50/25 hover:bg-pink-50/40'
                          : 'border-white/80 bg-white hover:bg-slate-50/70',
                      )}
                    >
                      <div className="mt-1 shrink-0">{typeMeta.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          {item.isTop === 1 ? <Pin size={14} className="text-red-500" /> : null}
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', priorityMeta.className)}>
                            {priorityMeta.label}
                          </span>
                          <h3
                            className={cn(
                              'truncate text-sm',
                              !item.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-600',
                            )}
                          >
                            {item.title}
                          </h3>
                          <span className="ml-auto shrink-0 text-xs text-slate-400">
                            {new Date(item.createTime).toLocaleString()}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-xs text-slate-500">{excerpt}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </WorkspaceResultCard>
      </div>

      {selectedAnnouncement ? (
        <WorkspaceDialogShell
          title={selectedAnnouncement.title}
          description="查看公告详情、发布时间和生效范围。"
          onClose={() => setSelectedAnnouncement(null)}
          maxWidthClassName="max-w-3xl"
          bodyClassName="max-h-[82vh] overflow-y-auto"
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {selectedAnnouncement.isTop === 1 ? <Pin size={14} className="text-red-500" /> : null}
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', getPriorityMeta(selectedAnnouncement.priority).className)}>
                {getPriorityMeta(selectedAnnouncement.priority).label}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                {selectedAnnouncement.scopeType === AnnouncementScope.ALL ? '全员' : '定向'}
              </span>
            </div>

            <div className="space-y-1 text-xs text-slate-400">
              <p>
                发布时间：
                {selectedAnnouncement.publishTime
                  ? new Date(selectedAnnouncement.publishTime).toLocaleString()
                  : new Date(selectedAnnouncement.createTime).toLocaleString()}
              </p>
              {selectedAnnouncement.expireTime ? (
                <p>有效期至：{new Date(selectedAnnouncement.expireTime).toLocaleString()}</p>
              ) : null}
            </div>

            <div className="prose prose-sm max-w-none text-slate-600">
              <div dangerouslySetInnerHTML={{ __html: selectedAnnouncement.content }} />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setSelectedAnnouncement(null)}>关闭</Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      ) : null}

      {isModalOpen ? (
        <WorkspaceDialogShell
          title={modalMode === 'create' ? '发布新公告' : '编辑公告'}
          description="填写标题、类型、优先级、范围和正文内容，完成公告发布或更新。"
          onClose={() => {
            setIsModalOpen(false);
            resetForm();
          }}
          maxWidthClassName="max-w-3xl"
          bodyClassName="max-h-[86vh] overflow-y-auto"
        >
          <div className="space-y-4">
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                  onValueChange={(value) =>
                    setFormData({ ...formData, priority: value as 'L' | 'M' | 'H' })
                  }
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
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">发布范围</label>
                <Select
                  value={String(formData.scopeType)}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      scopeType: value as AnnouncementScope,
                      scopeValue: '',
                    })
                  }
                >
                  <SelectTrigger className="h-12 rounded-2xl">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={String(AnnouncementScope.ALL)}>全员</SelectItem>
                    <SelectItem value={String(AnnouncementScope.DEPT)}>部门</SelectItem>
                    <SelectItem value={String(AnnouncementScope.ROLE)}>角色</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.scopeType === AnnouncementScope.DEPT || formData.scopeType === AnnouncementScope.ROLE ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {formData.scopeType === AnnouncementScope.DEPT ? '选择部门' : '选择角色'}
                </label>
                {formData.scopeType === AnnouncementScope.DEPT ? (
                  <DeptTreePicker
                    value={formData.scopeValue || ''}
                    onChange={(value) => setFormData({ ...formData, scopeValue: value })}
                    deptTree={deptTree}
                  />
                ) : (
                  <RoleListPicker
                    value={formData.scopeValue || ''}
                    onChange={(value) => setFormData({ ...formData, scopeValue: value })}
                  />
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  过期时间（可选）
                </label>
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
                    className="h-4 w-4 rounded border-slate-300 text-pink-500 focus:ring-pink-400"
                  />
                  <label className="ml-2 text-sm text-slate-700">设为置顶</label>
                </div>
              </div>
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

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
              >
                取消
              </Button>
              <Button onClick={handlePublish}>{modalMode === 'create' ? '发布' : '保存'}</Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      ) : null}

      {isStatsModalOpen && statsData ? (
        <WorkspaceDialogShell
          title="阅读统计"
          description="查看公告已读人数和已读用户明细。"
          onClose={() => setIsStatsModalOpen(false)}
          maxWidthClassName="max-w-lg"
          bodyClassName="max-h-[80vh] overflow-y-auto"
        >
          <div className="space-y-5">
            <div className="text-center">
              <div className="text-3xl font-bold text-pink-500">{statsData.readCount}</div>
              <div className="text-sm text-slate-500">已读人数</div>
            </div>

            {statsData.readUsers.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">已读用户列表</div>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {statsData.readUsers.map((user, index) => (
                    <div
                      key={`${user.userId}-${index}`}
                      className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/82 px-4 py-3 text-xs text-slate-600 shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
                    >
                      <span>{user.nickName || user.userName || `用户 ${user.userId}`}</span>
                      <span>{user.readTime ? new Date(user.readTime).toLocaleString() : '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <WorkspaceInlineState
                icon={<Users size={20} />}
                title="暂无阅读记录"
                description="这条公告还没有被任何用户读取。"
                className="py-10"
              />
            )}

            <div className="flex justify-end">
              <Button onClick={() => setIsStatsModalOpen(false)}>关闭</Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      ) : null}
    </div>
  );
};

export default AnnouncementPage;
