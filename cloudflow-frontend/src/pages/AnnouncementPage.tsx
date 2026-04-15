import React, { useState, useEffect } from "react";
import {
  Announcement,
  AnnouncementType,
  AnnouncementScope,
  Role,
} from "../types";
import {
  getMyAnnouncements,
  markAnnouncementRead,
  publishAnnouncement,
  getManageList,
  updateAnnouncement,
  deleteAnnouncement,
  revokeAnnouncement,
  toggleTop,
  getReadStats,
} from "../services/api/announcement";
import { useAuth } from "../context/AuthContext";
import { toBackendDateString } from "../utils/dateFormat";
import {
  Bell,
  Megaphone,
  AlertCircle,
  Calendar,
  Eye,
  Plus,
  Edit,
  Trash2,
  X,
  Pin,
  Users,
  Search,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Building2,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Card,
  DatePicker,
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableHead,
  TableHeader,
  TableActionHead,
} from "@/components/ui";
import { TableRowActions } from "@/components/ui/table-row-actions";
import { getDeptTree, getRoleList } from "../services/api/auth";
import { WorkspaceEmptyPanel, WorkspaceInlineState } from "@/components/workspace/WorkspacePrimitives";

interface DeptItem {
  deptId: number;
  parentId: number;
  deptName: string;
  orderNum: number;
  children?: DeptItem[];
}

function formatDateCN(date: Date): string {
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}

const SectionHeader = ({
  eyebrow,
  title,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</div>
      <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{title}</div>
    </div>
    {actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition hover:text-pink-600"
      >
        {actionLabel}
        <ChevronRight size={14} />
      </button>
    ) : null}
  </div>
);

const EmptyPanel = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <WorkspaceEmptyPanel variant="glass" icon={icon} title={title} description={description} />
);

// 部门树扁平化
const flattenDepts = (
  depts: DeptItem[],
  level = 0,
): { dept: DeptItem; level: number }[] => {
  const result: { dept: DeptItem; level: number }[] = [];
  for (const d of depts) {
    result.push({ dept: d, level });
    if (d.children?.length) result.push(...flattenDepts(d.children, level + 1));
  }
  return result;
};

