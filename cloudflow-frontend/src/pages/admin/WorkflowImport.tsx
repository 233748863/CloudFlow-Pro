import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck,
  FileText,
  FileWarning,
  FileX,
  Info,
  Loader2,
  Upload,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import {
  WorkspaceBackdrop,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspaceStatusPage,
  workspaceGlassSurfaceClassName
} from '@/components/workspace';
import {
  ImportResult,
  ValidationResult,
  importWorkflow,
  validateImportFile
} from '../../services/api/workflow';
import { useWorkflowPermission } from '../../hooks/useWorkflowPermission';

type FileStatus =
  | 'pending'
  | 'validating'
  | 'valid'
  | 'invalid'
  | 'importing'
  | 'success'
  | 'partial'
  | 'failed'
  | 'skipped';

interface FileWithStatus {
  id: string;
  file: File;
  status: FileStatus;
  validation?: ValidationResult;
  importResult?: ImportResult;
  conflictStrategy?: 'overwrite' | 'rename' | 'skip';
}

interface ImportSummary {
  total: number;
  success: number;
  partial: number;
  failed: number;
  skipped: number;
}

interface FileItemProps {
  fileWithStatus: FileWithStatus;
  disabled: boolean;
  onRemove: () => void;
  onUpdateStrategy: (strategy: 'overwrite' | 'rename' | 'skip') => void;
}

const createFileId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const conflictStrategyMeta = {
  skip: {
    label: '跳过',
    description: '保留现有流程，不导入冲突文件',
    detail: '适合先保护现有线上流程，避免把名称冲突的定义直接写入当前空间。'
  },
  rename: {
    label: '重命名',
    description: '自动为导入流程生成新名称（原名_副本_序号）',
    detail: '适合并行比对新旧流程，先把导入结果落地成副本再做后续核验。'
  },
  overwrite: {
    label: '覆盖',
    description: '替换现有流程并生成新版本，请谨慎使用',
    detail: '适合明确以导入文件为准的修复或迁移场景，建议先确认目标流程。'
  }
} as const;

/**
 * 解析后端批量导入汇总消息：
 * 例：批量导入完成：共 3 个流程，成功 2，失败 1，跳过 0
 */
const parseBatchSummaryFromMessage = (message?: string) => {
  if (!message) return null;
  const match = message.match(/成功\s*(\d+)\s*，\s*失败\s*(\d+)\s*，\s*跳过\s*(\d+)/);
  if (!match) return null;
  return {
    success: Number(match[1]),
    failed: Number(match[2]),
    skipped: Number(match[3])
  };
};

/**
 * 统一解析导入结果状态：
 * - action=failed 或 success=false 一律视为失败；
 * - skipped 单独归类为跳过；
 * - 其余成功动作统一归类为成功。
 */
const resolveImportStatus = (result: ImportResult): FileStatus => {
  if (result.action === 'failed' || !result.success) {
    const summary = parseBatchSummaryFromMessage(result.message);
    if (summary && summary.success > 0 && summary.failed > 0) {
      // 批量文件部分成功，避免误归类为“可重试失败文件”
      return 'partial';
    }
    return 'failed';
  }
  if (result.action === 'skipped') {
    return 'skipped';
  }
  return 'success';
};

