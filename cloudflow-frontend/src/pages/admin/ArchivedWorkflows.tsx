import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  RotateCcw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
  FileText,
  ArrowLeft,
  Filter,
  X
} from 'lucide-react';
import { 
  getArchivedWorkflows,
  restoreWorkflows,
  permanentDeleteWorkflows,
  BatchOperationResult
} from '../../services/api/workflow';
import { toast } from 'sonner';
import { useWorkflowPermission } from '../../hooks/useWorkflowPermission';
import { PermissionGuard } from '../../components/ui/PermissionGuard';

/**
 * 归档流程数据接口
 */
interface ArchivedWorkflow {
  id: string;
  workflowId: string;
  workflowName: string;
  archivedBy: string;
  archivedByName?: string;
  archivedAt: string;
  archiveReason: string;
  canRestore: boolean;
}

/**
 * 归档流程管理组件（管理员页面）
 * 显示归档流程列表，支持搜索、恢复和永久删除
 * 仅管理员可访问
 */
export const ArchivedWorkflows: React.FC = () => {
  const navigate = useNavigate();
  
  // 权限控制
  const { isAdmin, canAccessArchiveManagement, canBatchRestore, canPermanentDelete } = useWorkflowPermission();

  // 如果不是管理员，显示无权限提示
  if (!isAdmin || !canAccessArchiveManagement) {
    return (
      <PermissionGuard permissions={[]} roles={[]} hidden={false}>
        <div />
      </PermissionGuard>
    );
  }
  
  // 归档流程列表
  const [workflows, setWorkflows] = useState<ArchivedWorkflow[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 搜索和筛选条件
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<{
    start: string;
    end: string;
  }>({ start: '', end: '' });
  const [showFilters, setShowFilters] = useState(false);
  
  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  
  // 选中的流程
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // 操作状态
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // 确认对话框
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[]>([]);

  /**
   * 加载归档流程列表
   */
  const loadArchivedWorkflows = async () => {
    setLoading(true);
    try {
      const params: any = {
        pageNum: currentPage,
        pageSize: pageSize,
      };
      
      if (searchTerm.trim()) {
        params.keyword = searchTerm.trim();
      }
      if (dateRange.start) {
        params.archivedAfter = dateRange.start;
      }
      if (dateRange.end) {
        params.archivedBefore = dateRange.end;
      }
      
      const response = await getArchivedWorkflows(params);
      
      if (response.code === 200) {
        setWorkflows(response.data.records || []);
        setTotal(response.data.total || 0);
      } else {
        toast.error(response.msg || '加载归档流程失败');
      }
    } catch (error) {
      console.error('加载归档流程失败:', error);
      toast.error('加载归档流程失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArchivedWorkflows();
  }, [currentPage, searchTerm, dateRange]);

  /**
   * 处理搜索
   */
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  /**
   * 应用日期筛选
   */
  const applyDateFilter = () => {
    setCurrentPage(1);
    setShowFilters(false);
    loadArchivedWorkflows();
  };

  /**
   * 清除筛选条件
   */
  const clearFilters = () => {
    setDateRange({ start: '', end: '' });
    setSearchTerm('');
    setCurrentPage(1);
  };

  /**
   * 全选/取消全选
   */
  const handleSelectAll = () => {
    if (selectedIds.length === workflows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(workflows.map(w => w.workflowId));
    }
  };

  /**
   * 选择单个流程
   */
  const handleSelectOne = (workflowId: string) => {
    if (selectedIds.includes(workflowId)) {
      setSelectedIds(selectedIds.filter(id => id !== workflowId));
    } else {
      setSelectedIds([...selectedIds, workflowId]);
    }
  };

  /**
   * 恢复归档流程
   */
  const handleRestore = async (workflowIds: string[]) => {
    if (workflowIds.length === 0) {
      toast.error('请选择要恢复的流程');
      return;
    }

    setRestoring(true);
    try {
      const result: BatchOperationResult = await restoreWorkflows(workflowIds);
      
      if (result.successCount > 0) {
        toast.success(`成功恢复 ${result.successCount} 个流程`);
        setSelectedIds([]);
        loadArchivedWorkflows();
      }
      
      if (result.failedCount > 0) {
        toast.error(`${result.failedCount} 个流程恢复失败`);
      }
    } catch (error: any) {
      console.error('恢复流程失败:', error);
      toast.error(error.message || '恢复流程失败');
    } finally {
      setRestoring(false);
    }
  };

  /**
   * 显示永久删除确认对话框
   */
  const showDeleteDialog = (workflowIds: string[]) => {
    if (workflowIds.length === 0) {
      toast.error('请选择要删除的流程');
      return;
    }
    setDeleteTarget(workflowIds);
    setShowDeleteConfirm(true);
  };

  /**
   * 永久删除流程
   */
  const handlePermanentDelete = async () => {
    if (deleteTarget.length === 0) return;

    setDeleting(true);
    try {
      const result: BatchOperationResult = await permanentDeleteWorkflows(deleteTarget);
      
      if (result.successCount > 0) {
        toast.success(`成功删除 ${result.successCount} 个流程`);
        setSelectedIds([]);
        setShowDeleteConfirm(false);
        setDeleteTarget([]);
        loadArchivedWorkflows();
      }
      
      if (result.failedCount > 0) {
        toast.error(`${result.failedCount} 个流程删除失败`);
      }
    } catch (error: any) {
      console.error('删除流程失败:', error);
      toast.error(error.message || '删除流程失败');
    } finally {
      setDeleting(false);
    }
  };

  /**
   * 格式化日期时间
   */
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6 p-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="返回管理后台"
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">归档流程管理</h2>
            <p className="text-slate-500 mt-1 text-sm">查看和管理已归档的流程，支持恢复或永久删除</p>
          </div>
        </div>
      </div>

      {/* 搜索和筛选工具栏 */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          {/* 搜索框 */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索流程名称或归档原因..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>

          {/* 筛选按钮 */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
              showFilters || dateRange.start || dateRange.end
                ? 'bg-pink-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Filter size={16} />
            筛选
          </button>

          {/* 清除筛选 */}
          {(searchTerm || dateRange.start || dateRange.end) && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-all flex items-center gap-2"
            >
              <X size={16} />
              清除
            </button>
          )}
        </div>

        {/* 日期筛选面板 */}
        {showFilters && (
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  归档开始日期
                </label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  归档结束日期
                </label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={applyDateFilter}
                className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all"
              >
                应用筛选
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 批量操作工具栏 */}
      {selectedIds.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-700">
            <CheckCircle2 size={20} />
            <span className="font-medium">已选中 {selectedIds.length} 个流程</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRestore(selectedIds)}
              disabled={restoring || !canBatchRestore}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all flex items-center gap-2 disabled:opacity-50"
              title={!canBatchRestore ? '仅管理员可批量恢复' : '批量恢复选中的流程'}
            >
              <RotateCcw size={16} />
              批量恢复
            </button>
            <button
              onClick={() => showDeleteDialog(selectedIds)}
              disabled={deleting || !canPermanentDelete}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all flex items-center gap-2 disabled:opacity-50"
              title={!canPermanentDelete ? '仅管理员可永久删除' : '永久删除选中的流程'}
            >
              <Trash2 size={16} />
              批量删除
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-all"
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      {/* 归档流程列表 */}
      {loading ? (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-pink-500 border-t-transparent"></div>
          <p className="text-slate-500 mt-4">加载中...</p>
        </div>
      ) : workflows.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <FileText size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500">暂无归档流程</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* 列表头部 */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-4">
              <input
                type="checkbox"
                checked={selectedIds.length === workflows.length && workflows.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 text-pink-500 rounded focus:ring-pink-500"
              />
              <span className="text-sm text-slate-600">
                共 <span className="font-bold text-slate-800">{total}</span> 个归档流程
              </span>
            </div>
          </div>

          {/* 列表内容 */}
          <div className="divide-y divide-slate-200">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className={`p-4 hover:bg-slate-50 transition-colors ${
                  selectedIds.includes(workflow.workflowId) ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* 复选框 */}
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(workflow.workflowId)}
                    onChange={() => handleSelectOne(workflow.workflowId)}
                    className="mt-1 w-4 h-4 text-pink-500 rounded focus:ring-pink-500"
                  />

                  {/* 流程信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-base font-semibold text-slate-800 truncate">
                        {workflow.workflowName}
                      </h3>
                      {!workflow.canRestore && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded">
                          不可恢复
                        </span>
                      )}
                    </div>

                    {/* 归档信息 */}
                    <div className="grid grid-cols-3 gap-4 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400" />
                        <span>归档时间: {formatDateTime(workflow.archivedAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-slate-400" />
                        <span>操作人: {workflow.archivedByName || workflow.archivedBy}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-slate-400" />
                        <span className="truncate" title={workflow.archiveReason}>
                          原因: {workflow.archiveReason}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestore([workflow.workflowId])}
                      disabled={!workflow.canRestore || restoring || !canBatchRestore}
                      className="px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all flex items-center gap-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      title={!canBatchRestore ? '仅管理员可恢复流程' : workflow.canRestore ? '恢复流程' : '此流程不可恢复'}
                    >
                      <RotateCcw size={14} />
                      恢复
                    </button>
                    <button
                      onClick={() => showDeleteDialog([workflow.workflowId])}
                      disabled={deleting || !canPermanentDelete}
                      className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all flex items-center gap-1 text-sm disabled:opacity-50"
                      title={!canPermanentDelete ? '仅管理员可永久删除' : '永久删除'}
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 分页 */}
          {total > pageSize && (
            <div className="flex items-center justify-between p-4 border-t border-slate-200 bg-slate-50">
              <div className="text-sm text-slate-600">
                显示 {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, total)} 条，共 {total} 条
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上一页
                </button>
                <span className="px-4 py-2 text-sm text-slate-600">
                  第 {currentPage} / {Math.ceil(total / pageSize)} 页
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(total / pageSize), p + 1))}
                  disabled={currentPage >= Math.ceil(total / pageSize)}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 永久删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle size={24} className="text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">确认永久删除</h3>
            </div>
            
            <div className="space-y-3 mb-6">
              <p className="text-slate-600">
                您即将永久删除 <span className="font-bold text-red-600">{deleteTarget.length}</span> 个流程。
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700 font-medium text-sm flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>
                    警告：此操作将永久删除流程的所有数据，包括版本历史和关联记录。
                    <strong className="block mt-1">此操作不可恢复！</strong>
                  </span>
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteTarget([]);
                }}
                disabled={deleting}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handlePermanentDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    删除中...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    确认删除
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchivedWorkflows;