const DeptTreePicker: React.FC<{
  value: string;
  onChange: (v: string) => void;
  deptTree: DeptItem[];
}> = ({ value, onChange, deptTree }) => {
  const [search, setSearch] = useState("");
  const [expandedDepts, setExpandedDepts] = useState<Set<number>>(new Set());

  const selectedIds = value ? value.split(",").filter(Boolean).map(Number) : [];

  const toggleDept = (id: number) => {
    let newIds;
    if (selectedIds.includes(id)) {
      newIds = selectedIds.filter((i) => i !== id);
    } else {
      newIds = [...selectedIds, id];
    }
    onChange(newIds.join(","));
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
    .filter((f) => selectedIds.includes(f.dept.deptId))
    .map((f) => f.dept);

  const nodeMatchesSearch = (node: DeptItem, keyword: string): boolean => {
    if (!keyword) return true;
    const lk = keyword.toLowerCase();
    if (node.deptName.toLowerCase().includes(lk)) return true;
    if (node.children)
      return node.children.some((c) => nodeMatchesSearch(c, keyword));
    return false;
  };

  const renderDeptNode = (
    node: DeptItem,
    depth: number = 0,
  ): React.ReactNode => {
    if (search && !nodeMatchesSearch(node, search)) return null;

    const isExpanded = expandedDepts.has(node.deptId) || !!search;
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedIds.includes(node.deptId);

    return (
      <div key={node.deptId}>
        <div
          className="flex items-center gap-1 py-1.5 px-2 hover:bg-slate-50 rounded-md cursor-pointer group"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <button
            onClick={() => toggleExpand(node.deptId)}
            className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 shrink-0"
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )
            ) : (
              <span className="w-3.5" />
            )}
          </button>
          <button
            onClick={() => toggleDept(node.deptId)}
            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
              isSelected
                ? "bg-pink-500 border-pink-500"
                : "border-slate-300 hover:border-pink-300"
            }`}
          >
            {isSelected && <CheckCircle2 size={10} className="text-white" />}
          </button>
          <Building2 size={14} className="text-amber-500 shrink-0 ml-1" />
          <span
            className="text-sm font-medium text-slate-700 flex-1 truncate select-none"
            onClick={() => toggleExpand(node.deptId)}
          >
            {node.deptName}
          </span>
        </div>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderDeptNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      {selectedDepts.length > 0 && (
        <div className="border-b border-slate-100 bg-pink-50/45 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500">已选部门</div>
          <div className="flex flex-wrap gap-1">
            {selectedDepts.map((d) => (
              <span
                key={d.deptId}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-pink-600 ring-1 ring-pink-100"
              >
                {d.deptName}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDept(d.deptId);
                  }}
                  className="text-pink-300 hover:text-pink-500"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="border-b border-slate-100 bg-slate-50/60 p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            className="h-11 rounded-2xl pl-9 text-sm"
            placeholder="搜索部门..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
        已选择{" "}
        <span className="font-medium text-pink-500">
          {selectedDepts.length}
        </span>{" "}
        个部门
      </div>
    </div>
  );
};

const RoleListPicker: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => {
  const [search, setSearch] = useState("");
  const [roles, setRoles] = useState<any[]>([]);

  useEffect(() => {
    getRoleList()
      .then((res: any) => {
        setRoles(Array.isArray(res) ? res : res?.rows || res?.records || []);
      })
      .catch(console.error);
  }, []);

  const selectedIds = value ? value.split(",").filter(Boolean) : [];

  const getRoleIdentifier = (r: any) => String(r.roleId || r.id || r.roleKey);

  const toggleRole = (id: string) => {
    let newIds;
    if (selectedIds.includes(id)) {
      newIds = selectedIds.filter((i) => i !== id);
    } else {
      newIds = [...selectedIds, id];
    }
    onChange(newIds.join(","));
  };

  const selectedRoles = roles.filter((r) =>
    selectedIds.includes(getRoleIdentifier(r)),
  );
  const filteredRoles = roles.filter(
    (r) =>
      !search ||
      (r.roleName || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.name || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      {selectedRoles.length > 0 && (
        <div className="border-b border-slate-100 bg-pink-50/45 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500">已选角色</div>
          <div className="flex flex-wrap gap-1">
            {selectedRoles.map((r) => {
              const id = getRoleIdentifier(r);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-pink-600 ring-1 ring-pink-100"
                >
                  {r.roleName || r.name}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
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
      )}
      <div className="border-b border-slate-100 bg-slate-50/60 p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            className="h-11 rounded-2xl pl-9 text-sm"
            placeholder="搜索角色..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-2">
        {roles.length === 0 ? (
          <WorkspaceInlineState title="加载中或暂无角色数据" className="py-6" />
        ) : filteredRoles.length === 0 ? (
          <WorkspaceInlineState title="未找到匹配的角色" className="py-6" />
        ) : (
          filteredRoles.map((r) => {
            const id = getRoleIdentifier(r);
            const isSelected = selectedIds.includes(id);
            return (
              <div
                key={id}
                className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50 rounded-md cursor-pointer group"
                onClick={() => toggleRole(id)}
              >
                <button
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? "bg-pink-500 border-pink-500"
                      : "border-slate-300 group-hover:border-pink-300"
                  }`}
                >
                  {isSelected && (
                    <CheckCircle2 size={10} className="text-white" />
                  )}
                </button>
                <Shield size={14} className="text-emerald-500 shrink-0" />
                <span className="text-sm font-medium text-slate-700 flex-1 truncate select-none">
                  {r.roleName || r.name}
                </span>
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
        已选择{" "}
        <span className="font-medium text-pink-500">
          {selectedRoles.length}
        </span>{" "}
        个角色
      </div>
    </div>
  );
};

