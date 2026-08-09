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
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  ImportResult,
  ValidationResult,
  importWorkflow,
  validateImportFile
} from '../../services/api/workflow';
import { useWorkflowPermission } from '../../hooks/useWorkflowPermission';
import { cn } from '@/utils/cn';
import '../../styles/features/admin-workflow.css';

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

type ConflictStrategy = 'overwrite' | 'rename' | 'skip';

interface FileWithStatus {
  id: string;
  file: File;
  status: FileStatus;
  validation?: ValidationResult;
  importResult?: ImportResult;
  conflictStrategy?: ConflictStrategy;
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
  onUpdateStrategy: (strategy: ConflictStrategy) => void;
}

const createFileId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const conflictStrategyMeta: Record<ConflictStrategy, { label: string; description: string }> = {
  skip: {
    label: '跳过',
    description: '保留现有流程，本次冲突文件记为已跳过'
  },
  rename: {
    label: '重命名',
    description: '自动生成副本名称，作为新流程导入'
  },
  overwrite: {
    label: '覆盖',
    description: '替换同名流程并创建新版本'
  }
};

const strategyKeys: ConflictStrategy[] = ['skip', 'rename', 'overwrite'];
const IMPORT_FILE_LIMIT_MB = 10;
const IMPORT_BATCH_LIMIT = 100;

const statusTextMap: Record<FileStatus, string> = {
  pending: '等待校验',
  validating: '校验中',
  valid: '校验通过',
  invalid: '校验失败',
  importing: '导入中',
  success: '导入成功',
  partial: '部分成功',
  failed: '导入失败',
  skipped: '已跳过'
};

const formatFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(2)} KB`;
};

const getStatusIcon = (status: FileStatus) => {
  if (status === 'validating' || status === 'importing') {
    return <Loader2 size={15} className="animate-spin" />;
  }
  if (status === 'valid') return <CheckCircle2 size={15} />;
  if (status === 'invalid') return <AlertCircle size={15} />;
  if (status === 'success') return <FileCheck size={15} />;
  if (status === 'partial') return <AlertTriangle size={15} />;
  if (status === 'failed') return <FileX size={15} />;
  if (status === 'skipped') return <FileWarning size={15} />;
  return <FileText size={15} />;
};

const summarizeValidation = (status: FileStatus, validation?: ValidationResult) => {
  if (!validation) {
    return status === 'validating' ? '正在读取文件结构' : '等待系统校验';
  }
  if (validation.valid) {
    return validation.workflowName || '结构完整';
  }
  return validation.errors[0] || '文件结构未通过校验';
};

const summarizeResult = (importResult?: ImportResult) => {
  if (!importResult) {
    return '暂无导入结果';
  }
  return importResult.message || importResult.errors?.[0] || importResult.warnings?.[0] || '导入请求已完成';
};

const ImportStatePanel: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, actions, className }) => (
  <div className={cn('admin-workflow-import-state', className)}>
    <div className="admin-source-stat-icon">{icon}</div>
    <strong>{title}</strong>
    <span>{description}</span>
    {actions ? <div className="admin-workflow-import-state-actions">{actions}</div> : null}
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

  const visibleItems = items?.slice(0, 2) || [];
  const hiddenCount = items && items.length > visibleItems.length ? items.length - visibleItems.length : 0;

  return (
    <div className="admin-workflow-import-feedback-group">
      <div className="admin-workflow-import-feedback-title">
        {icon}
        <span>{title}</span>
      </div>
      {value ? <p>{value}</p> : null}
      {visibleItems.map((item, index) => (
        <p key={`${title}-${index}-${item}`}>{item}</p>
      ))}
      {hiddenCount > 0 ? <p>另有 {hiddenCount} 条</p> : null}
    </div>
  );
};

interface ConflictStrategySelectorProps {
  value: ConflictStrategy;
  disabled?: boolean;
  compact?: boolean;
  onChange: (strategy: ConflictStrategy) => void;
}

const ConflictStrategySelector: React.FC<ConflictStrategySelectorProps> = ({
  value,
  disabled = false,
  compact = false,
  onChange,
}) => (
  <SegmentedControl className={cn('admin-workflow-import-segment', compact && 'compact')}>
    {strategyKeys.map((strategy) => (
      <SegmentedControlItem
        key={strategy}
        size={compact ? 'sm' : 'default'}
        active={value === strategy}
        disabled={disabled}
        onClick={() => onChange(strategy)}
      >
        {conflictStrategyMeta[strategy].label}
      </SegmentedControlItem>
    ))}
  </SegmentedControl>
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
  const [globalConflictStrategy, setGlobalConflictStrategy] = useState<ConflictStrategy>('skip');
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

  const updateConflictStrategy = (fileId: string, strategy: ConflictStrategy) => {
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
  const completedCount = stats.success + stats.partial + stats.failed + stats.skipped;
  const exceptionCount = stats.invalid + stats.failed + stats.partial;

  const importProgressPercent =
    importing && importProgress.total > 0
      ? Math.min(100, Math.round((importProgress.current / importProgress.total) * 100))
      : 0;

  const renderHeader = (showUpload = true) => (
    <header className="admin-source-header">
      <div>
        <p className="admin-source-kicker">WORKFLOW IMPORT</p>
        <h2>流程导入</h2>
        <span>校验 JSON 流程文件、处理同名冲突并执行导入队列</span>
      </div>
      <div className="admin-source-controls">
        <Button variant="outline" size="sm" onClick={() => navigate('/workflow/management')}>
          <ArrowLeft size={15} className="mr-2" />
          返回管理
        </Button>
        {showUpload ? (
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} className="mr-2" />
            选择文件
          </Button>
        ) : null}
      </div>
    </header>
  );

  if (!canImport) {
    return (
      <section className="admin-source-page admin-workflow-import-page">
        <TablePageLayout
          actions={renderHeader(false)}
          table={(
            <InnerTableSurface className="admin-workflow-import-table-panel" wrapperClassName="admin-workflow-import-empty-wrapper">
              <ImportStatePanel
                icon={<AlertTriangle size={20} />}
                title="当前账号没有流程导入权限"
                description="流程导入仅对具备相应权限的账号开放。"
              />
            </InnerTableSurface>
          )}
        />
      </section>
    );
  }

  const pageActions = (
    <>
      {renderHeader()}

      <section className="admin-source-stat-grid admin-workflow-import-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <div className="admin-source-stat-icon"><FileText size={18} /></div>
          <div><p>队列文件</p><strong>{stats.total}</strong><span>当前策略 {currentStrategyMeta.label}</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <div className="admin-source-stat-icon"><CheckCircle2 size={18} /></div>
          <div><p>可导入</p><strong>{stats.valid}</strong><span>校验通过</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <div className="admin-source-stat-icon"><Loader2 size={18} /></div>
          <div><p>待处理</p><strong>{waitingCount}</strong><span>{canImportBatch ? `批量最多 ${IMPORT_BATCH_LIMIT} 个` : '当前账号仅单文件'}</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <div className="admin-source-stat-icon"><FileCheck size={18} /></div>
          <div><p>已完成</p><strong>{completedCount}</strong><span>异常 {exceptionCount}</span></div>
        </article>
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-source-panel admin-workflow-import-workbench">
      <div className="admin-source-panel-head">
        <div>
          <h3>导入工作台</h3>
          <span>文件进入队列后先校验，校验通过后才会执行导入</span>
        </div>
        <ConflictStrategySelector value={globalConflictStrategy} onChange={setGlobalConflictStrategy} />
      </div>

      <div className="admin-workflow-import-workbench-grid">
        <div
          className={cn('admin-workflow-import-dropzone', isDragging && 'is-active')}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            className="admin-workflow-import-file-input"
            type="file"
            accept=".json,application/json"
            multiple={canImportBatch}
            onChange={(event) => {
              handleFileSelect(event.target.files);
              event.currentTarget.value = '';
            }}
          />
          <div className="admin-workflow-import-drop-icon">
            <Upload size={20} />
          </div>
          <div className="admin-workflow-import-drop-copy">
            <strong>拖拽或选择导入文件</strong>
            <span>仅支持 .json，单文件 {'<= '}{IMPORT_FILE_LIMIT_MB} MB，{canImportBatch ? `批量最多 ${IMPORT_BATCH_LIMIT} 个` : '当前账号仅单文件'}</span>
          </div>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} className="mr-2" />
            选择文件
          </Button>
        </div>

        <div className="admin-workflow-import-strategy-list">
          {strategyKeys.map((strategy) => (
            <button
              key={strategy}
              type="button"
              className={cn('admin-workflow-import-strategy-item', strategy === globalConflictStrategy && 'is-active')}
              onClick={() => setGlobalConflictStrategy(strategy)}
            >
              <strong>{conflictStrategyMeta[strategy].label}</strong>
              <span>{conflictStrategyMeta[strategy].description}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface
      className="admin-workflow-import-table-panel"
      wrapperClassName="admin-workflow-import-table-shell"
    >
      <div className="admin-workflow-import-table-toolbar">
        <div>
          <h3>导入队列</h3>
          <span>{stats.total} 个文件 · 可导入 {stats.valid} · 无效 {stats.invalid}</span>
        </div>
        <div className="admin-workflow-import-table-actions">
          {stats.failed > 0 && !importing ? (
            <Button variant="outline" size="sm" onClick={retryFailed}>
              重试失败
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={clearAll} disabled={importing || stats.total === 0}>
            清空列表
          </Button>
          <Button onClick={handleImport} disabled={importing || stats.valid === 0}>
            {importing ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                导入中
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

      {importing ? (
        <div className="admin-workflow-import-progress">
          <div>
            <span>当前进度 {importProgress.current}/{importProgress.total}</span>
            <strong>{importProgressPercent}%</strong>
          </div>
          <i style={{ width: `${importProgressPercent}%` }} />
        </div>
      ) : null}

      {importSummary ? (
        <div className="admin-workflow-import-result-strip">
          <span>最近结果</span>
          <strong>处理 {importSummary.total}</strong>
          <em>成功 {importSummary.success}</em>
          <em>部分成功 {importSummary.partial}</em>
          <em>失败 {importSummary.failed}</em>
          <em>跳过 {importSummary.skipped}</em>
        </div>
      ) : null}

      <div className="admin-workflow-import-table-scroll">
        <table className="unity-data-table admin-workflow-import-table">
          <thead>
            <tr>
              <th>文件</th>
              <th>状态</th>
              <th>校验</th>
              <th>冲突策略</th>
              <th>反馈</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {files.length > 0 ? (
              files.map((fileWithStatus) => (
                <FileItem
                  key={fileWithStatus.id}
                  fileWithStatus={fileWithStatus}
                  disabled={importing}
                  onRemove={() => removeFile(fileWithStatus.id)}
                  onUpdateStrategy={(strategy) => updateConflictStrategy(fileWithStatus.id, strategy)}
                />
              ))
            ) : (
              <tr>
                <td colSpan={6} className="admin-workflow-import-empty-cell">
                  <ImportStatePanel
                    icon={<Upload size={18} />}
                    title="导入队列为空"
                    description="先选择 JSON 文件，系统会先做校验；同名流程按上方冲突策略处理。"
                    actions={(
                      <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                        <Upload size={15} className="mr-2" />
                        选择文件
                      </Button>
                    )}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </InnerTableSurface>
  );

  return (
    <section className="admin-source-page admin-workflow-import-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageTable}
      />
    </section>
  );
};

const FileItem: React.FC<FileItemProps> = ({
  fileWithStatus,
  disabled,
  onRemove,
  onUpdateStrategy
}) => {
  const { file, status, validation, importResult, conflictStrategy } = fileWithStatus;
  const canAdjustStrategy = ['valid', 'failed', 'partial', 'skipped'].includes(status);
  const currentStrategy = conflictStrategy || 'skip';

  return (
    <tr className={cn('admin-workflow-import-row', `is-${status}`)}>
      <td>
        <div className="admin-workflow-import-file-cell">
          <span className="admin-workflow-import-file-status">{getStatusIcon(status)}</span>
          <div>
            <strong title={file.name}>{file.name}</strong>
            <span>{formatFileSize(file.size)}</span>
          </div>
        </div>
      </td>
      <td>
        <span className={cn('admin-workflow-import-status', `is-${status}`)}>
          {statusTextMap[status]}
        </span>
      </td>
      <td>
        <div className="admin-workflow-import-validation-cell">
          <strong>{summarizeValidation(status, validation)}</strong>
          <span>
            {validation?.workflowName ? `流程 ${validation.workflowName}` : '等待流程名称'}
            {validation?.version ? ` · v${validation.version}` : ''}
          </span>
          <FeedbackGroup
            title="校验错误"
            items={validation?.errors}
            icon={<AlertCircle size={12} />}
          />
          <FeedbackGroup
            title="校验警告"
            items={validation?.warnings}
            icon={<AlertTriangle size={12} />}
          />
          <FeedbackGroup
            title="不支持节点"
            value={validation?.unsupportedNodeTypes?.join(', ')}
            icon={<FileWarning size={12} />}
          />
        </div>
      </td>
      <td>
        {canAdjustStrategy ? (
          <div className="admin-workflow-import-strategy-cell">
            <ConflictStrategySelector
              value={currentStrategy}
              compact
              disabled={disabled}
              onChange={onUpdateStrategy}
            />
          </div>
        ) : (
          <span className="admin-workflow-import-muted">校验后可改</span>
        )}
      </td>
      <td>
        <div className="admin-workflow-import-result-cell">
          <strong>{summarizeResult(importResult)}</strong>
          <FeedbackGroup
            title="导入错误"
            items={importResult?.errors}
            icon={<AlertCircle size={12} />}
          />
          <FeedbackGroup
            title="导入警告"
            items={importResult?.warnings}
            icon={<AlertTriangle size={12} />}
          />
        </div>
      </td>
      <td>
        {!disabled && status !== 'importing' ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="admin-workflow-import-remove"
            title="移除文件"
            aria-label="移除文件"
          >
            <X size={15} />
          </Button>
        ) : (
          <span className="admin-workflow-import-muted">锁定</span>
        )}
      </td>
    </tr>
  );
};

export default WorkflowImport;
