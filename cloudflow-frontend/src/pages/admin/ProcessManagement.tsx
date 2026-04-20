import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, 
  FolderOpen, 
  Tag, 
  Edit, 
  Archive, 
  CheckSquare, 
  Square,
  X,
  Save,
  RefreshCw,
  Download,
  FileDown,
  Upload,
  Plus
} from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { WorkspaceBackdrop, WorkspacePageContent, WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';
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
import { parseWorkflowGraphDefinition } from '../../utils/workflowGraph';
import { useWorkflowPermission } from '../../hooks/useWorkflowPermission';
import { WORKFLOW_CATEGORY_OPTIONS, getWorkflowCategoryLabel, normalizeWorkflowCategory } from '../../utils/workflowCategory';
import { downloadBlob } from '../../utils/download';
import { cn } from '@/utils/cn';

// 扩展 WorkflowDefinition 类型，tags 解析为数组
interface WorkflowDefinition extends Omit<BaseWorkflowDefinition, 'tags'> {
  tags: string[]; // 已解析的标签数组
  tagsRaw?: string; // 后端原始标签串（用于避免批量编辑时覆盖异常数据）
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  workflowCreatorId: string; // 流程创建者ID（用于权限判断）
}

const fieldLabelClassName = 'mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200';
const subtlePanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';
const elevatedPanelClassName =
  'rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/78';
const previewChipClassName =
  'inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';

const getWorkflowStatusMeta = (status?: WorkflowDefinition['status']) => {
  switch (status) {
    case 'PUBLISHED':
      return {
        label: '已发布',
        className:
          'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200',
      };
    case 'ARCHIVED':
      return {
        label: '已归档',
        className:
          'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
      };
    default:
      return {
        label: '草稿',
        className:
          'border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      };
  }
};

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

  const parseGraphSafely = (
    rawModelJson: unknown,
    workflowName: string,
    onError: () => void
  ): BaseWorkflowDefinition['graph'] | null => {
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

    try {
      return graph;
    } catch (error) {
      onError();
      console.warn(`[ProcessManagement] modelJson 图结构校验失败，流程: ${workflowName}`, error);
      return null;
    }
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
        let missingProcessKeyCount = 0;
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

            const processKey = typeof w.processKey === 'string' ? w.processKey.trim() : '';
            if (!processKey) {
              missingProcessKeyCount += 1;
              console.warn('[ProcessManagement] 跳过缺少 processKey 的流程记录:', w);
              return null;
            }

            const workflowName = (w.processName || definitionId) as string;
            const tagsRaw =
              typeof w.tags === 'string'
                ? w.tags
                : Array.isArray(w.tags)
                  ? JSON.stringify(w.tags)
                  : undefined;
            const parsedGraph = parseGraphSafely(w.modelJson, workflowName, () => {
              invalidModelCount += 1;
            });
            if (!parsedGraph) {
              return null;
            }
            return {
              id: definitionId,
              name: workflowName,
              key: processKey,
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
              category: normalizeWorkflowCategory(w.category),
              tags: parseTagsSafely(w.tags, workflowName, () => {
                invalidTagsCount += 1;
              }),
              tagsRaw,
              description: w.description || '',
              graph: parsedGraph,
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
        if (missingProcessKeyCount > 0) {
          toast.warning(`有 ${missingProcessKeyCount} 条流程缺少 processKey，已自动跳过`);
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

  const visibleWorkflowIds = filteredWorkflows.map((wf) => wf.id);
  const selectedVisibleCount = visibleWorkflowIds.filter((id) => selectedIds.includes(id)).length;
  const allVisibleSelected = visibleWorkflowIds.length > 0 && selectedVisibleCount === visibleWorkflowIds.length;

  // 全选/取消全选
  const handleSelectAll = () => {
    if (visibleWorkflowIds.length === 0) {
      return;
    }

    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleWorkflowIds.includes(id));
      }

      return Array.from(new Set([...prev, ...visibleWorkflowIds]));
    });
  };

  // 单选
  const handleSelectOne = (id: string) => {
    setSelectedIds((prev) => (
      prev.includes(id)
        ? prev.filter((selectedId) => selectedId !== id)
        : [...prev, id]
    ));
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
          modelJson: JSON.stringify(workflow.graph),
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
          modelJson: JSON.stringify(workflow.graph),
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

      const downloadedFileName = downloadBlob(blob, fileName);

      toast.success(
        exportType === 'single'
          ? `流程已导出，下载文件：${downloadedFileName}`
          : `已导出 ${selectedIds.length} 个流程，下载文件：${downloadedFileName}`,
      );
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

  const publishedCount = filteredWorkflows.filter((wf) => wf.status === 'PUBLISHED').length;
  const archivedCount = filteredWorkflows.filter((wf) => wf.status === 'ARCHIVED').length;
  const draftCount = filteredWorkflows.filter((wf) => !wf.status || wf.status === 'DRAFT').length;
  const categoryCount = new Set(workflows.map((wf) => wf.category).filter(Boolean)).size;
  const hasActiveFilters = Boolean(searchTerm || selectedCategory || selectedTags.length > 0);
  const now = new Date();
  const todayLabel = `${now.getMonth() + 1}/${now.getDate()}`;
  const timeLabel = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const overviewItems = [
    { label: '当前结果', value: `${filteredWorkflows.length} 个流程` },
    { label: '分类', value: selectedCategory ? (getWorkflowCategoryLabel(selectedCategory) || selectedCategory) : '全部分类' },
    { label: '标签', value: selectedTags.length > 0 ? `已选 ${selectedTags.length} 个` : '全部标签' },
    { label: '批量选择', value: `${selectedIds.length} 个` },
  ];

  const selectedWorkflows = workflows.filter((workflow) => selectedIds.includes(workflow.id));
  const selectedPublishedCount = selectedWorkflows.filter((workflow) => workflow.status === 'PUBLISHED').length;
  const currentExportWorkflow = workflows.find((workflow) => workflow.id === exportWorkflowId);
  const exportTargetWorkflows =
    exportType === 'single'
      ? (currentExportWorkflow ? [currentExportWorkflow] : [])
      : selectedWorkflows;

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
    setSelectedTags([]);
  };

  const closeArchiveModal = () => {
    setShowArchiveModal(false);
    setShowSafetyWarning(false);
    setSafetyWarnings([]);
    setArchiveReason('');
  };

  const renderWorkflowPreview = (items: WorkflowDefinition[]) => {
    if (items.length === 0) {
      return (
        <div className="text-xs leading-6 text-slate-400 dark:text-slate-500">
          当前没有可预览的流程。
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 5).map((workflow) => (
          <span key={workflow.id} className={previewChipClassName}>
            {workflow.name}
          </span>
        ))}
        {items.length > 5 ? (
          <span className={previewChipClassName}>+{items.length - 5} 个流程</span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
                <FolderOpen size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          )}
          title="流程管理"
          description="统一管理流程定义、分类、标签与批量治理动作，让复杂后台页也收口到同一套轻量桌面工作台语法。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate('/workflow/create')} className="gap-2">
                <Plus size={16} />
                新建流程
              </Button>
              <Button variant="outline" onClick={() => navigate('/templates')} className="gap-2">
                <FolderOpen size={16} />
                模板中心
              </Button>
              <Button
                variant="soft"
                onClick={() => navigate('/workflow/import')}
                className="gap-2 border-cyan-200 bg-cyan-50 text-cyan-700 hover:border-cyan-300 hover:bg-cyan-100 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/60"
              >
                <Upload size={16} />
                导入流程
              </Button>
              <Button variant="outline" onClick={loadWorkflows} disabled={loading} className="gap-2">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                刷新
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="流程总量"
              value={workflows.length}
              hint="当前系统中的全部流程定义数"
              aside={<Plus size={18} className="text-cyan-600 dark:text-cyan-300" />}
            />
            <WorkspaceMetricCard
              label="筛选结果"
              value={filteredWorkflows.length}
              hint={`已发布 ${publishedCount} 个 / 草稿 ${draftCount} 个`}
              aside={<RefreshCw size={18} className="text-sky-500 dark:text-sky-300" />}
            />
            <WorkspaceMetricCard
              label="分类数"
              value={categoryCount}
              hint={`可用标签 ${allTags.length} 个 / 已归档 ${archivedCount} 个`}
              aside={<FolderOpen size={18} className="text-amber-500 dark:text-amber-300" />}
            />
            <WorkspaceMetricCard
              label="批量选择"
              value={selectedIds.length}
              hint={isAdmin ? '管理员可执行全部治理动作' : '当前账号仅保留可见导出能力'}
              aside={<Tag size={18} className="text-emerald-500 dark:text-emerald-300" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          title="流程工作台"
          total={filteredWorkflows.length}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          headerBadges={(
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {hasActiveFilters ? '已启用筛选' : '默认视图'}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                已发布 {publishedCount} 个
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                已归档 {archivedCount} 个
              </span>
            </div>
          )}
          quickFilterAside={hasActiveFilters ? (
            <Button variant="outline" size="sm" onClick={handleClearFilters}>
              清空筛选
            </Button>
          ) : (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500">
              当前展示全部流程
            </span>
          )}
          filterBar={(
            <div className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    名称搜索
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      className="pl-10"
                      placeholder="搜索流程名称"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    分类筛选
                  </div>
                  <Select
                    value={selectedCategory || '__ALL__'}
                    onValueChange={(value) => setSelectedCategory(value === '__ALL__' ? '' : value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="全部分类" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ALL__">全部分类</SelectItem>
                      {WORKFLOW_CATEGORY_OPTIONS.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    <FolderOpen size={14} />
                    分类
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {[{ value: '', label: '全部' }, ...WORKFLOW_CATEGORY_OPTIONS].map(({ value, label }) => (
                      <Button
                        key={value || 'ALL'}
                        type="button"
                        variant={selectedCategory === value ? 'soft' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedCategory(value)}
                        className={cn(
                          'h-8 rounded-full px-3 text-xs',
                          selectedCategory === value
                            ? 'border-cyan-200 bg-cyan-50 text-cyan-700 shadow-none dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200'
                            : '',
                        )}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                {allTags.length > 0 ? (
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                      <Tag size={14} />
                      标签
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {allTags.map((tag) => {
                        const isSelected = selectedTags.includes(tag);
                        return (
                          <Button
                            key={tag}
                            type="button"
                            variant={isSelected ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTags((prev) => prev.filter((item) => item !== tag));
                                return;
                              }
                              setSelectedTags((prev) => [...prev, tag]);
                            }}
                            className={cn(
                              'h-8 rounded-full px-3 text-xs',
                              isSelected
                                ? 'border-cyan-200 bg-cyan-50 text-cyan-700 shadow-none hover:border-cyan-300 hover:bg-cyan-100 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/60'
                                : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-cyan-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900 dark:hover:text-cyan-200',
                            )}
                          >
                            {tag}
                            {isSelected ? <X size={12} /> : null}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        />
        <WorkspaceResultCard
          total={filteredWorkflows.length}
          title="流程列表"
          description="批量动作、单项操作和状态表达统一收口到这里，保证治理页和业务页使用同一套桌面视觉语言。"
        >
          <div className="space-y-4 px-4 py-4">
            <div className={elevatedPanelClassName}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleSelectAll}
                      className="h-9 rounded-full px-3 text-slate-600 hover:bg-slate-100 hover:text-cyan-600 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-cyan-200"
                    >
                      {allVisibleSelected ? (
                        <CheckSquare size={18} className="text-cyan-600 dark:text-cyan-200" />
                      ) : (
                        <Square size={18} />
                      )}
                      全选当前结果 ({selectedVisibleCount}/{filteredWorkflows.length})
                    </Button>
                    <span className={previewChipClassName}>已选流程 {selectedIds.length} 个</span>
                    <span className={previewChipClassName}>已发布 {selectedPublishedCount} 个</span>
                    <span className={previewChipClassName}>
                      {isAdmin ? '管理员治理权限已开启' : '当前账号无批量治理权限'}
                    </span>
                  </div>
                  <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                    这里统一承载批量分类、批量标签、导出与归档动作。未选中流程时会自动禁用对应操作，避免出现多套治理入口。
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="soft"
                    onClick={() => openBatchEdit('category')}
                    disabled={selectedIds.length === 0 || !isAdmin}
                    title={!isAdmin ? '仅管理员可批量修改分类' : '批量修改已选流程分类'}
                    className="border-cyan-200 bg-cyan-50 text-cyan-700 shadow-none hover:border-cyan-300 hover:bg-cyan-100 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/60"
                  >
                    <FolderOpen size={16} />
                    批量改分类
                  </Button>
                  <Button
                    type="button"
                    variant="soft"
                    onClick={() => openBatchEdit('tags')}
                    disabled={selectedIds.length === 0 || !isAdmin}
                    title={!isAdmin ? '仅管理员可批量添加标签' : '为已选流程追加标签'}
                    className="border-teal-200 bg-teal-50 text-teal-700 shadow-none hover:border-teal-300 hover:bg-teal-100 dark:border-teal-900/70 dark:bg-teal-950/40 dark:text-teal-200 dark:hover:border-teal-800 dark:hover:bg-teal-950/60"
                  >
                    <Tag size={16} />
                    批量加标签
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openBatchExportDialog}
                    disabled={selectedIds.length === 0 || !canExportBatch}
                    title={!canExportBatch ? '仅管理员可批量导出' : '批量导出已选流程'}
                    className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/60"
                  >
                    <Download size={16} />
                    批量导出
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openBatchArchiveDialog}
                    disabled={selectedIds.length === 0 || !canBatchArchive}
                    title={!canBatchArchive ? '仅管理员可批量归档' : '批量归档已选流程'}
                    className="border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:border-amber-800 dark:hover:bg-amber-950/60"
                  >
                    <Archive size={16} />
                    批量归档
                  </Button>
                </div>
              </div>
            </div>
            <Table className="min-w-[1160px]">
              <TableHeader>
                <tr>
                  <TableHead className="w-12">选择</TableHead>
                  <TableHead className="w-[30%]">流程名称</TableHead>
                  <TableHead>流程 Key</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>标签</TableHead>
                  <TableHead className="w-28">版本</TableHead>
                  <TableActionHead className="w-72">操作</TableActionHead>
                </tr>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <WorkspaceTableStateRow colSpan={7} type="loading" title="正在加载流程数据..." />
                ) : filteredWorkflows.length === 0 ? (
                  <WorkspaceTableStateRow
                    colSpan={7}
                    title="暂无流程数据"
                    description="可以先创建流程，或调整筛选条件查看其它流程定义。"
                  />
                ) : (
                  filteredWorkflows.map((workflow) => {
                    const selected = selectedIds.includes(workflow.id);
                    const statusMeta = getWorkflowStatusMeta(workflow.status);

                    return (
                      <TableRow key={workflow.id} data-state={selected ? 'selected' : undefined} className="align-top">
                        <TableCell className="w-12 py-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-pressed={selected}
                            aria-label={selected ? `取消选择 ${workflow.name}` : `选择 ${workflow.name}`}
                            onClick={() => handleSelectOne(workflow.id)}
                            className={cn(
                              'h-8 w-8 rounded-full text-slate-400 hover:bg-transparent hover:text-cyan-600 dark:text-slate-500 dark:hover:text-cyan-200',
                              selected && 'text-cyan-600 dark:text-cyan-200',
                            )}
                          >
                            {selected ? <CheckSquare size={18} /> : <Square size={18} />}
                          </Button>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="space-y-2">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {workflow.name}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', statusMeta.className)}>
                                {statusMeta.label}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                ID {workflow.id}
                              </span>
                            </div>
                            {workflow.description ? (
                              <div className="max-w-xl text-xs leading-6 text-slate-500 dark:text-slate-400">
                                {workflow.description}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-400 dark:text-slate-500">暂无流程描述</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-4">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                            {workflow.key}
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          {workflow.category ? (
                            <span className="inline-flex w-fit items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
                              <FolderOpen size={10} />
                              {getWorkflowCategoryLabel(workflow.category) || workflow.category}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">未分类</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          {workflow.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {workflow.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-600 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200"
                                >
                                  {tag}
                                </span>
                              ))}
                              {workflow.tags.length > 3 ? (
                                <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                  +{workflow.tags.length - 3}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">无标签</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-4">
                          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            v{workflow.version}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-4 text-right">
                          <TableRowActions
                            align="end"
                            wrap={false}
                            className="whitespace-nowrap"
                            actions={[
                              {
                                label: '编辑',
                                icon: <Edit size={16} />,
                                onClick: () => navigate(`/workflow/design?id=${workflow.id}`),
                                disabled: !isAdmin,
                                title: isAdmin ? '编辑流程' : '仅管理员可编辑流程',
                                tone: 'info',
                              },
                              {
                                label: '版本',
                                icon: <RefreshCw size={16} />,
                                onClick: () => navigate(`/workflow/versions/${workflow.id}`),
                                title: '查看版本历史',
                                tone: 'neutral',
                              },
                              {
                                label: '导出',
                                icon: <FileDown size={16} />,
                                onClick: () => openExportDialog(workflow.id),
                                disabled: !canExportSingleWorkflow(workflow),
                                title: canExportSingleWorkflow(workflow) ? '导出流程' : '仅流程创建者或管理员可导出',
                                tone: 'success',
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </WorkspaceResultCard>
        {showBatchEditModal ? (
          <WorkspaceDialogShell
            title={batchEditType === 'category' ? '批量修改分类' : '批量添加标签'}
            description="批量动作只调整选中流程的元数据，不改动节点和连线结构。"
            onClose={() => setShowBatchEditModal(false)}
            maxWidthClassName="max-w-2xl"
            headerAside={<span className={previewChipClassName}>{selectedIds.length} 个流程</span>}
          >
            <div className="space-y-4">
              <div className={cn(subtlePanelClassName, 'space-y-3 border-cyan-200 bg-cyan-50/80 dark:border-cyan-900/70 dark:bg-cyan-950/30')}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      已选择 {selectedIds.length} 个流程
                    </div>
                    <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                      只会更新元数据，不会影响流程节点、连线和表单结构。
                    </div>
                  </div>
                  <span className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-medium text-cyan-700 dark:border-cyan-900/70 dark:bg-slate-950 dark:text-cyan-200">
                    {batchEditType === 'category' ? '分类治理' : '标签治理'}
                  </span>
                </div>
                {renderWorkflowPreview(selectedWorkflows)}
              </div>
              {batchEditType === 'category' ? (
                <div className="space-y-2">
                  <label className={fieldLabelClassName}>
                    目标分类 <span className="text-red-500">*</span>
                  </label>
                  <Select value={batchCategory || '__EMPTY__'} onValueChange={(value) => setBatchCategory(value === '__EMPTY__' ? '' : value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="请选择分类" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__EMPTY__">请选择分类</SelectItem>
                      {WORKFLOW_CATEGORY_OPTIONS.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                    分类修改后，已发布流程会沿用现有发布逻辑同步新版本元数据。
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className={fieldLabelClassName}>追加标签</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={batchTagInput}
                        onChange={(event) => setBatchTagInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && batchTagInput.trim()) {
                            event.preventDefault();
                            addBatchTag(batchTagInput.trim());
                            setBatchTagInput('');
                          }
                        }}
                        placeholder="输入标签后按回车"
                      />
                      <Button
                        type="button"
                        variant="soft"
                        onClick={() => {
                          if (batchTagInput.trim()) {
                            addBatchTag(batchTagInput.trim());
                            setBatchTagInput('');
                          }
                        }}
                      >
                        添加
                      </Button>
                    </div>
                  </div>
                  {batchTags.length > 0 ? (
                    <div className="space-y-2">
                      <div className={fieldLabelClassName}>已添加标签</div>
                      <div className="flex flex-wrap gap-2">
                        {batchTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-600 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeBatchTag(tag)}
                              className="text-cyan-600 transition hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-100"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <div className={fieldLabelClassName}>常用标签</div>
                    <div className="flex flex-wrap gap-2">
                      {COMMON_TAGS.map((tag) => (
                        <Button
                          key={tag}
                          type="button"
                          variant={batchTags.includes(tag) ? 'soft' : 'secondary'}
                          size="sm"
                          onClick={() => addBatchTag(tag)}
                          disabled={batchTags.includes(tag)}
                          className="rounded-full"
                        >
                          {tag}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => setShowBatchEditModal(false)}>
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={batchEditType === 'category' ? handleBatchUpdateCategory : handleBatchAddTags}
                  disabled={loading || (batchEditType === 'category' ? !batchCategory : batchTags.length === 0)}
                >
                  <Save size={16} />
                  {loading ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}
        {showExportModal ? (
          <WorkspaceDialogShell
            title={exportType === 'single' ? '导出流程' : '批量导出流程'}
            description="导出文件会保留流程定义、节点和配置，可用于备份或迁移。"
            onClose={() => {
              if (!exporting) {
                setShowExportModal(false);
              }
            }}
            maxWidthClassName="max-w-2xl"
            headerAside={(
              <span className={previewChipClassName}>
                {exportType === 'single' ? '单流程导出' : `批量导出 ${selectedIds.length} 个`}
              </span>
            )}
          >
            <div className="space-y-4">
              <div
                className={cn(
                  subtlePanelClassName,
                  exportType === 'batch'
                    ? 'border-cyan-200 bg-cyan-50/80 dark:border-cyan-900/70 dark:bg-cyan-950/30'
                    : 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/70 dark:bg-emerald-950/30',
                )}
              >
                {exportType === 'batch' ? (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      本次将批量导出 {selectedIds.length} 个流程
                    </div>
                    <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                      批量导出会把当前选中的流程定义打包到同一份 JSON 文件中。
                    </div>
                    {renderWorkflowPreview(exportTargetWorkflows)}
                  </div>
                ) : currentExportWorkflow ? (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">流程信息</div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                        名称：{currentExportWorkflow.name}
                      </div>
                      <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                        版本：v{currentExportWorkflow.version}
                      </div>
                      <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                        分类：{currentExportWorkflow.category ? (getWorkflowCategoryLabel(currentExportWorkflow.category) || currentExportWorkflow.category) : '未分类'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-600 dark:text-slate-300">未找到要导出的流程信息。</div>
                )}
              </div>
              <div className={elevatedPanelClassName}>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">导出选项</div>
                <label className="mt-3 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={includeSensitive}
                    onChange={(event) => setIncludeSensitive(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      包含敏感配置信息
                    </div>
                    <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                      包括 API 密钥、连接配置等敏感字段。不勾选时会做脱敏处理，适合日常备份和跨环境流转。
                    </div>
                  </div>
                </label>
                {includeSensitive ? (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                    导出文件将包含敏感配置，请仅在受控环境中使用并妥善保管。
                  </div>
                ) : null}
              </div>
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-xs leading-6 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200">
                <div className="font-medium">导出说明</div>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>导出文件为 JSON 格式，可用于备份、迁移或离线审阅。</li>
                  <li>文件名会自动带上流程名称、版本和导出日期。</li>
                  <li>批量导出会把已选流程打包成同一份文件。</li>
                </ul>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  disabled={exporting}
                >
                  取消
                </Button>
                <Button type="button" onClick={handleExport} disabled={exporting}>
                  <Download size={16} />
                  {exporting ? '导出中...' : '确认导出'}
                </Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}
        {showArchiveModal ? (
          <WorkspaceDialogShell
            title="批量归档流程"
            description="归档会隐藏流程入口，但仍会保留历史数据和恢复能力。"
            onClose={closeArchiveModal}
            maxWidthClassName="max-w-2xl"
            headerAside={<span className={previewChipClassName}>{selectedIds.length} 个流程</span>}
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/30">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      已选择 {selectedIds.length} 个流程准备归档
                    </div>
                    <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                      其中包含 {selectedPublishedCount} 个已发布流程，请确认它们已经停止对外提供发起入口。
                    </div>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-900/70 dark:bg-slate-950 dark:text-amber-200">
                    归档治理
                  </span>
                </div>
                <div className="mt-3">{renderWorkflowPreview(selectedWorkflows)}</div>
              </div>
              {showSafetyWarning && safetyWarnings.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                  <div className="font-medium">安全警告</div>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {safetyWarnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                  <div className="mt-2 border-t border-amber-200 pt-2 dark:border-amber-900/70">
                    请确认这些流程仍可归档。归档后可在归档管理中恢复，但默认不会继续出现在流程列表中。
                  </div>
                </div>
              ) : null}
              <div className="space-y-2">
                <label className={fieldLabelClassName}>
                  归档原因 <span className="text-red-500">*</span>
                </label>
                <Textarea
                  rows={4}
                  value={archiveReason}
                  onChange={(event) => setArchiveReason(event.target.value)}
                  placeholder="请输入归档原因，例如：流程已停用、已由新版流程替代"
                />
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  归档原因会记录到审计日志，便于后续追溯。
                </div>
              </div>
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-xs leading-6 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200">
                <div className="font-medium">归档说明</div>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>归档后的流程会从当前列表中隐藏。</li>
                  <li>流程历史数据仍会保留，可在归档管理中恢复。</li>
                  <li>归档操作会写入审计日志，并通知对应创建者。</li>
                </ul>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={closeArchiveModal} disabled={archiving}>
                  取消
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBatchArchive}
                  disabled={archiving || !archiveReason.trim()}
                  className="border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:border-amber-800 dark:hover:bg-amber-950/60"
                >
                  <Archive size={16} />
                  {archiving ? '归档中...' : '确认归档'}
                </Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}
      </WorkspacePageContent>
    </div>
  );
};
