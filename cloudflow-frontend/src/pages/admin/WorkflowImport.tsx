import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCheck,
  FileText,
  FileWarning,
  FileX,
  Loader2,
  Upload,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, SegmentedControl, SegmentedControlItem } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import {
  ImportResult,
  ValidationResult,
  importWorkflow,
  validateImportFile
} from '../../services/api/workflow';
import { useWorkflowPermission } from '../../hooks/useWorkflowPermission';
import { cn } from '@/utils/cn';

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
    description: '保留现有流程，本次冲突文件记为已跳过'
  },
  rename: {
    label: '重命名',
    description: '自动生成“原名称_副本_序号”，作为新流程导入'
  },
  overwrite: {
    label: '覆盖',
    description: '替换现有流程并创建新版本，影响同名流程'
  }
} as const;

const strategyKeys = ['skip', 'rename', 'overwrite'] as const;
const IMPORT_FILE_LIMIT_MB = 10;
const IMPORT_BATCH_LIMIT = 100;

const ImportStatePanel: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, actions, className }) => (
  <div className={cn('flex flex-col items-center justify-center px-5 py-10 text-center', className)}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    <div className="mt-1.5 max-w-2xl text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    {actions ? <div className="mt-3 flex flex-wrap justify-center gap-2">{actions}</div> : null}
  </div>
);

const DetailRows: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => <div className={cn('space-y-2', className)}>{children}</div>;

const DetailRow: React.FC<{
  label: string;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
}> = ({ label, value, className, valueClassName }) => (
  <div
    className={cn(
      'flex flex-col gap-1 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4 dark:border-slate-800',
      className
    )}
  >
    <div className="w-20 flex-shrink-0 text-xs leading-6 text-slate-500 dark:text-slate-400">
      {label}
    </div>
    <div className={cn('min-w-0 flex-1 text-sm leading-6 text-slate-700 dark:text-slate-200', valueClassName)}>
      {value}
    </div>
  </div>
);

