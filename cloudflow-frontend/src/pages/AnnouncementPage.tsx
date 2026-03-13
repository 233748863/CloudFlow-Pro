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
  DatePicker,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { TableRowActions } from "@/components/ui/table-row-actions";
import { getDeptTree, getRoleList } from "../services/api/auth";

interface DeptItem {
  deptId: number;
  parentId: number;
  deptName: string;
  orderNum: number;
  children?: DeptItem[];
}

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
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      {selectedDepts.length > 0 && (
        <div className="p-2 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-wrap gap-1">
            {selectedDepts.map((d) => (
              <span
                key={d.deptId}
                className="inline-flex items-center gap-1 bg-pink-50 text-pink-600 px-2 py-0.5 rounded-full text-xs"
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
      <div className="p-2 border-b border-slate-100">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-2 text-slate-400"
          />
          <input
            type="text"
            className="w-full pl-8 py-1.5 text-sm border-none focus:ring-0 bg-transparent outline-none"
            placeholder="搜索部门..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-1">
        {deptTree.length === 0 ? (
          <div className="p-4 text-sm text-slate-400 text-center">
            暂无部门数据
          </div>
        ) : (
          deptTree.map((node) => renderDeptNode(node, 0))
        )}
      </div>
      <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
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
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      {selectedRoles.length > 0 && (
        <div className="p-2 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-wrap gap-1">
            {selectedRoles.map((r) => {
              const id = getRoleIdentifier(r);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 bg-pink-50 text-pink-600 px-2 py-0.5 rounded-full text-xs"
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
      <div className="p-2 border-b border-slate-100">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-2 text-slate-400"
          />
          <input
            type="text"
            className="w-full pl-8 py-1.5 text-sm border-none focus:ring-0 bg-transparent outline-none"
            placeholder="搜索角色..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-1">
        {roles.length === 0 ? (
          <div className="p-4 text-sm text-slate-400 text-center">
            加载中或暂无角色数据
          </div>
        ) : filteredRoles.length === 0 ? (
          <div className="p-4 text-sm text-slate-400 text-center">
            未找到匹配的角色
          </div>
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
      <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Megaphone className="text-pink-500" />
          公告中心
        </h2>

        {(user.role === Role.ADMIN || user.role === Role.HR) && (
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 transition-colors"
          >
            <Plus size={18} />
            发布公告
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px] flex flex-col">
        <div className="flex border-b border-slate-200 pt-2 overflow-visible relative z-10">
          <button
            onClick={() => setActiveTab("unread")}
            className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 relative ${activeTab === "unread" ? "border-pink-500 text-pink-500" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            未读消息
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("read")}
            className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 ${activeTab === "read" ? "border-pink-500 text-pink-500" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            历史消息
          </button>
          {(user.role === Role.ADMIN || user.role === Role.HR) && (
            <button
              onClick={() => setActiveTab("manage")}
              className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 ${activeTab === "manage" ? "border-pink-500 text-pink-500" : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              公告管理
            </button>
          )}
        </div>

        {activeTab === "manage" ? (
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="搜索标题..."
                  value={searchTitle}
                  onChange={(e) => setSearchTitle(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-400 focus:outline-none"
                />
                <Select
                  value={filterType}
                  onValueChange={(v) => setFilterType(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">所有类型</SelectItem>
                    <SelectItem value="1">通知</SelectItem>
                    <SelectItem value="2">公告</SelectItem>
                    <SelectItem value="3">紧急</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={filterStatus}
                  onValueChange={(v) => setFilterStatus(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">所有状态</SelectItem>
                    <SelectItem value="0">草稿</SelectItem>
                    <SelectItem value="1">已发布</SelectItem>
                    <SelectItem value="2">已撤销</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={handleSearch}
                  className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 text-sm"
                >
                  <Search size={16} />
                  搜索
                </button>
                <button
                  onClick={handleReset}
                  className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 text-sm"
                >
                  <RotateCcw size={16} />
                  重置
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {/* 公告管理动作较多，给操作列更宽的固定宽度，保持统一文字按钮风格。 */}
              <table className="min-w-[1360px] w-full">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase w-[30%]">
                      标题
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      类型
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      状态
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      优先级
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                      已读人数
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase w-44">
                      发布时间
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase w-[360px]">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {manageList.map((item) => (
                    <tr key={item.announcementId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 w-[30%]">
                        <div className="flex min-w-0 items-center gap-2">
                          {item.isTop === 1 && (
                            <Pin size={14} className="text-red-500" />
                          )}
                          <span className="min-w-0 truncate text-sm text-slate-900">
                            {item.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {getTypeIcon(item.type)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(item.status)}
                      </td>
                      <td className="px-4 py-3">
                        {getPriorityBadge(item.priority)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleViewStats(item.announcementId)}
                          className="text-pink-500 hover:text-pink-700 text-sm flex items-center gap-1"
                        >
                          <Users size={14} />
                          查看
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                        {item.publishTime
                          ? new Date(item.publishTime).toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <TableRowActions
                          align="end"
                          wrap={false}
                          className="whitespace-nowrap"
                          actions={[
                            {
                              label: "查看",
                              icon: <Eye size={16} />,
                              onClick: () => handleRead(item),
                              tone: "info",
                            },
                            {
                              label: "编辑",
                              icon: <Edit size={16} />,
                              onClick: () => handleEdit(item),
                              tone: "success",
                            },
                            {
                              label: item.isTop === 1 ? "取消置顶" : "置顶",
                              icon: <Pin size={16} />,
                              onClick: () => handleToggleTop(item.announcementId),
                              tone: item.isTop === 1 ? "danger" : "neutral",
                            },
                            {
                              label: "撤销",
                              icon: <X size={16} />,
                              onClick: () => handleRevoke(item.announcementId),
                              tone: "warning",
                              hidden: item.status !== "1",
                            },
                            {
                              label: "删除",
                              icon: <Trash2 size={16} />,
                              onClick: () => handleDelete(item.announcementId),
                              tone: "danger",
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-slate-200 flex justify-between items-center">
              <span className="text-sm text-slate-600">共 {total} 条</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
                >
                  上一页
                </button>
                <span className="px-3 py-1 text-sm">第 {currentPage} 页</span>
                <button
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={currentPage * pageSize >= total}
                  className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {displayList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Bell size={48} className="mb-4 opacity-20" />
                <p>暂无相关消息</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {displayList.map((item) => (
                  <div
                    key={item.announcementId}
                    onClick={() => handleRead(item)}
                    className={`p-4 hover:bg-slate-50 cursor-pointer transition-colors flex gap-4 items-start group ${!item.isRead ? "bg-pink-50/30" : ""}`}
                  >
                    <div className="mt-1 flex-shrink-0">
                      {getTypeIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {item.isTop === 1 && (
                          <Pin size={14} className="text-red-500" />
                        )}
                        {getPriorityBadge(item.priority)}
                        <h3
                          className={`text-sm font-medium truncate ${!item.isRead ? "text-slate-900 font-bold" : "text-slate-600"}`}
                        >
                          {item.title}
                        </h3>
                        <span className="text-xs text-slate-400 ml-auto flex-shrink-0">
                          {new Date(item.createTime).toLocaleString()}
                        </span>
                      </div>
                      <p
                        className="text-xs text-slate-500 line-clamp-2"
                        dangerouslySetInnerHTML={{
                          __html: item.content
                            .replace(/<[^>]+>/g, "")
                            .substring(0, 100),
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedAnnouncement && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start">
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
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto prose prose-sm max-w-none text-slate-600">
              <div
                dangerouslySetInnerHTML={{
                  __html: selectedAnnouncement.content,
                }}
              />
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end">
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="bg-pink-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-pink-600"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">
                {modalMode === "create" ? "发布新公告" : "编辑公告"}
              </h3>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  标题
                </label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-pink-400 focus:outline-none"
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
                    <SelectTrigger>
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
                    <SelectTrigger>
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
                    <SelectTrigger>
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
                  <div className="flex items-center h-10">
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
                <textarea
                  className="w-full border border-slate-300 rounded-lg p-2 h-32 font-mono text-sm"
                  value={formData.content || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  placeholder="请输入公告内容，支持 HTML 格式"
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-300"
              >
                取消
              </button>
              <button
                onClick={handlePublish}
                className="bg-pink-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-pink-600"
              >
                {modalMode === "create" ? "发布" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isStatsModalOpen && statsData && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">阅读统计</h3>
              <button
                onClick={() => setIsStatsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="text-2xl">&times;</span>
              </button>
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
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end">
              <button
                onClick={() => setIsStatsModalOpen(false)}
                className="bg-pink-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-pink-600"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
