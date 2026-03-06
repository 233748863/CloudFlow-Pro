import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  FolderOpen, 
  Tag, 
  Edit, 
  Trash2, 
  Archive, 
  CheckSquare, 
  Square,
  X,
  Save,
  RefreshCw,
  Download,
  FileDown,
  Upload
} from 'lucide-react';
import { WorkflowDefinition as BaseWorkflowDefinition } from '../../types';
import { 
  getProcessDefinitions, 
  saveProcessDefinition, 
  deployProcessDefinition,
  exportWorkflow, 
  exportWorkflows,
  archiveWorkflows,
  checkOperationSafety 
} from '../../services/api/workflow';
import { toast } from 'sonner';
import { convertGraphToWorkflowTree, convertWorkflowTreeToGraph, parseWorkflowGraphDefinition } from '../../utils/workflowGraph';
import { useWorkflowPermission } from '../../hooks/useWorkflowPermission';

// 扩展 WorkflowDefinition 类型，tags 解析为数组
interface WorkflowDefinition extends Omit<BaseWorkflowDefinition, 'tags'> {
  tags: string[]; // 已解析的标签数组
  tagsRaw?: string; // 后端原始标签串（用于避免批量编辑时覆盖异常数据）
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  workflowCreatorId: string; // 流程创建者ID（用于权限判断）
}

/**
 * 流程管理页面 - 支持批量编辑分类和标签
 * 管理员专用页面
 * 权限控制：
 * - 批量导出：仅管理员
 * - 批量归档：仅管理员
 * - 单个流程导出：流程创建者或管理员
 */
