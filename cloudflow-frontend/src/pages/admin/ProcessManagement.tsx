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
import { Button, Input, TableHead, TableHeader, TableActionHead, Textarea } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { WorkspaceBackdrop, WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';
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

  const currentExportWorkflow = workflows.find((workflow) => workflow.id === exportWorkflowId);

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
  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <div className="relative z-10 space-y-6 p-6">
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <FolderOpen size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span>
            </div>
          )}
          title="流程管理"
          description="统一管理流程定义、分类、标签与批量操作，让流程治理页也回到和 business-trip 一致的工作台结构。"
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
              <Button onClick={() => navigate('/workflow/import')} className="bg-blue-500 hover:bg-blue-600 text-white gap-2">
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
            <WorkspaceMetricCard label="流程总量" value={workflows.length} hint="当前系统中的全部流程定义数" aside={<Plus size={18} className="text-pink-500" />} />
            <WorkspaceMetricCard label="筛选结果" value={filteredWorkflows.length} hint={`已发布 ${publishedCount} 个`} aside={<RefreshCw size={18} className="text-sky-500" />} />
            <WorkspaceMetricCard label="分类数" value={categoryCount} hint={`可用标签 ${allTags.length} 个`} aside={<FolderOpen size={18} className="text-amber-500" />} />
            <WorkspaceMetricCard label="批量选择" value={selectedIds.length} hint="用于批量修改、导出与归档" aside={<Tag size={18} className="text-emerald-500" />} />
          </div>
        </WorkspaceHeroCard>
      {/* 页面标题 */}
        <WorkspaceWorkbenchCard
          title="流程工作台"
          total={filteredWorkflows.length}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          headerBadges={(
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">{hasActiveFilters ? '已启用筛选' : '默认视图'}</span>
              <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">已发布 {publishedCount} 个</span>
            </div>
          )}
          quickFilterAside={hasActiveFilters ? <Button variant="outline" size="sm" onClick={handleClearFilters}>清空筛选</Button> : <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">当前展示全部流程</span>}
          filterBar={(
            <div className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-10" placeholder="搜索流程名称" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
                </div>
                <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="cf-glass-input h-11 w-full rounded-2xl px-3.5 text-sm text-slate-700">
                  <option value="">全部分类</option>
                  {WORKFLOW_CATEGORY_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-slate-400"><FolderOpen size={14} />分类</span>
                  <div className="flex flex-wrap gap-2">
                    {[{ value: '', label: '全部' }, ...WORKFLOW_CATEGORY_OPTIONS].map(({ value, label }) => (
                      <Button key={value || 'ALL'} type="button" variant={selectedCategory === value ? 'default' : 'ghost'} size="sm" onClick={() => setSelectedCategory(value)} className={selectedCategory === value ? 'h-8 text-xs' : 'h-8 bg-white/68 text-xs text-slate-600 ring-1 ring-white/80 hover:bg-white hover:text-pink-600'}>{label}</Button>
                    ))}
                  </div>
                </div>
                {allTags.length > 0 ? (
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-slate-400"><Tag size={14} />标签</span>
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
                            className={isSelected ? 'h-8 bg-blue-500 text-xs text-white hover:bg-blue-600 [background-image:none]' : 'h-8 bg-white/68 text-xs text-slate-600 ring-1 ring-white/80 hover:bg-white hover:text-blue-600'}
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
        <WorkspaceResultCard total={filteredWorkflows.length} title="流程列表" description="批量动作和单项操作统一收口到这里，保证列表页与业务申请页使用同一套视觉语言。">
          <div className="space-y-4 px-4 py-4">
            <div className="rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.74))] p-4 shadow-[0_14px_28px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.72)]">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <Button type="button" variant="ghost" onClick={handleSelectAll} className="justify-start px-0 text-slate-600 hover:bg-transparent hover:text-pink-500">{allVisibleSelected ? <CheckSquare size={18} className="text-pink-500" /> : <Square size={18} />}全选当前结果 ({selectedVisibleCount}/{filteredWorkflows.length})</Button>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => openBatchEdit('category')} disabled={selectedIds.length === 0 || !isAdmin} title={!isAdmin ? '仅管理员可批量修改分类' : '批量修改已选流程分类'} className="bg-pink-500 text-white hover:bg-pink-600 [background-image:none]"><FolderOpen size={16} />批量改分类</Button>
                  <Button type="button" onClick={() => openBatchEdit('tags')} disabled={selectedIds.length === 0 || !isAdmin} title={!isAdmin ? '仅管理员可批量添加标签' : '为已选流程追加标签'} className="bg-blue-500 text-white hover:bg-blue-600 [background-image:none]"><Tag size={16} />批量加标签</Button>
                  <Button type="button" onClick={openBatchExportDialog} disabled={selectedIds.length === 0 || !canExportBatch} title={!canExportBatch ? '仅管理员可批量导出' : '批量导出已选流程'} className="bg-emerald-500 text-white hover:bg-emerald-600 [background-image:none]"><Download size={16} />批量导出</Button>
                  <Button type="button" onClick={openBatchArchiveDialog} disabled={selectedIds.length === 0 || !canBatchArchive} title={!canBatchArchive ? '仅管理员可批量归档' : '批量归档已选流程'} className="bg-orange-500 text-white hover:bg-orange-600 [background-image:none]"><Archive size={16} />批量归档</Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-white/82 px-3 py-1.5 ring-1 ring-white/80">已选流程 {selectedIds.length} 个</span>
                <span className="rounded-full bg-white/82 px-3 py-1.5 ring-1 ring-white/80">管理员批量权限 {isAdmin ? '已开启' : '未开启'}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full">
                <TableHeader><tr><TableHead className="w-12 px-4 py-3 text-left">选择</TableHead><TableHead className="w-[28%] px-4 py-3 text-left">流程名称</TableHead><TableHead className="px-4 py-3 text-left">流程 Key</TableHead><TableHead className="px-4 py-3 text-left">分类</TableHead><TableHead className="px-4 py-3 text-left">标签</TableHead><TableHead className="w-24 px-4 py-3 text-left">版本</TableHead><TableActionHead className="w-72 px-4 py-3">操作</TableActionHead></tr></TableHeader>
                <tbody className="divide-y divide-white/60">
                  {loading ? <WorkspaceTableStateRow colSpan={7} type="loading" title="正在加载流程数据..." /> : filteredWorkflows.length === 0 ? <WorkspaceTableStateRow colSpan={7} title="暂无流程数据" description="可以先创建流程，或调整筛选条件查看其它流程定义。" /> : filteredWorkflows.map((workflow) => (
                    <tr key={workflow.id} className="border-b border-white/60 transition-colors hover:bg-white/60">
                      <td className="px-4 py-3"><Button type="button" variant="ghost" size="icon" onClick={() => handleSelectOne(workflow.id)} className="text-slate-400 hover:bg-transparent hover:text-pink-500">{selectedIds.includes(workflow.id) ? <CheckSquare size={18} className="text-pink-500" /> : <Square size={18} />}</Button></td>
                      <td className="px-4 py-4"><div className="space-y-1"><div className="text-sm font-medium text-slate-900">{workflow.name}</div><div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><span>{workflow.status === 'PUBLISHED' ? '已发布' : workflow.status === 'ARCHIVED' ? '已归档' : '草稿'}</span><span className="rounded-full bg-white/82 px-2.5 py-1 ring-1 ring-slate-200/80">ID {workflow.id}</span></div>{workflow.description ? <div className="line-clamp-1 text-xs text-slate-500">{workflow.description}</div> : null}</div></td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{workflow.key}</td>
                      <td className="px-4 py-4">{workflow.category ? <span className="inline-flex w-fit items-center gap-1 rounded-full bg-pink-50 px-2.5 py-1 text-xs font-medium text-pink-600 ring-1 ring-pink-100"><FolderOpen size={10} />{getWorkflowCategoryLabel(workflow.category) || workflow.category}</span> : <span className="text-xs text-slate-400">未分类</span>}</td>
                      <td className="px-4 py-4">{workflow.tags.length > 0 ? <div className="flex flex-wrap gap-1.5">{workflow.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 ring-1 ring-blue-100">{tag}</span>)}{workflow.tags.length > 3 ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">+{workflow.tags.length - 3}</span> : null}</div> : <span className="text-xs text-slate-400">无标签</span>}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">v{workflow.version}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-right"><TableRowActions align="end" wrap={false} className="whitespace-nowrap" actions={[{ label: '编辑', icon: <Edit size={16} />, onClick: () => navigate(`/workflow/design?id=${workflow.id}`), disabled: !isAdmin, title: isAdmin ? '编辑流程' : '仅管理员可编辑流程', tone: 'info' }, { label: '版本', icon: <RefreshCw size={16} />, onClick: () => navigate(`/workflow/versions/${workflow.id}`), title: '查看版本历史', tone: 'neutral' }, { label: '导出', icon: <FileDown size={16} />, onClick: () => openExportDialog(workflow.id), disabled: !canExportSingleWorkflow(workflow), title: canExportSingleWorkflow(workflow) ? '导出流程' : '仅流程创建者或管理员可导出', tone: 'success' }]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </WorkspaceResultCard>
        {showBatchEditModal ? (
          <WorkspaceDialogShell title={batchEditType === 'category' ? '批量修改分类' : '批量添加标签'} description="批量动作只调整选中流程的元数据，不改动节点和连线结构。" onClose={() => setShowBatchEditModal(false)} maxWidthClassName="max-w-2xl">
            <div className="space-y-4">
              <div className="rounded-[24px] border border-pink-100 bg-pink-50/80 px-4 py-3 text-sm text-slate-600">已选择 <span className="font-semibold text-pink-600">{selectedIds.length}</span> 个流程</div>
              {batchEditType === 'category' ? (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">目标分类 <span className="text-red-500">*</span></label>
                  <select value={batchCategory} onChange={(event) => setBatchCategory(event.target.value)} className="cf-glass-input h-11 w-full rounded-2xl px-3.5 text-sm text-slate-700"><option value="">请选择分类</option>{WORKFLOW_CATEGORY_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">追加标签</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={batchTagInput} onChange={(event) => setBatchTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && batchTagInput.trim()) { event.preventDefault(); addBatchTag(batchTagInput.trim()); setBatchTagInput(''); } }} placeholder="输入标签后按回车" />
                      <Button type="button" onClick={() => { if (batchTagInput.trim()) { addBatchTag(batchTagInput.trim()); setBatchTagInput(''); } }} className="bg-blue-500 text-white hover:bg-blue-600 [background-image:none]">添加</Button>
                    </div>
                  </div>
                  {batchTags.length > 0 ? <div className="space-y-2"><div className="text-sm font-medium text-slate-700">已添加标签</div><div className="flex flex-wrap gap-2">{batchTags.map((tag) => <span key={tag} className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 ring-1 ring-blue-100">{tag}<button type="button" onClick={() => removeBatchTag(tag)} className="text-blue-500 transition hover:text-blue-700"><X size={12} /></button></span>)}</div></div> : null}
                  <div className="space-y-2"><div className="text-sm font-medium text-slate-700">常用标签</div><div className="flex flex-wrap gap-2">{COMMON_TAGS.map((tag) => <Button key={tag} type="button" variant="secondary" size="sm" onClick={() => addBatchTag(tag)} disabled={batchTags.includes(tag)}>{tag}</Button>)}</div></div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2"><Button variant="outline" type="button" onClick={() => setShowBatchEditModal(false)}>取消</Button><Button type="button" onClick={batchEditType === 'category' ? handleBatchUpdateCategory : handleBatchAddTags} disabled={loading || (batchEditType === 'category' ? !batchCategory : batchTags.length === 0)}><Save size={16} />{loading ? '保存中...' : '保存'}</Button></div>
            </div>
          </WorkspaceDialogShell>
        ) : null}
        {showExportModal ? (
          <WorkspaceDialogShell title={exportType === 'single' ? '导出流程' : '批量导出流程'} description="导出文件会保留流程定义、节点和配置，可用于备份或迁移。" onClose={() => { if (!exporting) { setShowExportModal(false); } }} maxWidthClassName="max-w-2xl">
            <div className="space-y-4">
              {exportType === 'batch' ? <div className="rounded-[24px] border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-slate-600">本次将批量导出 <span className="font-semibold text-blue-600">{selectedIds.length}</span> 个流程。</div> : <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-slate-600">{currentExportWorkflow ? <div className="space-y-1"><div className="font-medium text-emerald-700">流程信息</div><div>名称：{currentExportWorkflow.name}</div><div>版本：v{currentExportWorkflow.version}</div><div>分类：{currentExportWorkflow.category ? (getWorkflowCategoryLabel(currentExportWorkflow.category) || currentExportWorkflow.category) : '未分类'}</div></div> : '未找到要导出的流程信息。'}</div>}
              <div className="rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.74))] p-4 shadow-[0_14px_28px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.72)]">
                <div className="text-sm font-medium text-slate-700">导出选项</div>
                <label className="mt-3 flex items-start gap-3"><input type="checkbox" checked={includeSensitive} onChange={(event) => setIncludeSensitive(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" /><div className="min-w-0"><div className="text-sm font-medium text-slate-700">包含敏感配置信息</div><div className="mt-1 text-xs leading-6 text-slate-500">包括 API 密钥、连接配置等敏感字段。不勾选时会做脱敏处理，适合日常备份和跨环境流转。</div></div></label>
                {includeSensitive ? <div className="mt-3 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-700">导出文件将包含敏感配置，请仅在受控环境中使用并妥善保管。</div> : null}
              </div>
              <div className="rounded-[24px] border border-blue-100 bg-blue-50/80 px-4 py-3 text-xs leading-6 text-blue-700"><div className="font-medium text-blue-800">导出说明</div><ul className="mt-2 list-disc space-y-1 pl-4"><li>导出文件为 JSON 格式，可用于备份、迁移或离线审阅。</li><li>文件名会自动带上流程名称、版本和导出日期。</li><li>批量导出会把已选流程打包成同一份文件。</li></ul></div>
              <div className="flex justify-end gap-2 pt-2"><Button variant="outline" type="button" onClick={() => setShowExportModal(false)} disabled={exporting}>取消</Button><Button type="button" onClick={handleExport} disabled={exporting}><Download size={16} />{exporting ? '导出中...' : '确认导出'}</Button></div>
            </div>
          </WorkspaceDialogShell>
        ) : null}
        {showArchiveModal ? (
          <WorkspaceDialogShell title="批量归档流程" description="归档会隐藏流程入口，但仍会保留历史数据和恢复能力。" onClose={closeArchiveModal} maxWidthClassName="max-w-2xl">
            <div className="space-y-4">
              <div className="rounded-[24px] border border-orange-100 bg-orange-50/80 px-4 py-3 text-sm text-slate-600">已选择 <span className="font-semibold text-orange-600">{selectedIds.length}</span> 个流程准备归档。</div>
              {showSafetyWarning && safetyWarnings.length > 0 ? <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-700"><div className="font-medium text-amber-800">安全警告</div><ul className="mt-2 list-disc space-y-1 pl-4">{safetyWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul><div className="mt-2 border-t border-amber-200 pt-2">请确认这些流程仍可归档。归档后可在归档管理中恢复，但默认不会继续出现在流程列表中。</div></div> : null}
              <div className="space-y-2"><label className="block text-sm font-medium text-slate-700">归档原因 <span className="text-red-500">*</span></label><Textarea rows={4} value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} placeholder="请输入归档原因，例如：流程已停用、已由新版流程替代" /><div className="text-xs text-slate-500">归档原因会记录到审计日志，便于后续追溯。</div></div>
              <div className="rounded-[24px] border border-blue-100 bg-blue-50/80 px-4 py-3 text-xs leading-6 text-blue-700"><div className="font-medium text-blue-800">归档说明</div><ul className="mt-2 list-disc space-y-1 pl-4"><li>归档后的流程会从当前列表中隐藏。</li><li>流程历史数据仍会保留，可在归档管理中恢复。</li><li>归档操作会写入审计日志，并通知对应创建者。</li></ul></div>
              <div className="flex justify-end gap-2 pt-2"><Button variant="outline" type="button" onClick={closeArchiveModal} disabled={archiving}>取消</Button><Button type="button" onClick={handleBatchArchive} disabled={archiving || !archiveReason.trim()} className="bg-orange-500 text-white hover:bg-orange-600 [background-image:none]"><Archive size={16} />{archiving ? '归档中...' : '确认归档'}</Button></div>
            </div>
          </WorkspaceDialogShell>
        ) : null}
      </div>
    </div>
  );
};