export const AnnouncementPage = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeTab, setActiveTab] = useState<"unread" | "read" | "manage">(
    "unread",
  );
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<Announcement | null>(null);

  // Publish/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [formData, setFormData] = useState<Partial<Announcement>>({
    type: AnnouncementType.NOTIFICATION,
    scopeType: AnnouncementScope.ALL,
    priority: "M",
    content: "",
    isTop: 0,
  });

  // Read Stats Modal State
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [statsData, setStatsData] = useState<{
    readCount: number;
    readUsers: any[];
  } | null>(null);

  // Manage List State
  const [manageList, setManageList] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [searchTitle, setSearchTitle] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
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
      if (activeTab === "manage") {
        const result = await getManageList({
          title: searchTitle,
          type: filterType,
          status: filterStatus,
          page: currentPage,
          size: pageSize,
        });
        setManageList(result.list);
        setTotal(result.total);
      } else {
        const list = await getMyAnnouncements();
        setAnnouncements(Array.isArray(list) ? list : []);
      }
    } catch (e) {
      console.error("获取公告失败", e);
      if (activeTab === "manage") {
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
        // 触发自定义事件通知 MainLayout 更新未读数量
        window.dispatchEvent(new Event("announcementRead"));
      } catch (e) {
        console.error("标记已读失败", e);
      }
    }
  };

  const handlePublish = async () => {
    if (!formData.title || !formData.content) {
      toast.error("标题和内容不能为空");
      return;
    }
    try {
      // 将 datetime-local 格式的 expireTime 转为后端要求的 "yyyy-MM-dd HH:mm:ss"
      const submitData = {
        ...formData,
        expireTime: formData.expireTime
          ? toBackendDateString(formData.expireTime)
          : undefined,
      };
      if (modalMode === "create") {
        await publishAnnouncement(submitData);
        toast.success("发布成功");
      } else {
        await updateAnnouncement(submitData);
        toast.success("更新成功");
      }
      setIsModalOpen(false);
      resetForm();
      if (activeTab === "manage") fetchAnnouncements();
    } catch (e) {
      toast.error(modalMode === "create" ? "发布失败" : "更新失败");
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setModalMode("edit");
    setFormData(announcement);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这条公告吗？")) return;
    try {
      await deleteAnnouncement(id);
      toast.success("删除成功");
      fetchAnnouncements();
    } catch (e) {
      toast.error("删除失败");
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm("确定要撤销这条公告吗？")) return;
    try {
      await revokeAnnouncement(id);
      toast.success("撤销成功");
      fetchAnnouncements();
    } catch (e) {
      toast.error("撤销失败");
    }
  };

  const handleToggleTop = async (id: number) => {
    try {
      await toggleTop(id);
      toast.success("置顶状态已更新");
      fetchAnnouncements();
    } catch (e) {
      toast.error("操作失败");
    }
  };

  const handleViewStats = async (id: number) => {
    try {
      const stats = await getReadStats(id);
      setStatsData(stats);
      setIsStatsModalOpen(true);
    } catch (e) {
      toast.error("获取统计失败");
    }
  };

  const resetForm = () => {
    setFormData({
      type: AnnouncementType.NOTIFICATION,
      scopeType: AnnouncementScope.ALL,
      priority: "M",
      content: "",
      isTop: 0,
    });
    setModalMode("create");
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchAnnouncements();
  };

  const handleReset = () => {
    setSearchTitle("");
    setFilterType("");
    setFilterStatus("");
    setCurrentPage(1);
  };

  // Filter lists
  const displayList = announcements.filter((a) => {
    if (activeTab === "unread") return !a.isRead;
    if (activeTab === "read") return a.isRead;
    return true;
  });

  const unreadCount = announcements.filter((a) => !a.isRead).length;
  const readCount = announcements.filter((a) => a.isRead).length;
  const topCount = announcements.filter((a) => a.isTop === 1).length;
  const activeTabTitle =
    activeTab === "unread" ? "未读消息" : activeTab === "read" ? "历史消息" : "公告管理";
  const dateLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const canManage = user?.role === Role.ADMIN || user?.role === Role.HR;
  const announcementSummary =
    activeTab === "unread"
      ? unreadCount > 0
        ? `当前还有 ${unreadCount} 条未读公告，建议优先处理置顶或紧急消息。`
        : "当前没有未读公告，公告中心状态平稳。"
      : activeTab === "read"
        ? `这里集中归档你已经查看过的公告，方便后续追溯和再次确认。`
        : `发布、编辑、撤销、置顶和阅读统计都在这里统一管理。`;
  const focusItems = [
    { label: "当前视图", value: activeTabTitle, hint: activeTab === "manage" ? "维护公告全生命周期" : "查看公告阅读动态", tone: "bg-pink-50 text-pink-600" },
    { label: "未读公告", value: `${unreadCount} 条`, hint: "当前仍未阅读的公告数量", tone: "bg-rose-50 text-rose-600" },
    { label: "置顶公告", value: `${topCount} 条`, hint: "当前对首页和公告中心更重要的消息", tone: "bg-amber-50 text-amber-600" },
  ];
  const metricCards = [
    { label: "未读消息", value: unreadCount, desc: "需要优先查看", icon: <Bell size={20} />, iconClass: "bg-pink-50 text-pink-600", ringClass: "ring-pink-100" },
    { label: "历史消息", value: readCount, desc: "已完成阅读", icon: <Eye size={20} />, iconClass: "bg-slate-100 text-slate-600", ringClass: "ring-slate-200" },
    { label: "置顶公告", value: topCount, desc: "重点消息总数", icon: <Pin size={20} />, iconClass: "bg-amber-50 text-amber-600", ringClass: "ring-amber-100" },
    { label: "管理总量", value: activeTab === "manage" ? total : announcements.length, desc: "当前统计口径下的公告数量", icon: <Megaphone size={20} />, iconClass: "bg-rose-50 text-rose-600", ringClass: "ring-rose-100" },
  ];

  const getTypeIcon = (type: AnnouncementType) => {
    switch (type) {
      case AnnouncementType.NOTIFICATION:
        return <Bell size={18} className="text-pink-400" />;
      case AnnouncementType.ANNOUNCEMENT:
        return <Megaphone size={18} className="text-pink-400" />;
      case AnnouncementType.URGENT:
        return <AlertCircle size={18} className="text-red-500" />;
      default:
        return <Bell size={18} />;
    }
  };

  const getPriorityBadge = (p: string) => {
    if (p === "H")
      return (
        <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded">
          紧急
        </span>
      );
    if (p === "L")
      return (
        <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded">
          低
        </span>
      );
    return null;
  };

  const getStatusBadge = (status: string) => {
    if (status === "0")
      return (
        <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded">
          草稿
        </span>
      );
    if (status === "1")
      return (
        <span className="bg-green-100 text-green-600 text-xs px-2 py-0.5 rounded">
          已发布
        </span>
      );
    if (status === "2")
      return (
        <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded">
          已撤销
        </span>
      );
    return null;
  };

  if (!user) return null;

  return (
    <div className="relative min-h-screen pb-6">
      <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden">
        <div className="absolute left-[-10%] top-[-8%] h-[32rem] w-[32rem] rounded-full bg-pink-300/18 blur-[120px]" />
        <div className="absolute right-[-12%] top-[12%] h-[38rem] w-[38rem] rounded-full bg-rose-200/20 blur-[140px]" />
        <div className="absolute bottom-[-12%] left-[18%] h-[26rem] w-[26rem] rounded-full bg-amber-100/45 blur-[110px]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.55),rgba(255,255,255,0.8))]" />
      </div>

      <div className="relative z-10 space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
          <Card className="overflow-hidden rounded-[34px] border-white/80 bg-white/78 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur-xl">
            <div className="relative p-7 sm:p-8">
              <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_55%)]" />
              <div className="absolute -right-16 top-8 h-48 w-48 rounded-full bg-pink-200/30 blur-3xl" />
              <div className="absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-amber-100/55 blur-2xl" />

              <div className="relative">
                <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                  <span className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-pink-600 ring-1 ring-pink-100">
                    <Calendar size={14} />
                    {dateLabel}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{timeLabel}</span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{activeTabTitle}</span>
                </div>

                <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-600 ring-1 ring-pink-100">
                      <Megaphone size={14} />
                      Announcement Workspace
                    </div>
                    <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950 sm:text-[2.85rem]">公告中心</h1>
                    <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">{announcementSummary}</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {canManage && (
                      <Button
                        className="h-12 rounded-2xl bg-pink-500 px-6 text-white shadow-[0_16px_32px_rgba(236,72,153,0.24)] hover:bg-pink-600"
                        onClick={() => {
                          resetForm();
                          setIsModalOpen(true);
                        }}
                      >
                        <Plus size={16} className="mr-2" />
                        发布公告
                      </Button>
                    )}
                    {canManage && (
                      <Button variant="outline" className="h-12 rounded-2xl bg-white/85 px-6" onClick={() => setActiveTab("manage")}>
                        <Shield size={16} className="mr-2 text-pink-500" />
                        公告管理
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">未读公告</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{unreadCount}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">当前还没有阅读的公告数量</div>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">历史消息</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{readCount}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">已经阅读过的公告消息</div>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">置顶公告</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{topCount}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">当前优先展示的重要公告数量</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="rounded-[34px] border-white/80 bg-white/82 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.04)] backdrop-blur-xl">
            <SectionHeader eyebrow="今日焦点" title="今天先看这些" />
            <div className="mt-5 space-y-3">
              {focusItems.map(item => (
                <div key={item.label} className="flex items-start gap-3 rounded-[24px] border border-slate-100 bg-white px-4 py-4">
                  <div className={`rounded-2xl p-3 ${item.tone}`}>
                    <Bell size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                      <div className="text-xs font-semibold text-slate-400">{item.value}</div>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {metricCards.map(card => (
            <div key={card.label}>
              <Card className={`rounded-[28px] border-white/80 bg-white/78 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)] backdrop-blur-xl ring-1 ${card.ringClass}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-500">{card.label}</div>
                    <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{card.value}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-400">{card.desc}</div>
                  </div>
                  <div className={`rounded-2xl p-3 ${card.iconClass}`}>{card.icon}</div>
                </div>
              </Card>
            </div>
          ))}
        </div>

        <Card className="rounded-[32px] border-white/80 bg-white/78 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="flex flex-col gap-5">
            <div className="rounded-[28px] border border-slate-100 bg-gradient-to-r from-white via-pink-50/35 to-white p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <SectionHeader eyebrow="公告工作区" title={activeTabTitle} />
                  <div className="mt-2 text-sm leading-6 text-slate-500">
                    {activeTab === "manage"
                      ? "集中处理公告发布、编辑、撤销、置顶和阅读统计。"
                      : "按未读和历史消息查看公告内容，及时掌握团队通知与全员公告。"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  <div className="inline-flex h-11 items-center rounded-2xl bg-slate-100 p-1">
                    <button type="button" onClick={() => setActiveTab("unread")} className={`relative flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === "unread" ? "bg-white text-pink-600 shadow-[0_8px_20px_rgba(15,23,42,0.08)]" : "text-slate-500 hover:text-slate-700"}`}>
                      未读消息
                      {unreadCount > 0 && <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">{unreadCount}</span>}
                    </button>
                    <button type="button" onClick={() => setActiveTab("read")} className={`flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === "read" ? "bg-white text-pink-600 shadow-[0_8px_20px_rgba(15,23,42,0.08)]" : "text-slate-500 hover:text-slate-700"}`}>
                      历史消息
                    </button>
                    {canManage && (
                      <button type="button" onClick={() => setActiveTab("manage")} className={`flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === "manage" ? "bg-white text-pink-600 shadow-[0_8px_20px_rgba(15,23,42,0.08)]" : "text-slate-500 hover:text-slate-700"}`}>
                        公告管理
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {activeTab === "manage" ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-[24px] border border-slate-100 bg-white/85 p-4 shadow-sm">
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto_auto]">
                    <Input type="text" placeholder="搜索标题..." value={searchTitle} onChange={(e) => setSearchTitle(e.target.value)} className="h-12 rounded-2xl" />
                    <Select value={filterType} onValueChange={(v) => setFilterType(v)}>
                      <SelectTrigger className="h-12 rounded-2xl">
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">所有类型</SelectItem>
                        <SelectItem value="1">通知</SelectItem>
                        <SelectItem value="2">公告</SelectItem>
                        <SelectItem value="3">紧急</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v)}>
                      <SelectTrigger className="h-12 rounded-2xl">
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">所有状态</SelectItem>
                        <SelectItem value="0">草稿</SelectItem>
                        <SelectItem value="1">已发布</SelectItem>
                        <SelectItem value="2">已撤销</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={handleSearch} className="h-12 rounded-2xl bg-pink-500 text-white hover:bg-pink-600">
                      <Search size={16} className="mr-2" />
                      搜索
                    </Button>
                    <Button variant="outline" onClick={handleReset} className="h-12 rounded-2xl">
                      <RotateCcw size={16} className="mr-2" />
                      重置
                    </Button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
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
                        {manageList.map((item) => (
                          <tr key={item.announcementId} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3 w-[30%]">
                              <div className="flex min-w-0 items-center gap-2">
                                {item.isTop === 1 && <Pin size={14} className="text-red-500" />}
                                <span className="min-w-0 truncate text-sm text-slate-900">{item.title}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3"><div className="flex items-center gap-1">{getTypeIcon(item.type)}</div></td>
                            <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                            <td className="px-4 py-3">{getPriorityBadge(item.priority)}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => handleViewStats(item.announcementId)} className="flex items-center gap-1 text-sm text-pink-500 hover:text-pink-700">
                                <Users size={14} />
                                查看
                              </button>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">{item.publishTime ? new Date(item.publishTime).toLocaleString() : "-"}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <TableRowActions
                                align="end"
                                wrap={false}
                                className="whitespace-nowrap"
                                actions={[
                                  { label: "查看", icon: <Eye size={16} />, onClick: () => handleRead(item), tone: "info" },
                                  { label: "编辑", icon: <Edit size={16} />, onClick: () => handleEdit(item), tone: "success" },
                                  { label: item.isTop === 1 ? "取消置顶" : "置顶", icon: <Pin size={16} />, onClick: () => handleToggleTop(item.announcementId), tone: item.isTop === 1 ? "danger" : "neutral" },
                                  { label: "撤销", icon: <X size={16} />, onClick: () => handleRevoke(item.announcementId), tone: "warning", hidden: item.status !== "1" },
                                  { label: "删除", icon: <Trash2 size={16} />, onClick: () => handleDelete(item.announcementId), tone: "danger" },
                                ]}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4">
                    <span className="text-sm text-slate-600">共 {total} 条</span>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="rounded-xl">上一页</Button>
                      <span className="px-3 py-2 text-sm text-slate-600">第 {currentPage} 页</span>
                      <Button variant="outline" onClick={() => setCurrentPage((p) => p + 1)} disabled={currentPage * pageSize >= total} className="rounded-xl">下一页</Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {displayList.length === 0 ? (
                  <EmptyPanel icon={<Bell size={26} />} title="暂无相关消息" description="新公告发布后会在这里展示，未读消息会优先标识。" />
                ) : (
                  <div className="space-y-3">
                    {displayList.map((item) => (
                      <button
                        key={item.announcementId}
                        onClick={() => handleRead(item)}
                        className={`flex w-full items-start gap-4 rounded-[24px] border px-4 py-4 text-left transition ${!item.isRead ? "border-pink-100 bg-pink-50/25 hover:bg-pink-50/40" : "border-slate-100 bg-white hover:bg-slate-50/70"}`}
                      >
                        <div className="mt-1 shrink-0">{getTypeIcon(item.type)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            {item.isTop === 1 && <Pin size={14} className="text-red-500" />}
                            {getPriorityBadge(item.priority)}
                            <h3 className={`truncate text-sm ${!item.isRead ? "font-bold text-slate-900" : "font-medium text-slate-600"}`}>{item.title}</h3>
                            <span className="ml-auto shrink-0 text-xs text-slate-400">{new Date(item.createTime).toLocaleString()}</span>
                          </div>
                          <p
                            className="line-clamp-2 text-xs text-slate-500"
                            dangerouslySetInnerHTML={{
                              __html: item.content.replace(/<[^>]+>/g, "").substring(0, 100),
                            }}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="relative border-b border-slate-100 px-6 pb-5 pt-6">
              <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
              <div className="relative flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {selectedAnnouncement.isTop === 1 && (
                    <Pin size={14} className="text-red-500" />
                  )}
                  {getPriorityBadge(selectedAnnouncement.priority)}
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                    {selectedAnnouncement.scopeType === "ALL" ? "全员" : "定向"}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-800">
                  {selectedAnnouncement.title}
                </h3>
                <div className="text-xs text-slate-400 mt-2 space-y-1">
                  <p>
                    发布时间:{" "}
                    {selectedAnnouncement.publishTime
                      ? new Date(
                          selectedAnnouncement.publishTime,
                        ).toLocaleString()
                      : new Date(
                          selectedAnnouncement.createTime,
                        ).toLocaleString()}
                  </p>
                  {selectedAnnouncement.expireTime && (
                    <p>
                      有效期至:{" "}
                      {new Date(
                        selectedAnnouncement.expireTime,
                      ).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedAnnouncement(null)} className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </Button>
            </div>
            </div>
            <div className="p-6 overflow-y-auto prose prose-sm max-w-none text-slate-600">
              <div
                dangerouslySetInnerHTML={{
                  __html: selectedAnnouncement.content,
                }}
              />
            </div>
            <div className="flex justify-end border-t border-slate-100 bg-slate-50/80 px-6 py-5">
              <Button onClick={() => setSelectedAnnouncement(null)} className="rounded-2xl bg-pink-500 text-white hover:bg-pink-600">
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="relative border-b border-slate-100 px-6 pb-5 pt-6">
              <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
              <div className="relative">
              <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                {modalMode === "create" ? "发布新公告" : "编辑公告"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">填写标题、类型、优先级、范围和正文内容，完成一次完整的公告发布或更新。</p>
              </div>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  标题
                </label>
                <Input
                  type="text"
                  className="h-12 rounded-2xl"
                  value={formData.title || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="请输入公告标题"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    类型
                  </label>
                  <Select
                    value={String(formData.type)}
                    onValueChange={(v) =>
                      setFormData({ ...formData, type: v as AnnouncementType })
                    }
                  >
                    <SelectTrigger className="h-12 rounded-2xl">
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={String(AnnouncementType.NOTIFICATION)}>
                        通知
                      </SelectItem>
                      <SelectItem value={String(AnnouncementType.ANNOUNCEMENT)}>
                        公告
                      </SelectItem>
                      <SelectItem value={String(AnnouncementType.URGENT)}>
                        紧急
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    优先级
                  </label>
                  <Select
                    value={String(formData.priority)}
                    onValueChange={(v) =>
                      setFormData({
                        ...formData,
                        priority: v as "M" | "L" | "H",
                      })
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    发布范围
                  </label>
                  <Select
                    value={String(formData.scopeType)}
                    onValueChange={(v) =>
                      setFormData({
                        ...formData,
                        scopeType: v as AnnouncementScope,
                        scopeValue: "",
                      })
                    }
                  >
                    <SelectTrigger className="h-12 rounded-2xl">
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={String(AnnouncementScope.ALL)}>
                        全员
                      </SelectItem>
                      <SelectItem value={String(AnnouncementScope.DEPT)}>
                        部门
                      </SelectItem>
                      <SelectItem value={String(AnnouncementScope.ROLE)}>
                        角色
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(formData.scopeType === AnnouncementScope.DEPT ||
                formData.scopeType === AnnouncementScope.ROLE) && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {formData.scopeType === AnnouncementScope.DEPT
                      ? "选择部门"
                      : "选择角色"}
                  </label>
                  {formData.scopeType === AnnouncementScope.DEPT ? (
                    <DeptTreePicker
                      value={formData.scopeValue || ""}
                      onChange={(v) =>
                        setFormData({ ...formData, scopeValue: v })
                      }
                      deptTree={deptTree}
                    />
                  ) : (
                    <RoleListPicker
                      value={formData.scopeValue || ""}
                      onChange={(v) =>
                        setFormData({ ...formData, scopeValue: v })
                      }
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    过期时间（可选）
                  </label>
                  <DatePicker
                    type="datetime-local"
                    value={
                      formData.expireTime
                        ? new Date(formData.expireTime)
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        expireTime: e.target.value || undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    置顶
                  </label>
                    <div className="flex items-center h-12 rounded-2xl border border-slate-200 bg-white px-4">
                    <input
                      type="checkbox"
                      checked={formData.isTop === 1}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isTop: e.target.checked ? 1 : 0,
                        })
                      }
                      className="w-4 h-4 text-pink-500 border-slate-300 rounded focus:ring-pink-400"
                    />
                    <label className="ml-2 text-sm text-slate-700">
                      设为置顶
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  内容 (支持 HTML)
                </label>
                <Textarea
                  className="h-40 rounded-2xl font-mono text-sm"
                  value={formData.content || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  placeholder="请输入公告内容，支持 HTML 格式"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-5">
              <Button
                variant="outline"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
              >
                取消
              </Button>
              <Button
                onClick={handlePublish}
                className="rounded-2xl bg-pink-500 text-white hover:bg-pink-600"
              >
                {modalMode === "create" ? "发布" : "保存"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isStatsModalOpen && statsData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="relative border-b border-slate-100 px-6 pb-5 pt-6">
              <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
              <div className="relative flex items-center justify-between">
                <h3 className="text-2xl font-bold tracking-tight text-slate-900">阅读统计</h3>
                <Button variant="ghost" size="icon" onClick={() => setIsStatsModalOpen(false)} className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X size={18} />
                </Button>
              </div>
            </div>
            <div className="p-6">
              <div className="text-center mb-4">
                <div className="text-3xl font-bold text-pink-500">
                  {statsData.readCount}
                </div>
                <div className="text-sm text-slate-500">已读人数</div>
              </div>
              {statsData.readUsers.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">
                    已读用户列表
                  </h4>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {statsData.readUsers.map((user: any, idx: number) => (
                      <div
                        key={idx}
                        className="text-xs text-slate-600 flex justify-between"
                      >
                        <span>用户 ID: {user.userId}</span>
                        <span>{new Date(user.readTime).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-slate-100 bg-slate-50/80 px-6 py-5">
              <Button onClick={() => setIsStatsModalOpen(false)} className="rounded-2xl bg-pink-500 text-white hover:bg-pink-600">
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