export const ProcessManagement = () => {
  const navigate = useNavigate();
  
  // 权限控制
  const { 
    isAdmin, 
    canExportBatch, 
    canBatchArchive,
    canExportOwn 
  } = useWorkflowPermission();
  
  // 流程列表数据
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 筛选条件
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // 批量选择
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // 批量编辑模态框
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [batchEditType, setBatchEditType] = useState<'category' | 'tags'>('category');
  const [batchCategory, setBatchCategory] = useState('');
  const [batchTags, setBatchTags] = useState<string[]>([]);
  const [batchTagInput, setBatchTagInput] = useState('');

  // 导出功能状态
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState<'single' | 'batch'>('single');
  const [exportWorkflowId, setExportWorkflowId] = useState<string>('');
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 归档功能状态
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [safetyWarnings, setSafetyWarnings] = useState<string[]>([]);
  const [showSafetyWarning, setShowSafetyWarning] = useState(false);

  // 分类选项
  const CATEGORY_LABELS: Record<string, string> = {
    '': '全部',
    'office': '行政办公',
    'finance': '财务管理',
    'hr': '人事管理',
    'sales': '销售业务',
    'it': 'IT运维',
    'production': '生产制造',
    'quality': '质量管理',
    'project': '项目管理',
    'other': '其他',
  };

  // 常用标签
  const COMMON_TAGS = [
    '审批', '请假', '报销', '采购', '合同', '财务',
    '人事', '考勤', '加班', '出差', '资产', '车辆',
    '紧急', '重要', '常用'
  ];

  const parseTagsSafely = (
    rawTags: unknown,
    workflowName: string,
    onError: () => void
  ): string[] => {
    if (!rawTags) {
      return [];
    }

    if (Array.isArray(rawTags)) {
      return rawTags
        .map(tag => String(tag).trim())
        .filter(Boolean);
    }

    if (typeof rawTags === 'string') {
      const trimmed = rawTags.trim();
      if (!trimmed) {
        return [];
      }

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map(tag => String(tag).trim())
            .filter(Boolean);
        }
        onError();
        console.warn(`[ProcessManagement] tags 解析结果不是数组，流程: ${workflowName}`);
        return [];
      } catch (error) {
        // 兼容后端偶发返回的单标签纯文本
        if (!trimmed.startsWith('[')) {
          return [trimmed];
        }
        onError();
        console.warn(`[ProcessManagement] tags JSON 解析失败，流程: ${workflowName}`, error);
        return [];
      }
    }

    onError();
    console.warn(`[ProcessManagement] tags 字段类型不支持，流程: ${workflowName}`, rawTags);
    return [];
  };

  const parseNodesSafely = (
    rawModelJson: unknown,
    workflowName: string,
    onError: () => void
  ): BaseWorkflowDefinition['nodes'] | null => {
    if (!rawModelJson) {
      onError();
      console.warn(`[ProcessManagement] modelJson 为空，流程: ${workflowName}`);
      return null;
    }

    const graph = parseWorkflowGraphDefinition(rawModelJson);
    if (!graph) {
      onError();
      console.warn(`[ProcessManagement] modelJson 不是合法的 nodes+edges 图模型，流程: ${workflowName}`);
      return null;
    }

    return convertGraphToWorkflowTree(graph);
  };

  /**
   * 解析保存接口返回的 definitionId。
   * nodes+edges 重构后仅接受对象结构：{ id: string }。
   */
  const resolveSavedDefinitionId = (result: unknown): string => {
    if (result && typeof result === 'object') {
      const rawId = (result as { id?: unknown }).id;
      if (typeof rawId === 'string') {
        return rawId.trim();
      }
    }
    return '';
  };

  const canExportSingleWorkflow = (workflow: WorkflowDefinition): boolean => {
    if (isAdmin) {
      return true;
    }
    return !!workflow.workflowCreatorId && canExportOwn(workflow.workflowCreatorId);
  };

  // 加载流程列表
  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const res = await getProcessDefinitions();
      if (Array.isArray(res)) {
        let missingDefinitionIdCount = 0;
        let invalidTagsCount = 0;
        let invalidModelCount = 0;

        const mappedItems: Array<WorkflowDefinition | null> = res
          .map((w: any): WorkflowDefinition | null => {
            const definitionId = typeof w.definitionId === 'string' ? w.definitionId.trim() : '';
            if (!definitionId) {
              missingDefinitionIdCount += 1;
              console.warn('[ProcessManagement] 跳过缺少 definitionId 的流程记录:', w);
              return null;
            }

            const workflowName = (w.processName || w.name || definitionId) as string;
            const tagsRaw =
              typeof w.tags === 'string'
                ? w.tags
                : Array.isArray(w.tags)
                  ? JSON.stringify(w.tags)
                  : undefined;
            const parsedNodes = parseNodesSafely(w.modelJson, workflowName, () => {
              invalidModelCount += 1;
            });
            if (!parsedNodes) {
              return null;
            }
            return {
              id: definitionId,
              name: workflowName,
              key: w.processKey || w.key || '',
              version: w.version,
              formId: w.formId,
              startPermissionType: w.startPermissionType,
              startPermissionValue: w.startPermissionValue,
              deptId:
                typeof w.deptId === 'number'
                  ? w.deptId
                  : typeof w.deptId === 'string' && w.deptId.trim() !== '' && Number.isFinite(Number(w.deptId))
                    ? Number(w.deptId)
                    : undefined,
              status: w.status,
              category: w.category || '',
              tags: parseTagsSafely(w.tags, workflowName, () => {
                invalidTagsCount += 1;
              }),
              tagsRaw,
              description: w.description || '',
              nodes: parsedNodes,
              workflowCreatorId: String(
                w.createBy ?? w.createdBy ?? w.creatorId ?? w.creator ?? ''
              )
            };
          });
        const mapped = mappedItems.filter((item): item is WorkflowDefinition => item !== null);

        setWorkflows(mapped);
        setSelectedIds(prev => prev.filter(id => mapped.some(wf => wf.id === id)));

        if (missingDefinitionIdCount > 0) {
          toast.warning(`有 ${missingDefinitionIdCount} 条流程缺少 definitionId，已自动跳过`);
        }
        if (invalidTagsCount > 0) {
          toast.warning(`有 ${invalidTagsCount} 条流程标签格式异常，已按空标签处理`);
        }
        if (invalidModelCount > 0) {
          toast.warning(`有 ${invalidModelCount} 条流程模型异常，已跳过加载`);
        }
      }
    } catch (error) {
      console.error('加载流程列表失败:', error);
      toast.error('加载流程列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  // 筛选逻辑
  const filteredWorkflows = workflows.filter(wf => {
    const matchesSearch = wf.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || wf.category === selectedCategory;
    const matchesTags = selectedTags.length === 0 || 
      selectedTags.some(tag => wf.tags.includes(tag));
    return matchesSearch && matchesCategory && matchesTags;
  });

  // 获取所有可用标签
  const allTags = Array.from(new Set(
    workflows.flatMap(wf => wf.tags)
  ));

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedIds.length === filteredWorkflows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredWorkflows.map(wf => wf.id));
    }
  };

  // 单选
  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // 打开批量编辑模态框
  const openBatchEdit = (type: 'category' | 'tags') => {
    if (!isAdmin) {
      toast.error('仅管理员可批量编辑流程');
      return;
    }

    if (selectedIds.length === 0) {
      toast.error('请先选择要编辑的流程');
      return;
    }
    setBatchEditType(type);
    setBatchCategory('');
    setBatchTags([]);
    setBatchTagInput('');
    setShowBatchEditModal(true);
  };

  // 批量修改分类
  const handleBatchUpdateCategory = async () => {
    if (!batchCategory) {
      toast.error('请选择分类');
      return;
    }

    setLoading(true);
    try {
      // 批量更新选中的流程
      const updatePromises = selectedIds.map(async (id) => {
        const workflow = workflows.find(wf => wf.id === id);
        if (!workflow) return;

        const saveResult = await saveProcessDefinition({
          definitionId: id,
          processName: workflow.name,
          processKey: workflow.key,
          modelJson: JSON.stringify(convertWorkflowTreeToGraph(workflow.nodes)),
          category: batchCategory,
          tags:
            workflow.tagsRaw !== undefined
              ? workflow.tagsRaw
              : workflow.tags.length > 0
                ? JSON.stringify(workflow.tags)
                : undefined,
          description: workflow.description,
          formId: workflow.formId,
          startPermissionType: workflow.startPermissionType,
          startPermissionValue: workflow.startPermissionValue,
          deptId: workflow.deptId,
        });

        // 原流程已发布时，分类变更后自动发布新版本，保持发起页与管理页元数据一致
        if (workflow.status === 'PUBLISHED') {
          const nextDefinitionId = resolveSavedDefinitionId(saveResult);
          if (nextDefinitionId) {
            await deployProcessDefinition(nextDefinitionId);
          }
        }
      });

      const results = await Promise.allSettled(updatePromises);
      const successCount = results.filter(result => result.status === 'fulfilled').length;
      const failedIds = results
        .map((result, index) => ({ result, id: selectedIds[index] }))
        .filter(({ result }) => result.status === 'rejected')
        .map(({ id }) => id);

      if (successCount > 0) {
        toast.success(`成功修改 ${successCount} 个流程的分类`);
        setShowBatchEditModal(false);
        setSelectedIds([]);
        loadWorkflows(); // 重新加载列表
      }
      if (failedIds.length > 0) {
        console.error('批量修改分类失败的流程ID:', failedIds);
        toast.error(`${failedIds.length} 个流程修改分类失败，请重试`);
      }
    } catch (error) {
      console.error('批量修改分类失败:', error);
      toast.error('批量修改分类失败');
    } finally {
      setLoading(false);
    }
  };

  // 批量添加标签
  const handleBatchAddTags = async () => {
    if (batchTags.length === 0) {
      toast.error('请添加至少一个标签');
      return;
    }

    setLoading(true);
    try {
      // 批量更新选中的流程
      const updatePromises = selectedIds.map(async (id) => {
        const workflow = workflows.find(wf => wf.id === id);
        if (!workflow) return;

        // 合并现有标签和新标签，去重
        const existingTags = workflow.tags;
        const mergedTags = Array.from(new Set([...existingTags, ...batchTags]));

        const saveResult = await saveProcessDefinition({
          definitionId: id,
          processName: workflow.name,
          processKey: workflow.key,
          modelJson: JSON.stringify(convertWorkflowTreeToGraph(workflow.nodes)),
          category: workflow.category,
          tags: JSON.stringify(mergedTags),
          description: workflow.description,
          formId: workflow.formId,
          startPermissionType: workflow.startPermissionType,
          startPermissionValue: workflow.startPermissionValue,
          deptId: workflow.deptId,
        });

        // 原流程已发布时，标签变更后自动发布新版本，避免“最新发布版标签未更新”
        if (workflow.status === 'PUBLISHED') {
          const nextDefinitionId = resolveSavedDefinitionId(saveResult);
          if (nextDefinitionId) {
            await deployProcessDefinition(nextDefinitionId);
          }
        }
      });

      const results = await Promise.allSettled(updatePromises);
      const successCount = results.filter(result => result.status === 'fulfilled').length;
      const failedIds = results
        .map((result, index) => ({ result, id: selectedIds[index] }))
        .filter(({ result }) => result.status === 'rejected')
        .map(({ id }) => id);

      if (successCount > 0) {
        toast.success(`成功为 ${successCount} 个流程添加标签`);
        setShowBatchEditModal(false);
        setSelectedIds([]);
        loadWorkflows(); // 重新加载列表
      }
      if (failedIds.length > 0) {
        console.error('批量添加标签失败的流程ID:', failedIds);
        toast.error(`${failedIds.length} 个流程添加标签失败，请重试`);
      }
    } catch (error) {
      console.error('批量添加标签失败:', error);
      toast.error('批量添加标签失败');
    } finally {
      setLoading(false);
    }
  };

  // 添加批量标签
  const addBatchTag = (tag: string) => {
    if (tag && !batchTags.includes(tag)) {
      setBatchTags([...batchTags, tag]);
    }
  };

  // 移除批量标签
  const removeBatchTag = (tag: string) => {
    setBatchTags(batchTags.filter(t => t !== tag));
  };

  // 打开导出对话框（单个流程）
  const openExportDialog = (workflowId: string) => {
    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow) {
      toast.error('流程不存在或已被删除');
      return;
    }

    if (!canExportSingleWorkflow(workflow)) {
      toast.error('仅流程创建者或管理员可导出该流程');
      return;
    }

    setExportType('single');
    setExportWorkflowId(workflowId);
    setIncludeSensitive(false);
    setShowExportModal(true);
  };

  // 打开批量导出对话框
  const openBatchExportDialog = () => {
    if (selectedIds.length === 0) {
      toast.error('请先选择要导出的流程');
      return;
    }
    setExportType('batch');
    setIncludeSensitive(false);
    setShowExportModal(true);
  };

  // 执行导出
  const handleExport = async () => {
    setExporting(true);
    try {
      let blob: Blob;
      let fileName: string;

      if (exportType === 'single') {
        const workflow = workflows.find(w => w.id === exportWorkflowId);
        if (!workflow) {
          toast.error('未找到要导出的流程');
          return;
        }
        if (!canExportSingleWorkflow(workflow)) {
          toast.error('仅流程创建者或管理员可导出该流程');
          return;
        }

        // 单个流程导出
        blob = await exportWorkflow(exportWorkflowId, includeSensitive);
        fileName = `workflow_${workflow?.name || 'export'}_${workflow?.version || '1.0.0'}_${new Date().toISOString().split('T')[0]}.json`;
      } else {
        // 批量导出
        blob = await exportWorkflows(selectedIds, includeSensitive);
        fileName = `workflows_batch_${new Date().toISOString().split('T')[0]}.json`;
      }

      // 创建下载链接并触发下载
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(exportType === 'single' ? '流程导出成功' : `成功导出 ${selectedIds.length} 个流程`);
      setShowExportModal(false);
      
      // 批量导出后清空选择
      if (exportType === 'batch') {
        setSelectedIds([]);
      }
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  // 打开批量归档对话框
  const openBatchArchiveDialog = async () => {
    if (selectedIds.length === 0) {
      toast.error('请先选择要归档的流程');
      return;
    }

    // 执行安全检查
    try {
      const safetyResult = await checkOperationSafety(selectedIds);

      const warnings = safetyResult.warnings || [];
      setSafetyWarnings(warnings);
      setShowSafetyWarning(warnings.length > 0);

      // 安全检查不通过时直接阻断归档，避免无权限或无效流程被继续提交
      if (!safetyResult.safe) {
        const errorMessage =
          safetyResult.errors?.join('；') || safetyResult.message || '安全检查未通过，请处理后重试';
        toast.error(errorMessage);
        return;
      }

      setArchiveReason('');
      setShowArchiveModal(true);
    } catch (error) {
      console.error('安全检查失败:', error);
      toast.error('安全检查失败，请重试');
    }
  };

  // 执行批量归档
  const handleBatchArchive = async () => {
    if (!archiveReason.trim()) {
      toast.error('请输入归档原因');
      return;
    }

    setArchiving(true);
    try {
      const result = await archiveWorkflows(selectedIds, archiveReason);
      
      // 显示归档结果
      if (result.successCount > 0) {
        toast.success(`成功归档 ${result.successCount} 个流程`);
      }
      
      if (result.failedCount > 0) {
        toast.error(`${result.failedCount} 个流程归档失败`);
        // 显示失败详情
        result.details
          .filter(d => d.status === 'failed')
          .forEach(d => {
            console.error(`流程 ${d.workflowName} 归档失败: ${d.message}`);
          });
      }

      // 关闭对话框并清空选择
      setShowArchiveModal(false);
      setShowSafetyWarning(false);
      setSafetyWarnings([]);
      setSelectedIds([]);
      
      // 重新加载流程列表
      loadWorkflows();
    } catch (error) {
      console.error('批量归档失败:', error);
      toast.error('批量归档失败，请重试');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">流程管理</h2>
          <p className="text-slate-500 mt-1 text-sm">管理流程定义，支持批量修改分类和标签</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/templates')}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all flex items-center gap-2 shadow-sm"
          >
            <FolderOpen size={16} />
            从模板创建
          </button>
          <button
            onClick={() => navigate('/workflow/import')}
            className="px-4 py-2 bg-blue-500 text-white border border-blue-600 rounded-lg hover:bg-blue-600 transition-all flex items-center gap-2"
          >
            <Upload size={16} />
            导入流程
          </button>
          <button
            onClick={loadWorkflows}
            disabled={loading}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
          <input 
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full focus:ring-2 focus:ring-pink-400 outline-none" 
            placeholder="搜索流程名称..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* 分类筛选 */}
        <div className="flex items-center gap-2 flex-wrap">
          <FolderOpen size={16} className="text-slate-400" />
          <span className="text-sm text-slate-600 font-medium">分类:</span>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setSelectedCategory(value)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                selectedCategory === value
                  ? 'bg-pink-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 标签筛选 */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag size={16} className="text-slate-400" />
            <span className="text-sm text-slate-600 font-medium">标签:</span>
            {allTags.map(tag => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedTags(selectedTags.filter(t => t !== tag));
                    } else {
                      setSelectedTags([...selectedTags, tag]);
                    }
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1 ${
                    isSelected
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tag}
                  {isSelected && <X size={12} />}
                </button>
              );
            })}
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 transition-all"
              >
                清除筛选
              </button>
            )}
          </div>
        )}
      </div>

      {/* 批量操作工具栏 */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-pink-500 transition-colors"
          >
            {selectedIds.length === filteredWorkflows.length && filteredWorkflows.length > 0 ? (
              <CheckSquare size={18} className="text-pink-500" />
            ) : (
              <Square size={18} />
            )}
            全选 ({selectedIds.length}/{filteredWorkflows.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openBatchEdit('category')}
            disabled={selectedIds.length === 0 || !isAdmin}
            className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            title={!isAdmin ? '仅管理员可批量修改分类' : '批量修改选中流程分类'}
          >
            <FolderOpen size={16} />
            批量修改分类
          </button>
          <button
            onClick={() => openBatchEdit('tags')}
            disabled={selectedIds.length === 0 || !isAdmin}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            title={!isAdmin ? '仅管理员可批量添加标签' : '批量为选中流程添加标签'}
          >
            <Tag size={16} />
            批量添加标签
          </button>
          <button
            onClick={openBatchExportDialog}
            disabled={selectedIds.length === 0 || !canExportBatch}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            title={!canExportBatch ? '仅管理员可批量导出' : '批量导出选中的流程'}
          >
            <Download size={16} />
            批量导出
          </button>
          <button
            onClick={openBatchArchiveDialog}
            disabled={selectedIds.length === 0 || !canBatchArchive}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            title={!canBatchArchive ? '仅管理员可批量归档' : '批量归档选中的流程'}
          >
            <Archive size={16} />
            批量归档
          </button>
        </div>
      </div>

      {/* 流程列表 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider w-12">
                选择
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                流程名称
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                流程Key
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                分类
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                标签
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                版本
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw size={16} className="animate-spin" />
                    加载中...
                  </div>
                </td>
              </tr>
            ) : filteredWorkflows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  暂无流程数据
                </td>
              </tr>
            ) : (
              filteredWorkflows.map(wf => (
                <tr key={wf.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleSelectOne(wf.id)}
                      className="text-slate-400 hover:text-pink-500 transition-colors"
                    >
                      {selectedIds.includes(wf.id) ? (
                        <CheckSquare size={18} className="text-pink-500" />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-800">{wf.name}</div>
                    {wf.description && (
                      <div className="text-xs text-slate-500 mt-1 line-clamp-1">{wf.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{wf.key}</td>
                  <td className="px-4 py-3">
                    {wf.category ? (
                      <span className="px-2 py-1 text-xs font-medium bg-pink-100 text-pink-600 rounded-md flex items-center gap-1 w-fit">
                        <FolderOpen size={10} />
                        {CATEGORY_LABELS[wf.category] || wf.category}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">未分类</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {wf.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {wf.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded">
                            {tag}
                          </span>
                        ))}
                        {wf.tags.length > 3 && (
                          <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded">
                            +{wf.tags.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">无标签</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">v{wf.version}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/workflow/design?id=${wf.id}`)}
                        disabled={!isAdmin}
                        className="text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1 text-sm disabled:text-slate-400 disabled:cursor-not-allowed"
                        title={isAdmin ? '编辑流程' : '仅管理员可编辑流程'}
                      >
                        <Edit size={16} />
                        编辑
                      </button>
                      <button
                        onClick={() => navigate(`/workflow/versions/${wf.id}`)}
                        className="text-purple-600 hover:text-purple-700 transition-colors flex items-center gap-1 text-sm"
                        title="查看版本历史"
                      >
                        <RefreshCw size={16} />
                        版本
                      </button>
                      <button
                        onClick={() => openExportDialog(wf.id)}
                        disabled={!canExportSingleWorkflow(wf)}
                        className="text-green-600 hover:text-green-700 transition-colors flex items-center gap-1 text-sm disabled:text-slate-400 disabled:cursor-not-allowed"
                        title={canExportSingleWorkflow(wf) ? '导出流程' : '仅流程创建者或管理员可导出'}
                      >
                        <FileDown size={16} />
                        导出
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 批量编辑模态框 */}
      {showBatchEditModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            {/* 模态框标题 */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">
                {batchEditType === 'category' ? '批量修改分类' : '批量添加标签'}
              </h3>
              <button
                onClick={() => setShowBatchEditModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 模态框内容 */}
            <div className="p-6 space-y-4">
              <div className="text-sm text-slate-600 mb-4">
                已选择 <span className="font-bold text-pink-500">{selectedIds.length}</span> 个流程
              </div>

              {batchEditType === 'category' ? (
                // 分类选择
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    选择分类
                  </label>
                  <select
                    value={batchCategory}
                    onChange={(e) => setBatchCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-400 outline-none"
                  >
                    <option value="">请选择分类</option>
                    {Object.entries(CATEGORY_LABELS)
                      .filter(([key]) => key !== '')
                      .map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                  </select>
                </div>
              ) : (
                // 标签添加
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    添加标签
                  </label>
                  
                  {/* 标签输入 */}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={batchTagInput}
                      onChange={(e) => setBatchTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && batchTagInput.trim()) {
                          addBatchTag(batchTagInput.trim());
                          setBatchTagInput('');
                        }
                      }}
                      placeholder="输入标签后按回车"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none text-sm"
                    />
                    <button
                      onClick={() => {
                        if (batchTagInput.trim()) {
                          addBatchTag(batchTagInput.trim());
                          setBatchTagInput('');
                        }
                      }}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm"
                    >
                      添加
                    </button>
                  </div>

                  {/* 已添加的标签 */}
                  {batchTags.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs text-slate-600 mb-2">已添加的标签:</div>
                      <div className="flex flex-wrap gap-2">
                        {batchTags.map(tag => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded flex items-center gap-1"
                          >
                            {tag}
                            <button
                              onClick={() => removeBatchTag(tag)}
                              className="hover:text-blue-800"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 常用标签快捷选择 */}
                  <div>
                    <div className="text-xs text-slate-600 mb-2">常用标签:</div>
                    <div className="flex flex-wrap gap-2">
                      {COMMON_TAGS.map(tag => (
                        <button
                          key={tag}
                          onClick={() => addBatchTag(tag)}
                          disabled={batchTags.includes(tag)}
                          className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 模态框底部按钮 */}
            <div className="flex items-center justify-end gap-2 p-6 border-t border-slate-200">
              <button
                onClick={() => setShowBatchEditModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                取消
              </button>
              <button
                onClick={batchEditType === 'category' ? handleBatchUpdateCategory : handleBatchAddTags}
                disabled={loading || (batchEditType === 'category' ? !batchCategory : batchTags.length === 0)}
                className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={16} />
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导出选项对话框 */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            {/* 对话框标题 */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Download size={20} className="text-green-500" />
                {exportType === 'single' ? '导出流程' : '批量导出流程'}
              </h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 对话框内容 */}
            <div className="p-6 space-y-4">
              {exportType === 'batch' && (
                <div className="text-sm text-slate-600 mb-4 bg-blue-50 p-3 rounded-lg">
                  已选择 <span className="font-bold text-blue-600">{selectedIds.length}</span> 个流程
                </div>
              )}

              {exportType === 'single' && (
                <div className="text-sm text-slate-600 mb-4 bg-green-50 p-3 rounded-lg">
                  <div className="font-medium text-green-700 mb-1">流程信息</div>
                  <div className="text-slate-600">
                    {(() => {
                      const workflow = workflows.find(w => w.id === exportWorkflowId);
                      return workflow ? (
                        <>
                          <div>名称: {workflow.name}</div>
                          <div>版本: v{workflow.version}</div>
                          {workflow.category && (
                            <div>分类: {CATEGORY_LABELS[workflow.category] || workflow.category}</div>
                          )}
                        </>
                      ) : '未找到流程信息';
                    })()}
                  </div>
                </div>
              )}

              {/* 敏感信息选项 */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  导出选项
                </label>
                
                <div className="bg-slate-50 p-4 rounded-lg space-y-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="includeSensitive"
                      checked={includeSensitive}
                      onChange={(e) => setIncludeSensitive(e.target.checked)}
                      className="mt-1 w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500"
                    />
                    <div className="flex-1">
                      <label 
                        htmlFor="includeSensitive" 
                        className="text-sm font-medium text-slate-700 cursor-pointer"
                      >
                        包含敏感配置信息
                      </label>
                      <p className="text-xs text-slate-500 mt-1">
                        包括 API 密钥、数据库连接字符串等敏感配置。如果不勾选，导出文件中的敏感信息将被脱敏处理。
                      </p>
                    </div>
                  </div>

                  {includeSensitive && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                      <div className="text-amber-600 mt-0.5">⚠️</div>
                      <div className="text-xs text-amber-700">
                        <div className="font-medium mb-1">安全提示</div>
                        导出的文件将包含敏感信息，请妥善保管，避免泄露。
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 导出说明 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                <div className="font-medium mb-1">📋 导出说明</div>
                <ul className="list-disc list-inside space-y-1 text-blue-600">
                  <li>导出文件为 JSON 格式，可用于备份或迁移</li>
                  <li>文件名格式：workflow_名称_版本_日期.json</li>
                  <li>导出内容包含流程的所有节点、连接和配置</li>
                </ul>
              </div>
            </div>

            {/* 对话框底部按钮 */}
            <div className="flex items-center justify-end gap-2 p-6 border-t border-slate-200">
              <button
                onClick={() => setShowExportModal(false)}
                disabled={exporting}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={16} />
                {exporting ? '导出中...' : '确认导出'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量归档对话框 */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            {/* 对话框标题 */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Archive size={20} className="text-orange-500" />
                批量归档流程
              </h3>
              <button
                onClick={() => {
                  setShowArchiveModal(false);
                  setShowSafetyWarning(false);
                  setSafetyWarnings([]);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 对话框内容 */}
            <div className="p-6 space-y-4">
              {/* 选中流程数量 */}
              <div className="text-sm text-slate-600 mb-4 bg-orange-50 p-3 rounded-lg">
                已选择 <span className="font-bold text-orange-600">{selectedIds.length}</span> 个流程
              </div>

              {/* 安全警告 */}
              {showSafetyWarning && safetyWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="text-amber-600 mt-0.5">⚠️</div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-amber-700 mb-2">安全警告</div>
                      <ul className="text-xs text-amber-600 space-y-1 list-disc list-inside">
                        {safetyWarnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="text-xs text-amber-700 mt-2 pt-2 border-t border-amber-200">
                    请确认是否继续归档操作。归档后的流程将不可见，但可以在归档管理中恢复。
                  </div>
                </div>
              )}

              {/* 归档原因输入 */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  归档原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={archiveReason}
                  onChange={(e) => setArchiveReason(e.target.value)}
                  placeholder="请输入归档原因，例如：流程已过期、不再使用等"
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none text-sm resize-none"
                />
                <div className="text-xs text-slate-500">
                  归档原因将记录在审计日志中，便于后续追溯
                </div>
              </div>

              {/* 归档说明 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                <div className="font-medium mb-1">📋 归档说明</div>
                <ul className="list-disc list-inside space-y-1 text-blue-600">
                  <li>归档后的流程将从流程列表中隐藏</li>
                  <li>所有流程数据将被保留，可随时恢复</li>
                  <li>流程创建者将收到归档通知</li>
                  <li>归档操作将记录在审计日志中</li>
                </ul>
              </div>
            </div>

            {/* 对话框底部按钮 */}
            <div className="flex items-center justify-end gap-2 p-6 border-t border-slate-200">
              <button
                onClick={() => {
                  setShowArchiveModal(false);
                  setShowSafetyWarning(false);
                  setSafetyWarnings([]);
                }}
                disabled={archiving}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleBatchArchive}
                disabled={archiving || !archiveReason.trim()}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Archive size={16} />
                {archiving ? '归档中...' : '确认归档'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
