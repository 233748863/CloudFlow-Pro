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

  if (!canImport) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/workflow/management')}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="返回流程管理"
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">流程导入</h2>
            <p className="text-slate-500 mt-1 text-sm">当前账号没有导入权限，请联系管理员开通。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/workflow/management')}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="返回流程管理"
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">流程导入</h2>
            <p className="text-slate-500 mt-1 text-sm">导入流程定义文件，支持冲突策略与校验结果追踪</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">全局冲突策略</h3>
            <p className="text-xs text-slate-500">当导入流程名称已存在时的处理方式</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setGlobalConflictStrategy('skip')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                globalConflictStrategy === 'skip'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              跳过
            </button>
            <button
              onClick={() => setGlobalConflictStrategy('rename')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                globalConflictStrategy === 'rename'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              重命名
            </button>
            <button
              onClick={() => setGlobalConflictStrategy('overwrite')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                globalConflictStrategy === 'overwrite'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              覆盖
            </button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          <div className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium">
                {globalConflictStrategy === 'skip' && '跳过：保留现有流程，不导入冲突文件'}
                {globalConflictStrategy === 'rename' && '重命名：自动为导入流程生成新名称（原名_副本_序号）'}
                {globalConflictStrategy === 'overwrite' && '覆盖：替换现有流程并生成新版本，请谨慎使用'}
              </span>
            </div>
          </div>
        </div>

        {!canImportBatch && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            当前账号仅支持单文件导入，不支持批量导入。
          </div>
        )}
      </div>

      <div
        className={`bg-white rounded-xl p-8 shadow-sm border-2 border-dashed transition-all ${
          isDragging ? 'border-pink-400 bg-pink-50' : 'border-slate-300 hover:border-pink-300'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center gap-4">
          <div className={`p-4 rounded-full ${isDragging ? 'bg-pink-100' : 'bg-slate-100'}`}>
            <Upload size={32} className={isDragging ? 'text-pink-500' : 'text-slate-400'} />
          </div>

          <div className="text-center">
            <p className="text-slate-700 font-medium mb-1">拖拽文件到此处，或点击选择文件</p>
            <p className="text-xs text-slate-500">
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

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all flex items-center gap-2"
          >
            <Upload size={16} />
            选择文件
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-slate-600">
                共 <span className="font-bold text-slate-800">{stats.total}</span> 个文件
              </span>
              {stats.valid > 0 && (
                <span className="text-green-600">
                  <CheckCircle2 size={14} className="inline mr-1" />
                  {stats.valid} 个有效
                </span>
              )}
              {stats.invalid > 0 && (
                <span className="text-red-600">
                  <AlertCircle size={14} className="inline mr-1" />
                  {stats.invalid} 个无效
                </span>
              )}
              {stats.success > 0 && (
                <span className="text-blue-600">
                  <FileCheck size={14} className="inline mr-1" />
                  {stats.success} 个成功
                </span>
              )}
              {stats.failed > 0 && (
                <span className="text-orange-600">
                  <FileX size={14} className="inline mr-1" />
                  {stats.failed} 个失败
                </span>
              )}
              {stats.partial > 0 && (
                <span className="text-amber-600">
                  <AlertTriangle size={14} className="inline mr-1" />
                  {stats.partial} 个部分成功
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {stats.failed > 0 && !importing && (
                <button
                  onClick={retryFailed}
                  className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all"
                >
                  重试失败
                </button>
              )}
              <button
                onClick={clearAll}
                disabled={importing}
                className="px-3 py-1.5 text-xs bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-all disabled:opacity-50"
              >
                清空列表
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-200 max-h-96 overflow-y-auto">
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

          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                {importing && (
                  <span className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-pink-500" />
                    正在导入 {importProgress.current}/{importProgress.total}...
                  </span>
                )}
              </div>

              <button
                onClick={handleImport}
                disabled={importing || stats.valid === 0}
                className="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    导入中...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    开始导入 ({stats.valid})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {importSummary && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle2 size={20} className="text-green-500" />
            导入完成
          </h3>

          <div className="grid grid-cols-5 gap-4">
            <div className="bg-slate-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-slate-800">{importSummary.total}</div>
              <div className="text-xs text-slate-500 mt-1">总计</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{importSummary.success}</div>
              <div className="text-xs text-green-600 mt-1">成功</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{importSummary.partial}</div>
              <div className="text-xs text-amber-600 mt-1">部分成功</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">{importSummary.failed}</div>
              <div className="text-xs text-orange-600 mt-1">失败</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{importSummary.skipped}</div>
              <div className="text-xs text-blue-600 mt-1">跳过</div>
            </div>
          </div>
        </div>
      )}
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
    if (status === 'success') return 'bg-blue-100 text-blue-600';
    if (status === 'partial') return 'bg-amber-100 text-amber-700';
    if (status === 'failed') return 'bg-orange-100 text-orange-600';
    if (status === 'skipped') return 'bg-yellow-100 text-yellow-600';
    return 'bg-slate-100 text-slate-600';
  })();

  const StatusIcon = () => {
    if (status === 'validating') return <Loader2 size={16} className="animate-spin text-blue-500" />;
    if (status === 'valid') return <CheckCircle2 size={16} className="text-green-500" />;
    if (status === 'invalid') return <AlertCircle size={16} className="text-red-500" />;
    if (status === 'importing') return <Loader2 size={16} className="animate-spin text-pink-500" />;
    if (status === 'success') return <FileCheck size={16} className="text-blue-500" />;
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
              <div className="flex gap-1">
                <button
                  onClick={() => onUpdateStrategy('skip')}
                  disabled={disabled}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    conflictStrategy === 'skip'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  } disabled:opacity-50`}
                >
                  跳过
                </button>
                <button
                  onClick={() => onUpdateStrategy('rename')}
                  disabled={disabled}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    conflictStrategy === 'rename'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  } disabled:opacity-50`}
                >
                  重命名
                </button>
                <button
                  onClick={() => onUpdateStrategy('overwrite')}
                  disabled={disabled}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    conflictStrategy === 'overwrite'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  } disabled:opacity-50`}
                >
                  覆盖
                </button>
              </div>
            </div>
          )}
        </div>

        {!disabled && status !== 'importing' && (
          <button
            onClick={onRemove}
            className="text-slate-400 hover:text-red-500 transition-colors mt-1"
            title="移除"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default WorkflowImport;