export const WorkflowImport: React.FC = () => {
  const navigate = useNavigate();
  const { canImport, canImportBatch } = useWorkflowPermission();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<FileWithStatus[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [globalConflictStrategy, setGlobalConflictStrategy] = useState<'overwrite' | 'rename' | 'skip'>('skip');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  /**
   * 校验单个文件。
   * 这里使用 fileId 而不是数组下标，避免并发上传/删除时状态串位。
   */
  const validateFile = useCallback(async (fileId: string, file: File) => {
    setFiles((prev) => prev.map((item) => (item.id === fileId ? { ...item, status: 'validating' } : item)));
    try {
      const validation = await validateImportFile(file);
      setFiles((prev) =>
        prev.map((item) =>
          item.id === fileId
            ? {
                ...item,
                status: validation.valid ? 'valid' : 'invalid',
                validation
              }
            : item
        )
      );
      if (!validation.valid) {
        toast.error(`文件 ${file.name} 校验失败`);
      }
    } catch (error) {
      console.error('文件校验失败:', error);
      const errorMessage = getErrorMessage(error, '校验请求失败，请检查网络连接');
      setFiles((prev) =>
        prev.map((item) =>
          item.id === fileId
            ? {
                ...item,
                status: 'invalid',
                validation: {
                  valid: false,
                  errors: [errorMessage],
                  warnings: []
                }
              }
            : item
        )
      );
      toast.error(`文件 ${file.name} 校验失败`);
    }
  }, []);

  /**
   * 处理文件选择/拖拽。
   * 非管理员只能单文件导入，这里会强制裁剪为 1 个文件并给出提示。
   */
  const handleFileSelect = useCallback(
    (selectedFiles: FileList | null) => {
      if (!canImport) {
        toast.error('当前账号没有导入权限');
        return;
      }
      if (!selectedFiles || selectedFiles.length === 0) {
        return;
      }

      const rawFiles = Array.from(selectedFiles);
      const limitedFiles = canImportBatch ? rawFiles : rawFiles.slice(0, 1);

      if (!canImportBatch && rawFiles.length > 1) {
        toast.warning('当前账号仅支持单文件导入，已自动保留第一个文件');
      }

      const newItems: FileWithStatus[] = limitedFiles.map((file) => ({
        id: createFileId(),
        file,
        status: 'pending',
        conflictStrategy: globalConflictStrategy
      }));

      setImportSummary(null);
      setFiles((prev) => (canImportBatch ? [...prev, ...newItems] : newItems));

      newItems.forEach((item) => {
        void validateFile(item.id, item.file);
      });
    },
    [canImport, canImportBatch, globalConflictStrategy, validateFile]
  );

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== fileId));
  };

  const updateConflictStrategy = (fileId: string, strategy: 'overwrite' | 'rename' | 'skip') => {
    setFiles((prev) => prev.map((item) => (item.id === fileId ? { ...item, conflictStrategy: strategy } : item)));
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    if (!canImport) {
      return;
    }
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (!canImport) {
      toast.error('当前账号没有导入权限');
      return;
    }
    handleFileSelect(event.dataTransfer.files);
  };

  const handleImport = async () => {
    if (!canImport) {
      toast.error('当前账号没有导入权限');
      return;
    }

    const validFiles = files.filter((item) => item.status === 'valid');
    if (validFiles.length === 0) {
      toast.error('没有可导入的有效文件');
      return;
    }
    if (!canImportBatch && validFiles.length > 1) {
      toast.error('当前账号仅支持单文件导入');
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: validFiles.length });
    setImportSummary(null);

    let successCount = 0;
    let partialCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    try {
      /**
       * 按文件顺序逐个导入，而不是并发导入：
       * - 便于和 UI 进度条保持一致；
       * - 便于在出现失败时定位具体文件；
       * - 避免后端在高并发下出现冲突策略竞争。
       */
      for (let index = 0; index < validFiles.length; index++) {
        const fileItem = validFiles[index];
        setImportProgress({ current: index + 1, total: validFiles.length });
        setFiles((prev) =>
          prev.map((item) => (item.id === fileItem.id ? { ...item, status: 'importing' } : item))
        );

        try {
          const result = await importWorkflow(
            fileItem.file,
            fileItem.conflictStrategy || globalConflictStrategy
          );

          const nextStatus = resolveImportStatus(result);

          setFiles((prev) =>
            prev.map((item) =>
              item.id === fileItem.id
                ? {
                    ...item,
                    status: nextStatus,
                    importResult: result
                  }
                : item
            )
          );

          if (nextStatus === 'success') {
            successCount++;
          } else if (nextStatus === 'partial') {
            partialCount++;
          } else if (nextStatus === 'skipped') {
            skippedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          console.error('导入失败:', error);
          failedCount++;
          setFiles((prev) =>
            prev.map((item) =>
              item.id === fileItem.id
                ? {
                    ...item,
                    status: 'failed',
                    importResult: {
                      success: false,
                      workflowName: fileItem.file.name,
                      action: 'failed',
                      errors: [getErrorMessage(error, '导入失败')]
                    }
                  }
                : item
            )
          );
        }
      }

      setImportSummary({
        total: validFiles.length,
        success: successCount,
        partial: partialCount,
        failed: failedCount,
        skipped: skippedCount
      });

      if (failedCount === 0 && partialCount === 0) {
        toast.success(`导入完成，成功 ${successCount} 个，跳过 ${skippedCount} 个`);
      } else if (failedCount === 0 && partialCount > 0) {
        toast.warning(`导入完成：成功 ${successCount} 个，部分成功 ${partialCount} 个，跳过 ${skippedCount} 个`);
      } else {
        toast.warning(`导入完成：成功 ${successCount} 个，部分成功 ${partialCount} 个，失败 ${failedCount} 个，跳过 ${skippedCount} 个`);
      }
    } catch (error) {
      console.error('批量导入失败:', error);
      toast.error('导入过程出现异常');
    } finally {
      setImporting(false);
    }
  };

  const clearAll = () => {
    setFiles([]);
    setImportSummary(null);
  };

  const retryFailed = () => {
    setFiles((prev) =>
      prev.map((item) =>
        item.status === 'failed'
          ? { ...item, status: 'valid', importResult: undefined }
          : item
      )
    );
    setImportSummary(null);
  };

  const stats = useMemo(
    () => ({
      total: files.length,
      pending: files.filter((item) => item.status === 'pending').length,
      validating: files.filter((item) => item.status === 'validating').length,
      valid: files.filter((item) => item.status === 'valid').length,
      invalid: files.filter((item) => item.status === 'invalid').length,
      importing: files.filter((item) => item.status === 'importing').length,
      success: files.filter((item) => item.status === 'success').length,
      failed: files.filter((item) => item.status === 'failed').length,
      partial: files.filter((item) => item.status === 'partial').length,
      skipped: files.filter((item) => item.status === 'skipped').length
    }),
    [files]
  );

  const currentStrategyMeta = conflictStrategyMeta[globalConflictStrategy];
  const waitingCount = stats.pending + stats.validating;
  const hasQueuedFiles = stats.total > 0;
  const completedCount = stats.success + stats.partial + stats.failed + stats.skipped;

  // 页头主卡统一从导入队列与结果中派生概览指标，便于和工作流其他页面保持同一套信息层级。
  const heroMetrics = useMemo(
    () => [
      {
        label: '队列文件',
        value: `${stats.total}`,
        hint: hasQueuedFiles ? `${canImportBatch ? '批量导入队列已建立' : '当前为单文件导入模式'}` : '尚未加入导入文件',
        icon: <FileText size={17} />
      },
      {
        label: '可导入',
        value: `${stats.valid}`,
        hint:
          waitingCount > 0 || stats.invalid > 0
            ? `校验中 ${waitingCount} · 无效 ${stats.invalid}`
            : stats.valid > 0
              ? '所有已通过校验的文件都可直接导入'
              : '等待文件完成校验',
        icon: <CheckCircle2 size={17} />
      },
      {
        label: '当前阶段',
        value: importing ? `${importProgress.current}/${importProgress.total}` : importSummary ? '已完成' : hasQueuedFiles ? '待导入' : '空队列',
        hint: importing
          ? '正在按顺序导入已校验文件'
          : importSummary
            ? `成功 ${importSummary.success} · 失败 ${importSummary.failed} · 跳过 ${importSummary.skipped}`
            : completedCount > 0
              ? `本轮已处理 ${completedCount} 个文件`
              : '拖拽或选择 JSON 文件后开始导入',
        icon: importing ? <Loader2 size={17} className="animate-spin" /> : <FileCheck size={17} />
      },
      {
        label: '冲突策略',
        value: currentStrategyMeta.label,
        hint: canImportBatch ? currentStrategyMeta.description : `单文件模式下默认使用${currentStrategyMeta.label}策略`,
        icon: <Info size={17} />
      }
    ],
    [
      canImportBatch,
      completedCount,
      currentStrategyMeta.description,
      currentStrategyMeta.label,
      hasQueuedFiles,
      importProgress.current,
      importProgress.total,
      importSummary,
      importing,
      stats.invalid,
      stats.total,
      stats.valid,
      waitingCount
    ]
  );

  if (!canImport) {
    return (
      <WorkspaceStatusPage
        icon={<AlertTriangle size={28} className="text-amber-500" />}
        title="当前账号没有流程导入权限"
        description="流程导入仅对具备相应权限的账号开放。你可以先返回流程管理页继续查看和维护流程。"
        actions={(
          <Button size="lg" onClick={() => navigate('/workflow/management')}>
            <ArrowLeft size={16} className="mr-2" />
            返回流程管理
          </Button>
        )}
        panelClassName="py-14"
      />
    );
  }

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <Download size={14} />
                Workflow Admin
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                {canImportBatch ? '支持批量导入' : '当前为单文件导入'}
              </span>
            </div>
          )}
          title="流程导入"
          description="导入流程定义 JSON，统一处理冲突策略、校验反馈和结果回看，让工作流导入页和管理页、监控页保持同一套工作区语言。"
          actions={(
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button variant="outline" size="lg" onClick={() => navigate('/workflow/management')}>
                <ArrowLeft size={15} className="mr-2" />
                返回管理
              </Button>
              <Button size="lg" onClick={() => fileInputRef.current?.click()}>
                <Upload size={15} className="mr-2" />
                选择文件
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        />

        <div className="grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <Card className={`${workspaceGlassSurfaceClassName} p-4 sm:p-5`}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">导入设置</div>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">全局冲突策略</h3>
                  <p className="mt-1 text-sm text-slate-500">当导入流程名称已存在时，统一决定保留、重命名还是覆盖。</p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500">
                  当前策略：{currentStrategyMeta.label}
                </span>
              </div>

              <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setGlobalConflictStrategy('skip')}
                  className={`rounded-lg px-4 py-2 text-xs font-medium transition ${
                    globalConflictStrategy === 'skip' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  跳过
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalConflictStrategy('rename')}
                  className={`rounded-lg px-4 py-2 text-xs font-medium transition ${
                    globalConflictStrategy === 'rename' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  重命名
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalConflictStrategy('overwrite')}
                  className={`rounded-lg px-4 py-2 text-xs font-medium transition ${
                    globalConflictStrategy === 'overwrite' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  覆盖
                </button>
              </div>

              <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-700">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl border border-cyan-200 bg-white p-2 text-cyan-600">
                    <Info size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{currentStrategyMeta.description}</div>
                    <div className="mt-1 text-xs leading-6 text-slate-500">{currentStrategyMeta.detail}</div>
                  </div>
                </div>
              </div>

              {!canImportBatch && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-700">
                  当前账号仅支持单文件导入，不支持批量导入。
                </div>
              )}
            </div>
          </Card>

          <Card
            className={`${workspaceGlassSurfaceClassName} border-2 border-dashed p-5 sm:p-6 transition-all ${
              isDragging ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className={`rounded-full border p-4 ${isDragging ? 'border-slate-300 bg-white text-slate-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                <Upload size={32} />
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">上传文件</div>
                <p className="mt-2 text-base font-semibold text-slate-900">拖拽文件到此处，或点击选择文件</p>
                <p className="mt-2 text-sm text-slate-500">
                  支持 JSON 格式流程定义文件
                  {canImportBatch ? '，可同时选择多个文件' : '，当前账号仅可选择单个文件'}
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".json,application/json"
                multiple={canImportBatch}
                onChange={(event) => {
                  handleFileSelect(event.target.files);
                  event.currentTarget.value = '';
                }}
              />

              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button size="lg" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} className="mr-2" />
                  选择文件
                </Button>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500">
                  {hasQueuedFiles ? `当前已加入 ${stats.total} 个文件` : '等待首次导入'}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {files.length > 0 && (
          <Card className={workspaceGlassSurfaceClassName}>
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">导入队列</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
                      共 {stats.total} 个文件
                    </span>
                    {stats.valid > 0 && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-600">
                        {stats.valid} 个有效
                      </span>
                    )}
                    {stats.invalid > 0 && (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-medium text-rose-600">
                        {stats.invalid} 个无效
                      </span>
                    )}
                    {stats.success > 0 && (
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] font-medium text-cyan-600">
                        {stats.success} 个成功
                      </span>
                    )}
                    {stats.failed > 0 && (
                      <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-[11px] font-medium text-orange-600">
                        {stats.failed} 个失败
                      </span>
                    )}
                    {stats.partial > 0 && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-600">
                        {stats.partial} 个部分成功
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {stats.failed > 0 && !importing && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={retryFailed}
                      className="border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 hover:text-orange-700"
                    >
                      重试失败
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAll}
                    disabled={importing}
                  >
                    清空列表
                  </Button>
                </div>
              </div>
            </div>

            <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {files.map((fileWithStatus) => (
                <FileItem
                  key={fileWithStatus.id}
                  fileWithStatus={fileWithStatus}
                  disabled={importing}
                  onRemove={() => removeFile(fileWithStatus.id)}
                  onUpdateStrategy={(strategy) => updateConflictStrategy(fileWithStatus.id, strategy)}
                />
              ))}
            </div>

            <div className="border-t border-slate-100 bg-white px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-500">
                  {importing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-slate-500" />
                      正在导入 {importProgress.current}/{importProgress.total}...
                    </span>
                  ) : (
                    <span>{stats.valid > 0 ? `已有 ${stats.valid} 个文件通过校验，可直接开始导入。` : '先完成文件校验，再执行导入。'}</span>
                  )}
                </div>

                <Button
                  size="lg"
                  onClick={handleImport}
                  disabled={importing || stats.valid === 0}
                >
                  {importing ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      导入中...
                    </>
                  ) : (
                    <>
                      <Download size={16} className="mr-2" />
                      开始导入 ({stats.valid})
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {importSummary && (
          <Card className={`${workspaceGlassSurfaceClassName} p-5 sm:p-6`}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">导入结果</div>
                  <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <CheckCircle2 size={20} className="text-emerald-500" />
                    导入完成
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">统一回看本轮导入结果，便于继续处理失败项或重复导入。</p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500">
                  本轮共处理 {importSummary.total} 个文件
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-slate-900">{importSummary.total}</div>
                  <div className="mt-1 text-xs text-slate-500">总计</div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-emerald-600">{importSummary.success}</div>
                  <div className="mt-1 text-xs text-emerald-600">成功</div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-amber-600">{importSummary.partial}</div>
                  <div className="mt-1 text-xs text-amber-600">部分成功</div>
                </div>
                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-orange-600">{importSummary.failed}</div>
                  <div className="mt-1 text-xs text-orange-600">失败</div>
                </div>
                <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-cyan-600">{importSummary.skipped}</div>
                  <div className="mt-1 text-xs text-cyan-600">跳过</div>
                </div>
              </div>
            </div>
          </Card>
        )}
      </WorkspacePageContent>
    </div>
  );
};

const FileItem: React.FC<FileItemProps> = ({
  fileWithStatus,
  disabled,
  onRemove,
  onUpdateStrategy
}) => {
  const { file, status, validation, importResult, conflictStrategy } = fileWithStatus;

  const statusTextMap: Record<FileStatus, string> = {
    pending: '等待校验',
    validating: '校验中...',
    valid: '校验通过',
    invalid: '校验失败',
    importing: '导入中...',
    success: '导入成功',
    partial: '部分成功',
    failed: '导入失败',
    skipped: '已跳过'
  };

  const statusBadgeClass = (() => {
    if (status === 'valid') return 'bg-green-100 text-green-600';
    if (status === 'invalid') return 'bg-red-100 text-red-600';
    if (status === 'success') return 'bg-cyan-50 text-cyan-600';
    if (status === 'partial') return 'bg-amber-100 text-amber-700';
    if (status === 'failed') return 'bg-orange-100 text-orange-600';
    if (status === 'skipped') return 'bg-yellow-100 text-yellow-600';
    return 'bg-slate-100 text-slate-600';
  })();

  const StatusIcon = () => {
    if (status === 'validating') return <Loader2 size={16} className="animate-spin text-cyan-600" />;
    if (status === 'valid') return <CheckCircle2 size={16} className="text-green-500" />;
    if (status === 'invalid') return <AlertCircle size={16} className="text-red-500" />;
    if (status === 'importing') return <Loader2 size={16} className="animate-spin text-slate-500" />;
    if (status === 'success') return <FileCheck size={16} className="text-cyan-600" />;
    if (status === 'partial') return <AlertTriangle size={16} className="text-amber-500" />;
    if (status === 'failed') return <FileX size={16} className="text-orange-500" />;
    if (status === 'skipped') return <FileWarning size={16} className="text-yellow-500" />;
    return <FileText size={16} className="text-slate-400" />;
  };

  return (
    <div className="p-4 hover:bg-slate-50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-1">
          <StatusIcon />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-800 truncate">{file.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${statusBadgeClass}`}>{statusTextMap[status]}</span>
          </div>

          <div className="text-xs text-slate-500 mb-2">{(file.size / 1024).toFixed(2)} KB</div>

          {validation && (
            <div className="space-y-1 mb-2">
              {validation.workflowName && (
                <div className="text-xs text-slate-600">
                  流程名称: <span className="font-medium">{validation.workflowName}</span>
                  {validation.version ? ` (v${validation.version})` : ''}
                </div>
              )}

              {validation.errors?.map((error, index) => (
                <div key={`${error}-${index}`} className="flex items-start gap-1 text-xs text-red-600">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              ))}

              {validation.warnings?.map((warning, index) => (
                <div key={`${warning}-${index}`} className="flex items-start gap-1 text-xs text-yellow-600">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}

              {!!validation.unsupportedNodeTypes?.length && (
                <div className="text-xs text-red-600">
                  不支持的节点类型: {validation.unsupportedNodeTypes.join(', ')}
                </div>
              )}
            </div>
          )}

          {importResult && (
            <div className="space-y-1 mb-2">
              {importResult.message && (
                <div
                  className={`text-xs ${
                    importResult.action === 'failed' ? 'text-red-600' : 'text-slate-600'
                  }`}
                >
                  {importResult.message}
                </div>
              )}
              {importResult.errors?.map((error, index) => (
                <div key={`${error}-${index}`} className="flex items-start gap-1 text-xs text-red-600">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              ))}
              {importResult.warnings?.map((warning, index) => (
                <div key={`${warning}-${index}`} className="flex items-start gap-1 text-xs text-yellow-600">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {status === 'valid' && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-slate-500">冲突策略:</span>
              <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => onUpdateStrategy('skip')}
                  disabled={disabled}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                    conflictStrategy === 'skip'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  } disabled:opacity-50`}
                >
                  跳过
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateStrategy('rename')}
                  disabled={disabled}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                    conflictStrategy === 'rename'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  } disabled:opacity-50`}
                >
                  重命名
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateStrategy('overwrite')}
                  disabled={disabled}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                    conflictStrategy === 'overwrite'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  } disabled:opacity-50`}
                >
                  覆盖
                </button>
              </div>
            </div>
          )}
        </div>

        {!disabled && status !== 'importing' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="text-slate-400 hover:text-red-500 hover:bg-transparent mt-1"
            title="移除"
          >
            <X size={16} />
          </Button>
        )}
      </div>
    </div>
  );
};

export default WorkflowImport;