const FeedbackGroup: React.FC<{
  title: string;
  items?: string[];
  value?: React.ReactNode;
  icon: React.ReactNode;
}> = ({ title, items, value, icon }) => {
  if ((!items || items.length === 0) && !value) {
    return null;
  }

  return (
    <div className="space-y-1 text-xs leading-6 text-slate-600 dark:text-slate-300">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {icon}
        <span>{title}</span>
      </div>
      {value ? <div>{value}</div> : null}
      {items?.length ? (
        <div className="space-y-0.5">
          {items.map((item, index) => (
            <div key={`${title}-${index}-${item}`} className="flex items-start gap-2">
              <span className="mt-[10px] h-1 w-1 flex-shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

interface ConflictStrategySelectorProps {
  value: 'overwrite' | 'rename' | 'skip';
  disabled?: boolean;
  compact?: boolean;
  onChange: (strategy: 'overwrite' | 'rename' | 'skip') => void;
}

const ConflictStrategySelector: React.FC<ConflictStrategySelectorProps> = ({
  value,
  disabled = false,
  compact = false,
  onChange,
}) => (
  <div className="max-w-full overflow-x-auto">
    <SegmentedControl className={cn('min-w-max flex-nowrap', compact ? 'min-h-8' : 'min-h-9')}>
      {strategyKeys.map((strategy) => {
        const active = value === strategy;
        return (
          <SegmentedControlItem
            key={strategy}
            size={compact ? 'sm' : 'default'}
            active={active}
            disabled={disabled}
            onClick={() => onChange(strategy)}
          >
            {conflictStrategyMeta[strategy].label}
          </SegmentedControlItem>
        );
      })}
    </SegmentedControl>
  </div>
);

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

  const importProgressPercent =
    importing && importProgress.total > 0
      ? Math.min(100, Math.round((importProgress.current / importProgress.total) * 100))
      : 0;

  if (!canImport) {
    return (
      <ImportStatePanel
        icon={<AlertTriangle size={20} className="text-slate-500 dark:text-slate-400" />}
        title="当前账号没有流程导入权限"
        description="流程导入仅对具备相应权限的账号开放。"
        actions={(
          <Button onClick={() => navigate('/workflow/management')}>
            <ArrowLeft size={16} className="mr-2" />
            返回流程管理
          </Button>
        )}
      />
    );
  }

  return (
    <TablePageLayout
      className="gap-2.5"
      filters={(
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>策略 {currentStrategyMeta.label}</span>
                {hasQueuedFiles ? <span>队列 {stats.total} 个</span> : null}
                {!canImportBatch ? <span>单文件</span> : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate('/workflow/management')}>
                  <ArrowLeft size={15} className="mr-2" />
                  返回管理
                </Button>
                <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={15} className="mr-2" />
                  选择文件
                </Button>
              </div>
            </div>

            <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
              <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3 dark:border-slate-800 dark:bg-slate-950/88">
                <div className="flex flex-col gap-2.5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      冲突策略
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      命中同名流程时按当前规则处理；新加入队列的文件默认继承这里的策略，队列行内仍可单独改。
                    </div>
                  </div>
                  <div className="xl:flex-shrink-0">
                    <ConflictStrategySelector
                      value={globalConflictStrategy}
                      onChange={setGlobalConflictStrategy}
                    />
                  </div>
                </div>

                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                      触发条件
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      导入文件中的流程名称已存在。
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                      当前策略
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {currentStrategyMeta.description}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 grid gap-2 xl:grid-cols-3">
                  {strategyKeys.map((strategy) => {
                    const active = strategy === globalConflictStrategy;

                    return (
                      <div
                        key={strategy}
                        className={cn(
                          'rounded-md border px-3 py-2.5 transition-colors',
                          active
                            ? 'border-cyan-200 bg-cyan-50/80 dark:border-cyan-900/70 dark:bg-cyan-950/30'
                            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/72',
                        )}
                      >
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                          {conflictStrategyMeta[strategy].label}
                        </div>
                        <div className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                          {conflictStrategyMeta[strategy].description}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                className={cn(
                  'rounded-lg border border-dashed px-4 py-3 transition-colors',
                  isDragging
                    ? 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/88',
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex min-h-[88px] flex-col justify-center gap-2.5">
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

                  <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        拖拽或选择导入文件
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>仅支持 .json</span>
                        <span>单文件 ≤ {IMPORT_FILE_LIMIT_MB} MB</span>
                        {canImportBatch ? <span>批量最多 {IMPORT_BATCH_LIMIT} 个</span> : <span>当前账号仅单文件</span>}
                        <span>校验通过后才可导入</span>
                        {hasQueuedFiles ? <span>已加入 {stats.total} 个</span> : null}
                      </div>
                    </div>

                    <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={16} className="mr-2" />
                      选择文件
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard>
          <>
            <div className="border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
              <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-900 dark:text-slate-100">
                    <span className="font-medium">导入队列</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{stats.total} 个文件</span>
                    {waitingCount > 0 ? <span className="text-xs text-slate-500 dark:text-slate-400">待处理 {waitingCount}</span> : null}
                    {stats.valid > 0 ? <span className="text-xs text-slate-500 dark:text-slate-400">可导入 {stats.valid}</span> : null}
                    {stats.invalid > 0 ? <span className="text-xs text-slate-500 dark:text-slate-400">无效 {stats.invalid}</span> : null}
                    {completedCount > 0 ? <span className="text-xs text-slate-500 dark:text-slate-400">已完成 {completedCount}</span> : null}
                  </div>
                  {importing ? (
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Loader2 size={14} className="animate-spin" />
                      当前进度 {importProgress.current}/{importProgress.total} · {importProgressPercent}%
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {stats.failed > 0 && !importing ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={retryFailed}
                    >
                      重试失败
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={clearAll} disabled={importing}>
                    清空列表
                  </Button>
                  <Button onClick={handleImport} disabled={importing || stats.valid === 0}>
                    {importing ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        导入中...
                      </>
                    ) : (
                      <>
                        <Upload size={16} className="mr-2" />
                        开始导入 ({stats.valid})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3.5 px-4 py-4">
              {files.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/88">
                  <div className="max-h-[34rem] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
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
                </div>
              ) : (
                <ImportStatePanel
                  icon={<Upload size={18} className="text-slate-500 dark:text-slate-400" />}
                  title="导入队列为空"
                  description="先选择 JSON 文件，系统会先做校验；同名流程按上方冲突策略处理。"
                />
              )}

              {importSummary ? (
                <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                  <DetailRows className="mt-3">
                    <DetailRow
                      label="最近结果"
                      value={`处理 ${importSummary.total} 个；成功 ${importSummary.success}，部分成功 ${importSummary.partial}，失败 ${importSummary.failed}，跳过 ${importSummary.skipped}`}
                    />
                  </DetailRows>
                </div>
              ) : null}
            </div>
          </>
        </TableSurfaceCard>)}
      />
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

  const canAdjustStrategy = ['valid', 'failed', 'partial', 'skipped'].includes(status);

  const StatusIcon = () => {
    if (status === 'validating') return <Loader2 size={16} className="animate-spin text-slate-500 dark:text-slate-400" />;
    if (status === 'valid') return <CheckCircle2 size={16} className="text-slate-500 dark:text-slate-400" />;
    if (status === 'invalid') return <AlertCircle size={16} className="text-slate-500 dark:text-slate-400" />;
    if (status === 'importing') return <Loader2 size={16} className="animate-spin text-slate-500 dark:text-slate-400" />;
    if (status === 'success') return <FileCheck size={16} className="text-slate-500 dark:text-slate-400" />;
    if (status === 'partial') return <AlertTriangle size={16} className="text-slate-500 dark:text-slate-400" />;
    if (status === 'failed') return <FileX size={16} className="text-slate-500 dark:text-slate-400" />;
    if (status === 'skipped') return <FileWarning size={16} className="text-slate-500 dark:text-slate-400" />;
    return <FileText size={16} className="text-slate-400 dark:text-slate-500" />;
  };

  return (
    <div className="px-3.5 py-2.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <StatusIcon />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {file.name}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {statusTextMap[status]}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{(file.size / 1024).toFixed(2)} KB</span>
                {validation?.workflowName ? (
                  <span>流程 {validation.workflowName}</span>
                ) : null}
                {validation?.version ? (
                  <span>版本 v{validation.version}</span>
                ) : null}
              </div>
            </div>

            {!disabled && status !== 'importing' ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRemove}
                className="mt-0.5 h-7 w-7 text-slate-400 hover:bg-transparent hover:text-red-500 dark:text-slate-500 dark:hover:text-red-300"
                title="移除"
              >
                <X size={16} />
              </Button>
            ) : null}
          </div>

          {validation && (
            <div className="space-y-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
              <FeedbackGroup
                title="校验错误"
                items={validation.errors}
                icon={<AlertCircle size={12} className="text-slate-400 dark:text-slate-500" />}
              />
              <FeedbackGroup
                title="校验警告"
                items={validation.warnings}
                icon={<AlertTriangle size={12} className="text-slate-400 dark:text-slate-500" />}
              />
              <FeedbackGroup
                title="不支持节点"
                value={validation.unsupportedNodeTypes?.join(', ')}
                icon={<FileWarning size={12} className="text-slate-400 dark:text-slate-500" />}
              />
            </div>
          )}

          {importResult && (
            <div className="space-y-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
              <FeedbackGroup
                title="导入反馈"
                value={importResult.message}
                icon={<FileText size={12} className="text-slate-400 dark:text-slate-500" />}
              />
              <FeedbackGroup
                title="导入错误"
                items={importResult.errors}
                icon={<AlertCircle size={12} className="text-slate-400 dark:text-slate-500" />}
              />
              <FeedbackGroup
                title="导入警告"
                items={importResult.warnings}
                icon={<AlertTriangle size={12} className="text-slate-400 dark:text-slate-500" />}
              />
            </div>
          )}

          {canAdjustStrategy ? (
            <div className="border-t border-slate-100 pt-2.5 dark:border-slate-800">
              <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  当前文件策略 {conflictStrategyMeta[conflictStrategy || 'skip'].label}
                </div>
                <ConflictStrategySelector
                  value={conflictStrategy || 'skip'}
                  compact
                  disabled={disabled}
                  onChange={onUpdateStrategy}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default WorkflowImport;
