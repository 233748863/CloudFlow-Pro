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
  FilterChip,
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
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
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
import { getErrorMessage } from '@/utils/errorMessage';
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

const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';
const dialogSectionClassName =
  'overflow-hidden rounded-md border border-slate-200 px-4 py-2.5 dark:border-slate-800';

const ManagementTableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <TableRow className="hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-14">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

const DialogMetaRow: React.FC<{
  label: string;
  value: React.ReactNode;
}> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0 dark:border-slate-800">
    <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{value}</span>
  </div>
);

import { getWorkflowDefinitionStatusMeta } from '@/utils/enumLabels';

const getWorkflowStatusMeta = (status?: WorkflowDefinition['status']) =>
  getWorkflowDefinitionStatusMeta(status);

const formatWorkflowTags = (tags: string[]) => {
  if (tags.length === 0) {
    return '-';
  }

  const visibleTags = tags.slice(0, 3).join(' / ');
  return tags.length > 3 ? `${visibleTags} +${tags.length - 3}` : visibleTags;
};

const formatWorkflowPreview = (items: WorkflowDefinition[]) => {
  if (items.length === 0) {
    return '无';
  }

  const visible = items.slice(0, 2).map((workflow) => workflow.name).join(' / ');
  return items.length > 2 ? `${visible} +${items.length - 2}` : visible;
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
      toast.error(getErrorMessage(error, '加载流程列表失败'));
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
  const allVisibleSelected =
    visibleWorkflowIds.length > 0 && visibleWorkflowIds.every((id) => selectedIds.includes(id));

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
      toast.error(getErrorMessage(error, '批量修改分类失败'));
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
      toast.error(getErrorMessage(error, '批量添加标签失败'));
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

  const hasActiveFilters = Boolean(searchTerm || selectedCategory || selectedTags.length > 0);

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

  const handleToggleTagFilter = (tag: string) => {
    setSelectedTags((prev) => (
      prev.includes(tag)
        ? prev.filter((item) => item !== tag)
        : [...prev, tag]
    ));
  };

  const closeArchiveModal = () => {
    setShowArchiveModal(false);
    setShowSafetyWarning(false);
    setSafetyWarnings([]);
    setArchiveReason('');
  };

  return (
    <>
      <TablePageLayout
        className="gap-2.5"
        filters={(
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">流程管理</div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {filteredWorkflows.length} 个流程
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={loadWorkflows} disabled={loading} className="gap-2">
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  刷新
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/templates')} className="gap-2">
                  <FolderOpen size={16} />
                  模板中心
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/workflow/import')} className="gap-2">
                  <Upload size={16} />
                  导入流程
                </Button>
                <Button size="sm" onClick={() => navigate('/workflow/create')} className="gap-2">
                  <Plus size={16} />
                  新建流程
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-2.5">
                <div className="relative min-w-0 flex-1 xl:max-w-xl">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    className="pl-10"
                    placeholder="搜索流程名称或 Key"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <div className="w-full sm:w-60 xl:w-56">
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
                {hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={handleClearFilters}>
                    清空筛选
                  </Button>
                ) : null}
              </div>
            </div>

            {allTags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-200 pt-2.5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span className="text-xs text-slate-400 dark:text-slate-500">标签</span>
                <FilterChip
                  active={selectedTags.length === 0}
                  onClick={() => setSelectedTags([])}
                >
                  全部
                </FilterChip>
                {allTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <FilterChip
                      key={tag}
                      active={isSelected}
                      onClick={() => handleToggleTagFilter(tag)}
                    >
                      <span>{tag}</span>
                      {isSelected ? <X size={12} /> : null}
                    </FilterChip>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
        table={(<TableSurfaceCard>
          <>
            {selectedIds.length > 0 ? (
              <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-800">
                <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-xs text-slate-500 dark:text-slate-400">已选 {selectedIds.length} 个</span>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                      清空
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openBatchEdit('category')}
                      disabled={!isAdmin}
                      title={!isAdmin ? '仅管理员可批量修改分类' : '批量修改已选流程分类'}
                    >
                      <FolderOpen size={16} />
                      分类
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openBatchEdit('tags')}
                      disabled={!isAdmin}
                      title={!isAdmin ? '仅管理员可批量添加标签' : '为已选流程追加标签'}
                    >
                      <Tag size={16} />
                      标签
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openBatchExportDialog}
                      disabled={!canExportBatch}
                      title={!canExportBatch ? '仅管理员可批量导出' : '批量导出已选流程'}
                    >
                      <Download size={16} />
                      导出
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openBatchArchiveDialog}
                      disabled={!canBatchArchive}
                      title={!canBatchArchive ? '仅管理员可批量归档' : '批量归档已选流程'}
                    >
                      <Archive size={16} />
                      归档
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <tr>
                    <TableHead className="w-12 px-2 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleSelectAll}
                        disabled={filteredWorkflows.length === 0}
                        aria-label={allVisibleSelected ? '取消全选结果' : '全选结果'}
                        className="mx-auto h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                      >
                        {allVisibleSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </Button>
                    </TableHead>
                    <TableHead className="w-[32%]">流程名称</TableHead>
                    <TableHead>流程 Key</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>标签</TableHead>
                    <TableHead className="w-24">版本</TableHead>
                    <TableActionHead className="w-48">操作</TableActionHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <ManagementTableStateRow colSpan={7} title="正在加载流程数据..." loading />
                  ) : filteredWorkflows.length === 0 ? (
                    <ManagementTableStateRow
                      colSpan={7}
                      title="暂无流程数据"
                    />
                  ) : (
                    filteredWorkflows.map((workflow) => {
                      const selected = selectedIds.includes(workflow.id);
                      const statusMeta = getWorkflowStatusMeta(workflow.status);

                      return (
                        <TableRow key={workflow.id} data-state={selected ? 'selected' : undefined} className="align-top">
                          <TableCell className="w-12 py-2.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-pressed={selected}
                              aria-label={selected ? `取消选择 ${workflow.name}` : `选择 ${workflow.name}`}
                              onClick={() => handleSelectOne(workflow.id)}
                              className={cn(
                                'h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200',
                                selected && 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200',
                              )}
                            >
                              {selected ? <CheckSquare size={18} /> : <Square size={18} />}
                            </Button>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="space-y-1.5">
                              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {workflow.name}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  {statusMeta.label}
                                </span>
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                  ID {workflow.id}
                                </span>
                              </div>
                              {workflow.description ? (
                                <div className="max-w-lg truncate text-xs text-slate-500 dark:text-slate-400">
                                  {workflow.description}
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-2.5">
                            <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {workflow.key}
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5">
                            {workflow.category ? (
                              <span className="text-xs text-slate-700 dark:text-slate-200">
                                {getWorkflowCategoryLabel(workflow.category) || workflow.category}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-slate-500">未分类</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span className="text-xs text-slate-600 dark:text-slate-300" title={workflow.tags.join(', ') || undefined}>
                              {formatWorkflowTags(workflow.tags)}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-2.5">
                            <span className="text-xs text-slate-600 dark:text-slate-300">
                              v{workflow.version}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-2.5 text-right">
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
                                  tone: 'neutral',
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
                                  tone: 'neutral',
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
          </>
        </TableSurfaceCard>)}
      />

      <BaseDialog
        open={showBatchEditModal}
        title={batchEditType === 'category' ? '批量修改分类' : '批量添加标签'}
        onClose={() => setShowBatchEditModal(false)}
        maxWidthClassName="max-w-lg"
        bodyClassName="px-4 py-3 sm:px-5 sm:py-4"
        footerClassName="gap-2 px-4 py-2.5 sm:px-5 sm:py-3"
        footer={(
          <>
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
          </>
        )}
      >
        <div className="space-y-3.5">
          <div className={dialogSectionClassName}>
            <DialogMetaRow label="已选流程" value={`${selectedIds.length} 个`} />
            <DialogMetaRow label="流程" value={formatWorkflowPreview(selectedWorkflows)} />
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
            </div>
          ) : (
            <div className="space-y-3.5">
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
                    variant="outline"
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
                  <div className="flex flex-wrap gap-1.5">
                    {batchTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => removeBatchTag(tag)}
                        className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-800 dark:text-slate-300"
                      >
                        {tag}
                        <X size={12} />
                      </button>
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
                      variant={batchTags.includes(tag) ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => addBatchTag(tag)}
                      disabled={batchTags.includes(tag)}
                      className="px-3"
                    >
                      {tag}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </BaseDialog>

      <BaseDialog
        open={showExportModal}
        title={exportType === 'single' ? '导出流程' : '批量导出流程'}
        onClose={() => {
          if (!exporting) {
            setShowExportModal(false);
          }
        }}
        maxWidthClassName="max-w-lg"
        bodyClassName="px-4 py-3 sm:px-5 sm:py-4"
        footerClassName="gap-2 px-4 py-2.5 sm:px-5 sm:py-3"
        footer={(
          <>
            <Button variant="outline" type="button" onClick={() => setShowExportModal(false)} disabled={exporting}>
              取消
            </Button>
            <Button type="button" onClick={handleExport} disabled={exporting}>
              <Download size={16} />
              {exporting ? '导出中...' : '确认导出'}
            </Button>
          </>
        )}
      >
        <div className="space-y-3.5">
          <div className={dialogSectionClassName}>
            {exportType === 'batch' ? (
              <>
                <DialogMetaRow label="已选流程" value={`${selectedIds.length} 个`} />
                <DialogMetaRow label="流程" value={formatWorkflowPreview(exportTargetWorkflows)} />
              </>
            ) : currentExportWorkflow ? (
              <>
                <DialogMetaRow label="流程名称" value={currentExportWorkflow.name} />
                <DialogMetaRow label="版本" value={`v${currentExportWorkflow.version}`} />
                <DialogMetaRow
                  label="分类"
                  value={currentExportWorkflow.category ? (getWorkflowCategoryLabel(currentExportWorkflow.category) || currentExportWorkflow.category) : '未分类'}
                />
              </>
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-300">未找到要导出的流程信息。</div>
            )}
          </div>
          <div className={dialogSectionClassName}>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={includeSensitive}
                onChange={(event) => setIncludeSensitive(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  包含敏感配置信息
                </div>
                <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  默认导出脱敏内容
                </div>
              </div>
            </label>
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={showArchiveModal}
        title="批量归档流程"
        onClose={closeArchiveModal}
        maxWidthClassName="max-w-lg"
        bodyClassName="px-4 py-3 sm:px-5 sm:py-4"
        footerClassName="gap-2 px-4 py-2.5 sm:px-5 sm:py-3"
        footer={(
          <>
            <Button variant="outline" type="button" onClick={closeArchiveModal} disabled={archiving}>
              取消
            </Button>
            <Button
              type="button"
              onClick={handleBatchArchive}
              disabled={archiving || !archiveReason.trim()}
            >
              <Archive size={16} />
              {archiving ? '归档中...' : '确认归档'}
            </Button>
          </>
        )}
      >
        <div className="space-y-3.5">
          <div className={dialogSectionClassName}>
            <DialogMetaRow label="已选流程" value={`${selectedIds.length} 个`} />
            <DialogMetaRow label="已发布流程" value={`${selectedPublishedCount} 个`} />
            <DialogMetaRow label="流程" value={formatWorkflowPreview(selectedWorkflows)} />
          </div>
          {showSafetyWarning && safetyWarnings.length > 0 ? (
            <div className={dialogSectionClassName}>
              <DialogMetaRow label="安全检查" value={`${safetyWarnings.length} 条提示`} />
              <div className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                {safetyWarnings.map((warning, index) => (
                  <div key={index}>{warning}</div>
                ))}
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
          </div>
        </div>
      </BaseDialog>
    </>
  );
};
